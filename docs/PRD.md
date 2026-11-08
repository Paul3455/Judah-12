# CampusCheck — Product Requirements Document

**Version** 1.0 (MVP) · **Owner** Product · **Status** Approved for build

## 1. Problem

Universities still take attendance by calling names or passing a paper sheet. That wastes 5–10 minutes of every lecture, produces records nobody can audit, makes attendance percentages unreliable at the end of semester, and is trivially forged ("sign for me"). Lecturers have no live view of who is actually in the room, and administrators cannot answer questions like "which department has the worst attendance" without manual spreadsheets.

## 2. Goal

Let a student check in to a lecture in under 10 seconds with three taps, while giving lecturers a trustworthy, live, auditable attendance record and giving administrators system-wide reporting.

### Success metrics

| Metric | Target at end of pilot |
| --- | --- |
| Median student check-in time | < 10 s, ≤ 3 taps |
| Check-ins completed on first attempt | ≥ 95 % |
| Sessions with a recorded attendance sheet | 100 % of sessions started in-app |
| Attendance disputes resolved from the audit trail | 100 % |
| Lecturer session setup (open + show code) | ≤ 2 screens, < 30 s |
| Check-in fraud (shared code / duplicate) blocked | 100 % of duplicate attempts |

## 3. Non-goals (MVP)

- Not a full LMS: no assignments, grades, or content delivery.
- No native app store release: the mobile client ships as a mobile-first responsive web app (installable PWA-ready), not React Native/Flutter, so one codebase serves students, lecturers and admins in this cycle.
- No biometric attendance, no face recognition.
- No offline *lecturer* session control (offline is student check-in queueing only).
- No payments, no SMS channel.

## 4. Personas

**Ada — 300-level Computer Science student.** Low-end Android, campus Wi-Fi that drops in lecture halls. Wants: see her timetable, check in fast, know if she is at risk of being barred from exams.

**Dr. Okafor — lecturer, 2 courses, 240 students.** Wants: open today's session in one screen, project a code that cannot be photographed and reused next week, see who is in the room live, fix a mistake with a reason attached.

**Ngozi — faculty administrator.** Wants: correct enrolment data, lecturers and students in the right department, and reports by course/department/date that she can put in front of a senate committee.

## 5. Roles and permissions (least privilege)

| Capability | Student | Lecturer | Admin |
| --- | --- | --- | --- |
| View own timetable / attendance % | ✅ | – | – |
| Check in to a session | ✅ own enrolment | – | – |
| View a session's live attendance | own record | ✅ own sessions | ✅ all |
| Create/edit courses | – | ✅ own | ✅ all |
| Create/open/close sessions | – | ✅ own courses | ✅ all |
| Override an attendance record | – | ✅ own sessions, reason required | ✅ all, reason required |
| Export attendance | – | ✅ own courses | ✅ all |
| Manage departments / users / roles | – | – | ✅ |
| Set retention rules, view audit trail | – | own session changes | ✅ |

Every check is enforced server-side. Object ownership is verified on each request (no insecure direct object references); a lecturer cannot read or mutate another lecturer's session by guessing its id.

## 6. Functional requirements

### 6.1 Authentication
- FR-1 Email + password sign-up for students, restricted to university email domains (`UNIVERSITY_EMAIL_DOMAINS`).
- FR-2 Email verification required before first login; verification link is single-use and expires in 24 h.
- FR-3 Passwords hashed with bcrypt (cost 10). Minimum 8 characters.
- FR-4 Short-lived access token (15 min, httpOnly cookie) + rotating refresh token (7 days, httpOnly cookie, hashed at rest, revocable).
- FR-5 Login and check-in endpoints rate-limited per IP and per account. Repeated failures are logged.
- FR-6 Logout revokes the refresh token.

### 6.2 Courses and timetable
- FR-7 Course: code, title, department, semester, lecturer, schedule, venue, geofence settings.
- FR-8 Students are enrolled per course per semester; enrolments drive who can check in.
- FR-9 Students see a weekly timetable derived from course schedules plus scheduled sessions.

### 6.3 Sessions and dynamic codes
- FR-10 Lecturer creates a session with date, start/end time, venue, and a check-in window (default: opens 15 min before start, closes at end).
- FR-11 Starting a session generates server-side signed, rotating check-in credentials:
  - a 6-digit numeric code, and
  - a QR payload bound to `session_id + time-step + HMAC signature`.
- FR-12 Codes rotate every 45 s (configurable 30–60 s) and are accepted only for the current and previous window, then expire. A code is useless for any other session or date.
- FR-13 Lecturer screen shows the QR and the numeric code, a live countdown to rotation, and refreshes automatically.
- FR-14 Sessions move `scheduled → open → closed`; closing materialises `absent` records for enrolled students who never checked in.

