# CampusCheck — Database schema

PostgreSQL 16. DDL lives in [`server/db/migrations/001_init.sql`](../server/db/migrations/001_init.sql) and is applied at container start by `server/scripts/migrate.js`.

Design rules:

- UUID primary keys (`gen_random_uuid()`) so ids are unguessable — no sequential ids leaking object counts or enabling enumeration.
- Case-insensitive unique email (functional unique index on `lower(email)`); no extension dependency.
- One attendance row per `(session, student)` enforced by a unique constraint — the hard guarantee behind "no duplicate check-in".
- Location stored as **derived data only** (`location_verified`, `location_distance_m`); raw coordinates never persist.
- Every mutation of attendance is mirrored into `audit_logs` in the same transaction.

## Entity relationships

```
departments 1─┬─* users (department_id)
              ├─* courses (department_id)
              └─* lecturers (department_id)

users 1─1 students ──┐
users 1─1 lecturers ─┤
                     ├─* enrollments *── courses
                     │
courses 1─* sessions *── lecturers(users)
courses 1─* enrollments
sessions 1─* attendance_records *── students(users)
users 1─* refresh_tokens / notifications / email_verification_tokens
users 1─* audit_logs (actor)
```

## Tables

### `departments`
| Column | Type | Notes |
| --- | --- | --- |
| id | uuid PK | |
| name | text unique not null | e.g. "Computer Science" |
| code | text unique not null | e.g. "CSC" |
| created_at | timestamptz | |

### `users`
| Column | Type | Notes |
| --- | --- | --- |
| id | uuid PK | |
| name | text | |
| email | text | unique on `lower(email)`; any address accepted at sign-up |
| password_hash | text | bcrypt |
| role | text | `student` \| `lecturer` \| `admin` |
| department_id | uuid → departments | |
| status | text | `pending` (awaiting email verification) \| `active` \| `suspended` |
| email_verified_at | timestamptz | |
| created_at / updated_at | timestamptz | |

### `students`
| Column | Type | Notes |
| --- | --- | --- |
| user_id | uuid PK → users | |
| matric_number | text unique | |
| program | text | |
| level | int | 100–700 |
| department | text | typed by the student at sign-up; the official `department_id` link is set later by an admin |

### `lecturers`
| Column | Type | Notes |
| --- | --- | --- |
| user_id | uuid PK → users | |
| staff_id | text unique | |
| department_id | uuid → departments | |

### `courses`
| Column | Type | Notes |
| --- | --- | --- |
| id | uuid PK | |
| code | text unique | e.g. "CSC 301" |
| title | text | |
| department_id | uuid → departments | |
| lecturer_id | uuid → users | |
| semester | text | e.g. "2026/2027-1" |
| schedule | text | e.g. "Mon 10:00-12:00" (drives the student timetable) |
| venue | text | |
| geofence_enabled | bool | |
| geofence_lat / geofence_lng | double precision | venue centre, nullable |
| geofence_radius_m | int | default 150 |
| created_at | timestamptz | |

### `enrollments`
| Column | Type | Notes |
| --- | --- | --- |
| id | uuid PK | |
| student_id | uuid → users | |
| course_id | uuid → courses | |
| semester | text | |
| created_at | timestamptz | |
| | | unique `(student_id, course_id, semester)` |

### `sessions`
| Column | Type | Notes |
| --- | --- | --- |
| id | uuid PK | |
| course_id | uuid → courses | |
| lecturer_id | uuid → users | |
| date | date | |
| start_time / end_time | timestamptz | |
| venue | text | |
| check_in_opens_at / check_in_closes_at | timestamptz | |
| status | text | `scheduled` \| `open` \| `closed` \| `cancelled` |
| qr_secret | text | per-session random secret used for code derivation |
| require_geofence | bool | |
| created_at | timestamptz | |

### `attendance_records`
| Column | Type | Notes |
| --- | --- | --- |
| id | uuid PK | |
| session_id | uuid → sessions | |
| student_id | uuid → users | |
| status | text | `present` \| `late` \| `absent` \| `excused` |
| checked_in_at | timestamptz | null for absent |
| check_in_method | text | `qr` \| `code` \| `manual` |
| location_verified | bool | null when not required |
| location_distance_m | int | rounded metres; **no coordinates** |
| device_id_hash | text | HMAC of a client-generated random id |
| override_reason | text | required on manual change |
| recorded_by | uuid → users | staff member who recorded/overrode |
| flagged | bool | |
| flag_reason | text | e.g. `shared_device`, `outside_venue` |
| created_at / updated_at | timestamptz | |
| | | **unique `(session_id, student_id)`** |

### `audit_logs`
| Column | Type | Notes |
| --- | --- | --- |
| id | bigserial PK | append-only |
| actor_id | uuid → users | |
| action | text | `attendance.check_in`, `attendance.override`, `session.open`, … |
| entity_type | text | `attendance_record`, `session`, `user`, … |
| entity_id | uuid | |
| old_value / new_value | jsonb | changed fields only, no secrets |
| reason | text | |
| ip | text | |
| created_at | timestamptz | |

### `refresh_tokens`
`id`, `user_id`, `token_hash` (sha256, unique), `expires_at`, `revoked_at`, `created_at`, `user_agent`.

### `email_verification_tokens`
`id`, `user_id`, `token_hash` (unique), `expires_at`, `used_at`, `created_at`.

### `notifications`
`id`, `user_id`, `type` (`session_starting` \| `missed_class` \| `low_attendance` \| `attendance_corrected` \| `system`), `title`, `body`, `data` jsonb, `read_at`, `created_at`.

### `app_settings`
`key` text PK, `value` jsonb, `updated_by`, `updated_at`. Seeds `retention.attendance_days` (365), `attendance.warning_threshold` (75), `attendance.late_grace_minutes` (10), `checkin.qr_step_seconds` (45).

## Indexes

- `users (lower(email))` unique; `users (role, department_id)`
- `attendance_records (session_id)`, `(student_id)`, `(session_id, device_id_hash)`
- `sessions (course_id, start_time desc)`, `sessions (status, check_in_closes_at)`
- `enrollments (course_id, student_id)`, `(student_id)`
- `audit_logs (entity_type, entity_id)`, `(actor_id, created_at desc)`
- `notifications (user_id, read_at, created_at desc)`

## Retention

`GET/PUT /api/admin/settings` exposes the retention period. `POST /api/admin/retention/purge` (admin) deletes `attendance_records` older than the configured period and nulls the location-verification fields on records that survive but whose session is older than the same period. Audit logs are retained for 24 months, independent of attendance retention, so that deletions themselves remain provable.
