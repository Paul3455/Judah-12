# CampusCheck — API specification

Base URL `/api`. JSON in, JSON out (exports return files). Auth uses two httpOnly cookies: `cc_at` (access, 15 min) and `cc_rt` (refresh, 7 days, rotating). State-changing requests must come from the app's own origin (Origin/Host check) and are rate-limited.

**Error shape**

```json
{ "error": { "code": "already_checked_in", "message": "You are already checked in to this session.", "details": {} } }
```

| Status | Meaning |
| --- | --- |
| 400 | Validation failed (`details.fields`) |
| 401 | Not signed in / token expired (`code: unauthenticated`) |
| 403 | Wrong role or not the owner of the object (`code: forbidden`) |
| 404 | Not found or not visible to this user |
| 409 | Duplicate check-in |
| 422 | Business rule refused (window closed, geofence failed, …) |
| 429 | Rate limited |

## Auth — `/api/auth`

| Method | Path | Roles | Notes |
| --- | --- | --- | --- |
| POST | `/register` | public | `{name,email,password,matricNumber,program,level,department}` — student only, any email address accepted. Returns `{user, verificationUrl}` in dev. |
| POST | `/verify-email` | public | `{token}` → activates account. |
| POST | `/login` | public | `{email,password}` → sets cookies, returns `{user}`. 10 attempts / 15 min / IP. |
| POST | `/refresh` | cookie | Rotates refresh token, issues a new access token. |
| POST | `/logout` | auth | Revokes the refresh token and clears cookies. |
| GET | `/me` | auth | `{user}` with student/lecturer profile. |
| POST | `/change-password` | auth | `{currentPassword,newPassword}`; revokes all refresh tokens. |

## Timetable — `/api/timetable`

| Method | Path | Roles | Notes |
| --- | --- | --- | --- |
| GET | `/?week=YYYY-MM-DD` | student | Weekly schedule: course schedule slots + scheduled sessions. |

## Courses — `/api/courses`

| Method | Path | Roles | Notes |
| --- | --- | --- | --- |
| GET | `/` | any auth | Students: enrolled. Lecturers: owned. Admins: all. |
| POST | `/` | lecturer, admin | `{code,title,departmentId,lecturerId?,semester,schedule,venue,geofence:{enabled,lat,lng,radiusM}}` |
| GET | `/:id` | member/owner/admin | Includes lecturer name, enrolled count, session count. |
| PATCH | `/:id` | owner, admin | Partial update of the same fields. |
| GET | `/:id/students` | owner, admin | Enrolled students with matric, program, level. |
| POST | `/:id/enroll` | owner, admin | `{studentIds: uuid[]}` idempotent. |
| DELETE | `/:id/enroll/:studentId` | owner, admin | Removes enrolment. |

## Sessions — `/api/sessions`

| Method | Path | Roles | Notes |
| --- | --- | --- | --- |
| GET | `/?courseId=&from=&to=` | owner/admin; students see own enrolled sessions | |
| POST | `/` | owner, admin | `{courseId,date,startTime,endTime,venue,checkInOpensAt?,checkInClosesAt?,requireGeofence?}` — defaults: opens 15 min before start, closes at end. |
| GET | `/:id` | owner/admin; enrolled student (limited) | Session + counts. |
| PATCH | `/:id` | owner, admin | Times, venue, geofence. |
| POST | `/:id/open` | owner, admin | `scheduled → open`; notifies enrolled students "session starting". |
| POST | `/:id/close` | owner, admin | `open → closed`; materialises `absent` for non-checked-in students and notifies them. |
| GET | `/:id/code` | owner, admin | `{step, expiresAt, code6, qrPayload, qrImage}` — rotates every 45 s (server clock). |
| GET | `/:id/live` | owner, admin | Counts + per-student rows for polling (5 s client interval). |

## Attendance — `/api/attendance`

| Method | Path | Roles | Notes |
| --- | --- | --- | --- |
| POST | `/check-in` | student | `{sessionId?, qrPayload?, code?, deviceId, location?:{lat,lng}}`. Accepts QR payload **or** 6-digit code. 20 req/min/user. |
| GET | `/me?courseId=` | student | Own records with course info. |
| GET | `/me/summary` | student | Per-course: held, attended, percentage, threshold, warning flag. |
| PATCH | `/:id` | owner, admin | `{status, reason}` — reason required; writes audit log + notifies student. |
| POST | `/sessions/:id/mark-absent` | owner, admin | Idempotent materialisation of missing students as `absent`. |

## Reports — `/api/reports`

| Method | Path | Roles | Notes |
| --- | --- | --- | --- |
| GET | `/summary?from=&to=&departmentId=&courseId=&lecturerId=&studentId=` | lecturer/admin | Overall counts, per-course, per-department, per-lecturer, per-student, daily trend, top flagged rows. |
| GET | `/export?format=csv|xlsx&…same filters` | lecturer/admin | Streamed file. Lecturers are restricted to their own courses. |

## Admin — `/api/admin`

| Method | Path | Roles | Notes |
| --- | --- | --- | --- |
| GET/POST | `/departments` | admin | |
| GET | `/users?role=&q=&status=` | admin | |
| POST | `/users` | admin | `{name,email,role,password,departmentId,staffId?,matricNumber?,program?,level?}` |
| PATCH | `/users/:id` | admin | `{role?,status?,departmentId?,name?}` |
| GET | `/audit?entityType=&entityId=&actorId=&from=&to=` | admin | Newest 200. |
| GET/PUT | `/settings` | admin | Retention days, warning threshold, late grace, QR step seconds. |
| POST | `/retention/purge` | admin | Applies the configured retention rule now. |

## Notifications — `/api/notifications`

| Method | Path | Notes |
| --- | --- | --- |
| GET | `/` | Own notifications, newest 50, with unread count. |
| POST | `/:id/read` | Marks one read. |
| POST | `/read-all` | Marks all read. |

## Health

`GET /api/health` → `{status:"ok"}` · `GET /api/ready` → includes a database round-trip.

## Dynamic code format

```
timeStep   = floor(serverUnixMs / (stepSeconds * 1000))
code6      = HMAC-SHA256(qr_secret, `${sessionId}.${timeStep}`) mod 10^6, zero-padded
qrPayload  = "CC1.<sessionId>.<timeStep>.<base64url(HMAC-SHA256(qr_secret, `qr.${sessionId}.${timeStep}`))[0:16]>"
```

A submitted code is accepted only when its time step is the current one or the immediately previous one, which tolerates a scanner/typing delay without extending the window meaningfully.
