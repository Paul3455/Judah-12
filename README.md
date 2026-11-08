# CampusCheck

Secure university attendance: students check in to a lecture with a rotating code in three taps, lecturers see live
attendance and can correct records with an audit trail, administrators get institution-wide reporting.

- **Mobile-first web app** (React 18 + Vite) for students, lecturers and administrators
- **API**: Node.js 22 + Express, PostgreSQL 16, JWT access tokens + rotating refresh tokens in httpOnly cookies
- **Rotating check-in codes**: HMAC-signed QR payload and a derived six-digit code, rebuilt every 45 seconds
- **Auditable**: every attendance change records who, when and why

## Run it

```bash
docker compose -f docker-compose.base44.yml up -d --build
docker compose -f docker-compose.base44.yml ps
```

Open <http://localhost:3000>. The `api` container installs dependencies, applies migrations, seeds demo data (only when
the database is empty) and runs `node --watch`; the `web` container runs Vite and proxies `/api` to the API, so the
browser only ever talks to one origin (required for cookie auth).

### Demo accounts (password `Campus123!`)

| Role | Email | Sees |
| --- | --- | --- |
| Student | `ada.student@campus.edu` | timetable, attendance %, check-in |
| Lecturer | `okafor@campus.edu` | live session with QR + code, reports |
| Administrator | `admin@campus.edu` | analytics, people, audit, retention |

Seed data includes a **live CSC 301 session** so a check-in can be demonstrated immediately: sign in as the lecturer,
open **Sessions → live session → QR**, then sign in as the student in another browser and type the six digits.

### Tests

```bash
docker compose -f docker-compose.base44.yml exec -T api npm test
```

Covers code derivation/verification windows (including offline replay), QR signature rejection, geofence maths, and CSV/XLSX
generation — see [`docs/TEST_PLAN.md`](docs/TEST_PLAN.md) for the integration, security and usability matrix.

## Documentation

| Document | Contents |
| --- | --- |
| [`docs/PRD.md`](docs/PRD.md) | Product requirements, personas, permissions, anti-fraud, privacy, success metrics |
| [`docs/DATABASE.md`](docs/DATABASE.md) | Schema, relationships, indexes, retention (`server/db/migrations/001_init.sql`) |
| [`docs/API.md`](docs/API.md) | Every endpoint, roles, error format, dynamic code format |
| [`docs/WIREFRAMES.md`](docs/WIREFRAMES.md) | Student, lecturer and admin flows with states |
| [`docs/MVP-ROADMAP.md`](docs/MVP-ROADMAP.md) | Prioritised 6-week MVP list and the implementation plan that was executed |
| [`docs/TEST_PLAN.md`](docs/TEST_PLAN.md) | Unit, integration, security, usability and performance tests |
| [`docs/DEPLOYMENT.md`](docs/DEPLOYMENT.md) | Dev/staging/production, secrets, TLS, backups, go-live checklist |

## How the check-in works

1. The lecturer starts a session. The API derives, for the current 45-second window:
   - `code6 = HMAC(qr_secret, sessionId + step)` truncated to six digits, and
   - `qrPayload = "CC1.<sessionId>.<step>.<HMAC(qr_secret, 'qr.' + sessionId + '.' + step)>"`.
2. The lecturer's screen shows the QR and the digits with a countdown; both are re-issued when the window turns over.
3. The student scans or types the code. The server accepts only the current window and the previous one (typing/
   scanning delay), verifies the signature against that session, then checks the session state, the check-in window,
   enrolment and duplicates (`unique(session_id, student_id)`), and finally the optional geofence.
4. Offline check-ins are queued on the device and replayed when the connection returns; the server accepts the window
   the student actually captured (up to a 30-minute sync grace) and applies the same rules.

**Privacy:** raw coordinates are never stored — only `location_verified` and `location_distance_m` on the record that
needed them, deleted with the record's retention period. See the in-app notice at `/privacy`.

## Project layout

```
client/                 React + Vite app (student, lecturer, admin)
  src/pages/            Screens per role
  src/lib/              api client, auth/theme context, offline queue, formatting
server/                 Express API
  src/routes/           auth, courses, sessions, attendance, timetable, reports, admin, notifications
  src/services/         check-in logic, ownership checks, analytics
  src/lib/              QR codes, geo, exports, audit, settings, mail
  db/migrations/        SQL schema
  scripts/              migrate.js, seed.js
  test/                 node:test unit tests
docker-compose.base44.yml   Development stack (db + api + web on port 3000)
docs/                   PRD, schema, API, wireframes, roadmap, test plan, deployment
```

## Configuration

Real secrets come from the platform at `/run/base44/app.env`, loaded as the **last** `env_file` entry so they always
win over the committed development placeholders in `.env.base44-defaults`:

| Variable | Purpose |
| --- | --- |
| `JWT_SECRET` | signs access tokens |
| `QR_SIGNING_SECRET` | signs rotating QR payloads |
| `DEVICE_HASH_SECRET` | HMACs the per-install device id |
| `UNIVERSITY_EMAIL_DOMAINS` | email domains allowed to sign up (`campus.edu,student.campus.edu`) |
| `WARNING_THRESHOLD`, `DEFAULT_RETENTION_DAYS` | initial policy values (editable in the admin UI) |
| `SEED_DEMO` | `1` seeds demo data on an empty database |
| `SMTP_HOST/PORT/USER/PASS/FROM` | optional; without them email is written to the API log and in-app notifications still work |

The API exposes runtime-editable policy (warning threshold, retention, late grace, code rotation) through
`/api/admin/settings`.

## Preview-mode overrides

The only sandbox-specific behaviour is gated on `BASE44_PREVIEW_MODE === "1"`:

- `client/vite.config.js` extends Vite's host allowlist with the preview host (`3000-<suffix>` and
  `.<sandbox domain>`) and points HMR at `wss://<host>:443`, because the preview is served through an HTTPS proxy.
  With the flag unset the dev server keeps its default `localhost`-only allowlist and standard HMR.

Everything else — bind addresses, the `/api` proxy, ports, database credentials — lives in `docker-compose.base44.yml`.

## Not included (next cycle)

- Native app packaging (React Native/Flutter) and push notifications (FCM/APNs) — this build ships the mobile-first
  web client and email/in-app notifications.
- Bulk CSV import of students and enrolments.
- Multi-campus hierarchy and registry timetable import.

See [`docs/MVP-ROADMAP.md`](docs/MVP-ROADMAP.md) for the prioritised backlog.
