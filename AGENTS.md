# AGENTS.md — CampusCheck

Findings from setting this stack up that are not obvious from the manifests.

## Run

```bash
docker compose -f docker-compose.base44.yml up -d --build
curl -s localhost:3000/api/ready        # {"status":"ready"}
```

`api` and `web` are plain `node:22-bookworm-slim` images with the repo bind-mounted; `npm install` runs on every start
(so a changed `package.json` needs `docker compose -f docker-compose.base44.yml restart api` — the lockfiles are
committed, written by that first install).

## Decisions that must not be "optimised" away

- **Single origin.** The browser only talks to Vite on port 3000 and Vite proxies `/api` to `api:4000`. Session cookies
  are `httpOnly`, `SameSite=Lax`, so splitting the origins (client on 3000, API called directly on 4000) breaks login.
- **Access tokens are short (15 min)** and rotate through `POST /api/auth/refresh`; the client retries a 401 once. A
  401/`refresh` 401 pair in the network log *before* sign-in is normal, not a bug.
- **`node --watch`** restarts the API on file changes; Vite HMR handles the client. Both watch a bind mount, so no
  rebuild is needed for source edits.
- **Preview-only overrides** are gated on `BASE44_PREVIEW_MODE === "1"` inside `client/vite.config.js` (host allowlist
  for `3000-<suffix>` / `.<sandbox domain>`, HMR over `wss://<host>:443`). Unset, Vite keeps its default
  `localhost`-only allowlist and normal HMR. Nothing else in the app is sandbox-specific.

## Data

- Postgres has **no published host port**; use
  `docker compose -f docker-compose.base44.yml exec -T db psql -U campuscheck -d campuscheck`.
- Demo data seeds **only when `users` is empty** (`SEED_DEMO=1` in `.env.base44-defaults`). Re-seeding means
  `docker compose -f docker-compose.base44.yml down -v`, which destroys all data.
- Postgres `date` columns arrive in JS as a `Date` at local midnight, so compare with
  `.toISOString().slice(0, 10)` rather than `String(value)` — otherwise a UTC+ offset shifts the day.
- A demo-able check-in needs a session in `status='open'`. The seed creates one at first boot; afterwards use
  *Lecturer → Sessions → Start now*. Closing a session materialises `absent` rows, which is what makes percentages move.

## Gotchas

- Check-in bodies are **snake_case** (`qr_payload`, `code`, `device_id`, `captured_at`, `location`). `checkIn()` in
  `server/src/services/attendance.js` normalises them at the top — keep that in sync with the Zod schema in
  `server/src/routes/attendance.js`. (A mismatch here silently degrades to "code required" 400s and unhashed devices.)
- Codes verify against the current and previous 45 s window; a queued offline check-in extends the accepted range back
  to its `captured_at`, capped at 30 minutes (`acceptedStepsFor`).
- `/api/sessions/:id/code` refuses anything but an `open` session (422 `session_not_open`); the live view polls every
  5 s and the code panel also refreshes on expiry.
- Healthchecks shell out to `node -e "fetch(...)"`, so the base image must stay Node ≥ 20.
- Rate limits are in-process (`middleware/rateLimit.js`); with more than one API replica move them to a shared store.

## Verify

- Unit: `docker compose -f docker-compose.base44.yml exec -T api npm test` → 20 tests (QR windows, signatures, offline
  replay, geofence, CSV/XLSX).
- End-to-end: sign in with the demo accounts from the README; the check-in flow is
  lecturer *Sessions → QR* (read the six digits) → student *Check in* → success card.
- `docs/TEST_PLAN.md` §2–3 is the full integration and security matrix.
