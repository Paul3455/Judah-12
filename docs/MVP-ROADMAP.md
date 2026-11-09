# CampusCheck — prioritised MVP plan (6 weeks) and first implementation plan

## Prioritisation rules

**P0** = the app is not usable without it. **P1** = needed for a trustworthy pilot (fraud, audit, reporting). **P2** = valuable, can slip a cycle without blocking the pilot.

## What shipped in this branch

Everything marked ✅ is implemented and running in this repository: API, database, web client, docs, tests, compose.

### Week 1 — Foundation and auth (P0) ✅
| # | Item | Pri |
| --- | --- | --- |
| 1 | Postgres schema + migrations + seed | P0 ✅ |
| 2 | Email/password sign-up with any email address and a free-text department | P0 ✅ |
| 3 | Email verification (single-use token, 24 h) | P0 ✅ |
| 4 | JWT access (15 min) + rotating refresh (7 d) in httpOnly cookies | P0 ✅ |
| 5 | Role middleware + per-object ownership checks | P0 ✅ |
| 6 | Rate limiting on auth and check-in | P0 ✅ |
| 7 | Audit log infrastructure | P1 ✅ |

### Week 2 — Courses, enrolment, timetable (P0) ✅
| # | Item | Pri |
| --- | --- | --- |
| 8 | Department / lecturer / course CRUD | P0 ✅ |
| 9 | Enrolment management | P0 ✅ |
| 10 | Student weekly timetable | P1 ✅ |
| 11 | Admin user management (create lecturer/admin, roles, suspend) | P0 ✅ |

### Week 3 — Sessions and rotating codes (P0) ✅
| # | Item | Pri |
| --- | --- | --- |
| 12 | Session create/edit with check-in window | P0 ✅ |
| 13 | Open/close session lifecycle | P0 ✅ |
| 14 | Signed, rotating QR payload + 6-digit code (45 s) | P0 ✅ |
| 15 | Lecturer one-screen QR display with live countdown | P0 ✅ |

### Week 4 — Check-in and correctness (P0) ✅
| # | Item | Pri |
| --- | --- | --- |
| 16 | QR scan / 6-digit code check-in | P0 ✅ |
| 17 | Duplicate prevention (unique constraint + 409) | P0 ✅ |
| 18 | Present / Late / Absent / Excused statuses | P0 ✅ |
| 19 | Optional geofence, distance computed server-side, no raw coordinates | P1 ✅ |
| 20 | Device-hash reuse and out-of-venue flagging | P1 ✅ |
| 21 | Offline queue + replay on reconnect | P1 ✅ |
| 22 | Live lecturer attendance view (5 s poll) | P0 ✅ |

### Week 5 — Records, audit, reporting (P1) ✅
| # | Item | Pri |
| --- | --- | --- |
| 23 | Manual override with mandatory reason + audit entry | P0 ✅ |
| 24 | Student dashboard: timetable, per-course %, warning threshold | P0 ✅ |
| 25 | Admin analytics: course / department / lecturer / student / date range | P1 ✅ |
| 26 | CSV + XLSX export | P1 ✅ |
| 27 | Notifications: session starting, missed class, correction, low attendance | P1 ✅ |

### Week 6 — Hardening, privacy, pilot (P0/P1) ✅
| # | Item | Pri |
| --- | --- | --- |
| 28 | Retention settings + purge job | P1 ✅ |
| 29 | Privacy notice page | P0 ✅ |
| 30 | Unit tests (codes, geo, exports) + test plan | P0 ✅ |
| 31 | Docker dev/staging/prod guidance, README | P0 ✅ |
| 32 | Dark mode, empty/loading/error states, accessibility pass | P1 ✅ |

## Deliberately deferred (P2, next cycle)

- Native mobile app packaging (React Native/Flutter) — the mobile web client is the pilot vehicle.
- Push notifications (FCM/APNs) — in-app + email ship now; push needs device tokens and an app shell.
- Bulk CSV import of students and enrolments (admin currently creates users one at a time + enrols by id/email).
- Lecturer "excused absence" request workflow with document upload.
- Multi-campus / faculty hierarchy, timetable import from the registry system.
- Attendance anomaly ML, biometrics, offline lecturer session control.

## First implementation plan (executed in this branch)

### Phase 1 — Authentication and roles
1. `users`/`students`/`lecturers`/`refresh_tokens`/`email_verification_tokens` tables.
2. bcrypt hashing, verification token (hashed, single-use).
3. Access/refresh cookies, rotation, revocation, `GET /auth/me`.
4. `authenticate` + `requireRole` middleware; ownership helpers on courses and sessions.
5. Rate limits; same-origin check on mutations; security headers.
**Acceptance:** sign in as each role, land on the right dashboard, 403 on cross-role access, suspended user cannot log in.

### Phase 2 — Courses and session management
1. Departments, courses, enrolments (+ admin CRUD).
2. Sessions with check-in windows; open/close state machine.
3. Lecturer dashboard: create session in a dialog, session list with status.
**Acceptance:** lecturer creates a session and opens it; student sees it on the timetable; enrolment drives check-in eligibility.

### Phase 3 — QR check-in
1. `qr_secret` per session; HMAC code derivation per 45 s step.
2. `GET /sessions/:id/code` returning code, QR image, expiry; auto-rotation on the client.
3. `POST /attendance/check-in` with signature + window + enrolment + duplicate + geofence + device checks.
4. Live attendance polling; absentees materialised on close.
**Acceptance:** check-in works with QR and with code; reuse of an expired code fails; second check-in returns 409; a non-enrolled student is refused.

### Phase 4 — Records and reports
1. Audited manual override with reason.
2. Student summary (held/attended/percentage/warning).
3. Admin analytics with filters; CSV/XLSX export.
4. Notifications on open, close (missed class), override, low attendance.
**Acceptance:** override appears in the audit trail and in the student's notification list; exports open in Excel; percentage matches the records shown.
