# CampusCheck — deployment guide

CampusCheck is three containers: `web` (React + Vite), `api` (Node/Express), `db` (PostgreSQL 16). Environments differ only by configuration and image source.

## Environments

| | Development | Staging | Production |
| --- | --- | --- | --- |
| Compose file | `docker-compose.base44.yml` | `docker-compose.base44.yml` with `NODE_ENV=production` app image | same, behind a TLS terminator |
| Source | bind-mounted, `node --watch` + Vite HMR | built image, no watch | built image, no watch |
| Database | Postgres container, seeded demo data | managed Postgres, anonymised data | managed Postgres, backups + PITR |
| Cookies | `Secure=false` | `Secure=true` | `Secure=true` |
| TLS | terminated by the preview proxy | required | required, HSTS |
| Secrets | generated dev placeholders | secret manager | secret manager, rotated |

## Required configuration

| Variable | Required | Notes |
| --- | --- | --- |
| `DATABASE_URL` | yes | `postgres://user:pass@host:5432/campuscheck` |
| `JWT_SECRET` | yes | ≥ 32 random bytes; signs access tokens |
| `QR_SIGNING_SECRET` | yes | ≥ 32 random bytes; derives rotating check-in codes. Rotating it invalidates in-flight codes only |
| `DEVICE_HASH_SECRET` | yes | HMAC key for device ids (never store raw device ids) |
| `WEB_ORIGIN` | yes in production | public origin, used for CORS links in emails |
| `WARNING_THRESHOLD` | no | default `75` |
| `DEFAULT_RETENTION_DAYS` | no | default `365` |
| `SEED_DEMO` | no | `1` seeds demo data (never in production) |
| `SMTP_HOST` / `SMTP_PORT` / `SMTP_USER` / `SMTP_PASS` / `SMTP_FROM` | no | without these, emails are written to the API log and the in-app notification is still created |
| `PUBLIC_URL` | no | absolute base URL used in verification links (defaults to `WEB_ORIGIN`) |

Secrets are supplied by the platform at `/run/base44/app.env` and loaded as the **last** `env_file` entry, so dashboard values always win over the committed development defaults in `.env.base44-defaults`. Never commit real credentials.

## Local / sandbox

```bash
docker compose -f docker-compose.base44.yml up -d --build
docker compose -f docker-compose.base44.yml ps
curl -s localhost:3000/api/health
```

The `api` container installs dependencies from the lockfile on start, applies migrations, then runs `node --watch`. The `web` container installs and runs Vite on `0.0.0.0:5173`, published on host port 3000 with `/api` proxied to the API container (single origin — required for cookie auth).

## Production topology

```
client ──TLS──▶ reverse proxy (nginx/Caddy) ──▶ web (static build) 
                                    └────────▶ api (2+ replicas) ──▶ managed Postgres
```

1. **Build immutable images.** `docker build -f deploy/api.Dockerfile -t campuscheck-api:<sha> .` (multi-stage: `npm ci --omit=dev`, run as non-root, `CMD ["node","src/index.js"]`). Same for the web client with `npm run build` and a static server.
2. **TLS** terminated at the proxy; forward `X-Forwarded-Proto`, keep `trust proxy` on in Express (already set).
3. **Migrations** run as a one-shot job before the API rolls (`node scripts/migrate.js`), never concurrently with itself.
4. **Scale** the API horizontally behind the proxy; sessions are stateless (cookies) and rotated refresh tokens live in Postgres. Rotating codes are derived per request — no in-memory state, so any replica can validate any code.
5. **Backups:** nightly `pg_dump` + PITR on the managed instance. Test a restore each term.
6. **Observability:** structured access logs from the proxy; API logs security events (failed logins, overrides, purges) without personal data. Alert on 5xx rate > 1 %, p95 latency > 1 s, and failed-login spikes.
7. **Rate limits** currently live in process memory. With more than one API replica, back them with Redis (`rate-limit-redis`) or move limiting to the proxy.

## Release process

1. CI: install, lint, `npm test` (unit), build the client.
2. Deploy to staging with a production-like dataset; run `docs/TEST_PLAN.md` sections 2–3.
3. Tag, build production images, run migrations, rolling deploy.
4. Smoke: health/ready, one login per role, one check-in with a test account.
5. Rollback: redeploy the previous image tag; migrations are additive, so no schema rollback is needed within a release.

## Data retention

`app_settings.retention.attendance_days` (default 365) drives `POST /api/admin/retention/purge`, exposed in the admin settings tab. Schedule it monthly (cron/CronJob):

```bash
curl -X POST -b "cc_at=$TOKEN" https://campuscheck.example.edu/api/admin/retention/purge
```

Audit logs are kept 24 months independent of attendance retention so deletions stay provable.

## Security checklist for go-live

- [ ] Unique, high-entropy `JWT_SECRET`, `QR_SIGNING_SECRET`, `DEVICE_HASH_SECRET` (not the dev defaults).
- [ ] `NODE_ENV=production`, `SEED_DEMO` unset.
- [ ] HTTPS enforced, `Secure` cookies, HSTS at the proxy.
- [ ] Database not publicly reachable; least-privilege DB role (no `SUPERUSER`).
- [ ] Retention period approved by the institution's data protection officer.
- [ ] Privacy notice URL published and linked from check-in and sign-up.
- [ ] Backups verified by an actual restore.
