# CampusCheck — test plan

Automated tests run inside the API container (no host runtimes):

```bash
docker compose -f docker-compose.base44.yml exec -T api npm test
```

## 1. Unit tests (implemented — `server/test`)

| ID | Area | Case | Expected |
| --- | --- | --- | --- |
| U1 | QR | same secret + session + step | identical 6-digit code |
| U2 | QR | different sessions, same step | different codes |
| U3 | QR | code is 6 numeric characters | matches `/^\d{6}$/` |
| U4 | QR | payload round-trip verify | resolves the same session and step |
| U5 | QR | payload from a foreign secret | rejected (`bad_signature`) |
| U6 | QR | expired step (current − 2) | rejected (`expired`) |
| U7 | QR | previous step | accepted (tolerance) |
| U8 | QR | malformed payload | rejected (`malformed`) |
| U9 | Geo | identical points | distance 0 |
| U10 | Geo | ~111 km per degree latitude | 111 km ± 1 % |
| U11 | Geo | radius boundary rounding | inside/outside consistent |
| U12 | Export | CSV escaping of comma, quote, newline | RFC 4180 quoted fields |
| U13 | Export | empty result | header row only |

## 2. Integration tests (manual / scripted against the running stack)

| ID | Flow | Steps | Expected |
| --- | --- | --- | --- |
| I1 | Student sign-up | POST `/auth/register` with `@campus.edu` | 201, `status: pending`, verification URL |
| I2 | Reject foreign domain | `@gmail.com` | 400 `email_domain` |
| I3 | Verify email | POST `/auth/verify-email` with token | `active`, login succeeds |
| I4 | Duplicate e-mail | register twice | 409 |
| I5 | Login/logout | login, `GET /me`, logout, `GET /me` | 200, 200, 204, 401 |
| I6 | Refresh rotation | `POST /auth/refresh` twice with the old cookie | second attempt 401 |
| I7 | Lecturer opens session | POST `/sessions/:id/open` | `open`, students notified |
| I8 | Code rotates | GET `/sessions/:id/code` twice, 50 s apart | different `code6` and `step` |
| I9 | Check-in by QR | POST with fresh `qrPayload` | 201 `present` |
| I10 | Check-in by code | second student, `code` only | 201 |
| I11 | Duplicate check-in | repeat I9 | 409 `already_checked_in`, record unchanged |
| I12 | Expired code | payload from step − 2 | 422 `code_expired` |
| I13 | Not enrolled | non-enrolled student | 403 `not_enrolled` |
| I14 | Window closed | check-in after `check_in_closes_at` | 422 `check_in_closed` |
| I15 | Geofence fail | 400 m away, radius 150 | 422 `geofence_failed`, nothing stored with coordinates |
| I16 | Geofence pass | inside radius | 201, `location_verified: true`, `location_distance_m` ≤ 150 |
| I17 | Late status | check-in 15 min after start | `late` |
| I18 | Shared device flag | two students, same `deviceId` | second record `flagged`, `flag_reason: shared_device` |
| I19 | Close session | POST `/sessions/:id/close` | absentees created; counts add to enrolment |
| I20 | Override | PATCH record `absent → excused` with reason | 200, audit row, student notification |
| I21 | Override without reason | PATCH without `reason` | 400 |
| I22 | Student summary | GET `/attendance/me/summary` | percentages match records; warning under threshold |
| I23 | Admin analytics | GET `/reports/summary` with filters | counts and per-course rates consistent |
| I24 | CSV export | GET `/reports/export?format=csv` | `text/csv`, rows = records in range |
| I25 | XLSX export | GET `/reports/export?format=xlsx` | `spreadsheetml`, opens in Excel |
| I26 | Retention purge | PUT settings `retention=1`, POST purge | old records gone, recent intact, audit kept |

## 3. Security tests

| ID | Attack | Expected |
| --- | --- | --- |
| S1 | Student calls `POST /courses` | 403 |
| S2 | Student calls admin endpoints | 403 |
| S3 | Lecturer B reads lecturer A's session by id | 404 (no existence leak) |
| S4 | Student reads another student's attendance | 404 |
| S5 | CSRF: POST with `Origin: https://evil.test` | 403 `bad_origin` |
| S6 | Brute force login (20 attempts) | 429 after 10 |
| S7 | Brute force check-in codes | 429; guessing 1 in 10⁶ per window |
| S8 | SQL injection in `?q=`, course code, login email | parameterised queries; no error leak |
| S9 | XSS payload in course title / override reason | rendered as text by React; no `dangerouslySetInnerHTML` |
| S10 | Forged QR signature | 422 `bad_signature` |
| S11 | Replay QR from another session | 422 `bad_signature` |
| S12 | Suspended user with valid token | 403 `account_suspended` |
| S13 | Password hash never returned | no `password_hash` in any response |
| S14 | Cookie flags | `httpOnly`, `SameSite=Lax`, `Secure` in production |
| S15 | Rate limit headers present on auth responses | `RateLimit-*` |

## 4. Usability tests (moderated, 5 students / 3 lecturers)

| ID | Task | Success criterion |
| --- | --- | --- |
| UX1 | Check in using a projected code | ≤ 3 taps, ≤ 10 s, no help |
| UX2 | Recover from an expired code | reads the message, retries successfully |
| UX3 | Find attendance percentage for a course | ≤ 10 s from dashboard |
| UX4 | Lecturer opens a session and shows the code | ≤ 2 screens, ≤ 30 s |
| UX5 | Lecturer corrects an absent record with a reason | completes without instruction |
| UX6 | Admin exports last month's attendance for one department | correct file, < 1 min |
| UX7 | Dark mode + 360 px + 200 % font zoom | no clipping, no horizontal scroll |
| UX8 | Airplane mode during check-in | clear "queued" state; syncs on reconnect |
| UX9 | Screen reader announces the rotating code countdown | `aria-live` announces rotation, not every second |

## 5. Performance / resilience

| ID | Check | Target |
| --- | --- | --- |
| P1 | 120 simultaneous check-ins on one session | p95 < 800 ms, 0 lost, 0 duplicates |
| P2 | Live attendance poll at 5 s with 250 rows | < 150 ms server time |
| P3 | Export 20 000 records | < 5 s, memory stable |
| P4 | Wi-Fi drop mid-request | queued, replayed, single record |

## 6. Regression checklist before a release

1. `npm test` green in the API container.
2. All three demo roles log in and see their dashboard.
3. Open → check in (QR + code) → override → close → export, on a fresh database.
4. Audit trail shows the override with actor, old/new value and reason.
5. Dark mode, 360 px, keyboard-only navigation of the login form.