### 6.4 Check-in
- FR-15 A student checks in by scanning the QR (camera) or typing the 6-digit code.
- FR-16 Server validates: session open, inside the check-in window, enrolment, no duplicate, code signature/step valid.
- FR-17 Status is `present` inside the on-time window, `late` after the grace period (default 10 min after start).
- FR-18 Optional geofence: with the student's permission, distance to the venue is computed **server-side**; only the resulting distance and a verified boolean are stored, never raw coordinates.
- FR-19 Duplicate check-ins are rejected with a clear message and never overwrite the first record.
- FR-20 Offline: a check-in attempted without connectivity is queued locally and replayed automatically on reconnect; the server applies the same rules (including a late window), so queued submissions cannot be used to fake presence.

### 6.5 Attendance management and audit
- FR-21 Lecturer dashboard: present / late / absent / excused counts, student list, per-session history, manual override.
- FR-22 Every override requires a reason and writes an audit entry (actor, action, entity, old → new value, timestamp, IP).
- FR-23 Attendance changes create a notification for the affected student.
- FR-24 Suspicious patterns are flagged on the record: same device hash used by multiple students in one session, location outside the venue, check-in submitted far outside the window.

### 6.6 Student dashboard
- FR-25 Weekly timetable, per-course attendance percentage (attended ÷ held sessions), status per course, warning threshold (default 75 %).

### 6.7 Admin
- FR-26 Manage departments, users (create lecturer/admin, change role, suspend), enrolments.
- FR-27 Analytics filtered by date range, department, course, lecturer, student.
- FR-28 CSV and XLSX export of attendance rows.
- FR-29 Audit trail viewer with filters.
- FR-30 Configure retention period for attendance and location-verification data.

### 6.8 Notifications
- FR-31 In-app notifications for: session starting, missed class, low attendance warning, attendance correction.
- FR-32 Email delivery over SMTP when configured; otherwise rendered to the server log in development (never silently dropped — the in-app copy always exists).

## 7. Anti-fraud

| Threat | Mitigation |
| --- | --- |
| Photographing a static code and sharing it later | Codes are HMAC-bound to session + 45 s time-step; only current/previous step accepted |
| Sharing the numeric code in a group chat | Same rotation; 6-digit space (10⁶) makes guessing infeasible at 2 windows and is rate-limited |
| One student checking in twice | `unique(session_id, student_id)` constraint + explicit 409 |
| Signing in for a friend | Device-hash reuse across students in a session is flagged; optional geofence |
| Check-in from home | Optional venue geofence (distance computed server-side, configurable radius) |
| Tampering with records after the fact | All mutations go through the API and are audited; actors cannot delete audit rows |
| Brute-force against auth/check-in | Rate limits (10 auth attempts / 15 min / IP; 20 check-ins / min / user) |

## 8. Privacy

- Collected: name, university email, matric/staff number, programme, level, department, enrolment, attendance status and timestamps, check-in method, device hash (HMAC of a random client id — not a hardware id), and a distance-in-metres for geofenced check-ins.
- **Not** collected: raw GPS traces, continuous location, contacts, photos, biometrics.
- Location data is never stored as coordinates; only `location_verified` + `location_distance_m` on the record that needed it.
- Retention: attendance records and location verification fields are deleted or anonymised after the configured period (default 365 days; admins can change it). Audit logs retained 24 months.
- Access: a student sees only their own records; a lecturer sees only their own sessions; admins see all.
- Plain-language notice at `/privacy`, linked from the check-in screen and the sign-up form.

## 9. UX requirements

- Mobile-first, works at 360 px, no horizontal scroll.
- Student check-in ≤ 3 taps from the dashboard.
- Lecturer: open session and display the code on one screen, readable from the back of a lecture hall (large QR, large code).
- Explicit loading, empty and error states; confirmation for destructive or corrective actions.
- Dark mode, persisted per device; respects `prefers-color-scheme` by default.
- Accessible: semantic landmarks, labels on every input, visible focus, AA contrast, `aria-live` for the rotating countdown and check-in result.
- Tolerates low-end Android and flaky Wi-Fi: no heavy bundles, no polling faster than 5 s, offline queue with a visible banner.

## 10. Constraints and risks

| Risk | Mitigation |
| --- | --- |
| QR scanning unavailable in some mobile browsers | Manual 6-digit code always available; feature-detect `BarcodeDetector` |
| Campus Wi-Fi drops mid-check-in | Client queue + idempotent server rules; duplicate-safe |
| Lecturers share the numeric code externally | Rotation + optional geofence + device flagging; report flags to admin |
| Time skew between phone and server | Codes validated on the server clock only |
| Enrolment data out of date | Admin bulk enrolment; check-in blocked with an actionable message |

## 11. MVP scope (this cycle)

Authentication + roles, course/session management, rotating QR/6-digit check-in with duplicate and geofence enforcement, attendance dashboard with audited overrides, student dashboard with percentages, admin analytics with CSV/XLSX export, audit log, notifications (in-app + email when SMTP is configured), retention settings, privacy notice.
