import express from 'express';
import bcrypt from 'bcryptjs';
import crypto from 'node:crypto';
import { z } from 'zod';
import { config } from '../config.js';
import { one, query, tx } from '../db.js';
import { HttpError, wrap } from '../middleware/errors.js';
import { rateLimit } from '../middleware/rateLimit.js';
import {
  ACCESS_COOKIE,
  REFRESH_COOKIE,
  authenticate,
  clearAuthCookies,
  loadProfile,
  setAuthCookies,
  signAccessToken,
} from '../middleware/auth.js';
import { logAudit } from '../lib/audit.js';
import { sendMail } from '../lib/mailer.js';

const router = express.Router();

const sha256 = (value) => crypto.createHash('sha256').update(value).digest('hex');
const randomToken = () => crypto.randomBytes(32).toString('base64url');

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  message: 'Too many attempts. Please wait a few minutes and try again.',
});

async function issueRefreshToken(userId, req) {
  const raw = randomToken();
  const expiresAt = new Date(Date.now() + config.refreshTtlDays * 24 * 60 * 60 * 1000);
  await query(
    `insert into refresh_tokens (user_id, token_hash, expires_at, user_agent) values ($1, $2, $3, $4)`,
    [userId, sha256(raw), expiresAt, (req.headers['user-agent'] || '').slice(0, 255)],
  );
  return raw;
}

async function issueVerification(userId, email, name) {
  const raw = randomToken();
  const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);
  await query(
    `insert into email_verification_tokens (user_id, token_hash, expires_at) values ($1, $2, $3)`,
    [userId, sha256(raw), expiresAt],
  );
  const url = `${config.publicUrl}/verify?token=${raw}`;
  const result = await sendMail({
    to: email,
    subject: 'Verify your CampusCheck email',
    text: `Hello ${name},\n\nConfirm your email to activate your CampusCheck account:\n${url}\n\nThis link expires in 24 hours. If you did not sign up, ignore this email.`,
  });
  return { url, delivered: result.delivered };
}

const registerSchema = z.object({
  name: z.string().trim().min(2).max(120),
  email: z.string().trim().email(),
  password: z.string().min(8, 'Use at least 8 characters.').max(200),
  matricNumber: z.string().trim().min(3).max(40),
  program: z.string().trim().min(2).max(120),
  level: z.coerce.number().int().min(100).max(700),
  department: z.string().trim().min(2).max(120).optional(),
});

router.post(
  '/register',
  authLimiter,
  wrap(async (req, res) => {
    const input = registerSchema.parse(req.body);
    const email = input.email.toLowerCase();

    const existing = await one('select id from users where lower(email) = $1', [email]);
    if (existing) throw new HttpError(409, 'An account with that email already exists.', 'email_taken');

    const passwordHash = await bcrypt.hash(input.password, 10);

    const user = await tx(async (client) => {
      const inserted = await client.query(
        `insert into users (name, email, password_hash, role, status)
         values ($1, $2, $3, 'student', 'pending') returning id, name, email, role, status`,
        [input.name, email, passwordHash],
      );
      const row = inserted.rows[0];
      await client.query(
        `insert into students (user_id, matric_number, program, level, department) values ($1, $2, $3, $4, $5)`,
        [row.id, input.matricNumber, input.program, input.level, input.department || null],
      );
      await client.query(
        `insert into audit_logs (actor_id, action, entity_type, entity_id, new_value)
         values ($1, 'auth.register', 'user', $1, $2)`,
        [row.id, JSON.stringify({ role: 'student', status: 'pending' })],
      );
      return row;
    });

    const verification = await issueVerification(user.id, user.email, user.name);

    res.status(201).json({
      user,
      message: 'Check your email to verify your account.',
      verificationUrl: config.devVerificationLinks ? verification.url : undefined,
      emailDelivered: verification.delivered,
    });
  }),
);

router.post(
  '/verify-email',
  authLimiter,
  wrap(async (req, res) => {
    const { token } = z.object({ token: z.string().min(10) }).parse(req.body);
    const row = await one(
      `select * from email_verification_tokens
       where token_hash = $1 and used_at is null and expires_at > now()`,
      [sha256(token)],
    );
    if (!row) throw new HttpError(400, 'This verification link is invalid or has expired.', 'invalid_token');

    await tx(async (client) => {
      await client.query(`update users set status = 'active', email_verified_at = now(), updated_at = now() where id = $1`, [
        row.user_id,
      ]);
      await client.query('update email_verification_tokens set used_at = now() where id = $1', [row.id]);
      await client.query(
        `insert into audit_logs (actor_id, action, entity_type, entity_id) values ($1, 'auth.email_verified', 'user', $1)`,
        [row.user_id],
      );
    });

    res.json({ ok: true, message: 'Email verified. You can sign in now.' });
  }),
);

router.post(
  '/resend-verification',
  authLimiter,
  wrap(async (req, res) => {
    const { email } = z.object({ email: z.string().email() }).parse(req.body);
    const user = await one('select id, name, email, status from users where lower(email) = lower($1)', [email]);
    if (!user || user.status !== 'pending') {
      return res.json({ ok: true }); // do not reveal account state
    }
    const verification = await issueVerification(user.id, user.email, user.name);
    return res.json({
      ok: true,
      verificationUrl: config.devVerificationLinks ? verification.url : undefined,
    });
  }),
);

router.post(
  '/login',
  authLimiter,
  wrap(async (req, res) => {
    const { email, password } = z
      .object({ email: z.string().trim().email(), password: z.string().min(1) })
      .parse(req.body);

    const user = await one('select * from users where lower(email) = lower($1)', [email]);
    const passwordOk = user ? await bcrypt.compare(password, user.password_hash) : false;

    if (!user || !passwordOk) {
      if (user) {
        await logAudit(null, {
          actorId: user.id,
          action: 'auth.login_failed',
          entityType: 'user',
          entityId: user.id,
          ip: req.ip,
        });
      }
      throw new HttpError(401, 'Email or password is incorrect.', 'invalid_credentials');
    }
    if (user.status === 'suspended') {
      throw new HttpError(403, 'This account is suspended. Contact your administrator.', 'account_suspended');
    }
    if (user.status === 'pending') {
      throw new HttpError(403, 'Verify your email before signing in.', 'email_unverified');
    }

    const refreshToken = await issueRefreshToken(user.id, req);
    setAuthCookies(res, { accessToken: signAccessToken(user), refreshToken });

    await logAudit(null, { actorId: user.id, action: 'auth.login', entityType: 'user', entityId: user.id, ip: req.ip });

    res.json({ user: await loadProfile(user.id) });
  }),
);

router.post(
  '/refresh',
  wrap(async (req, res) => {
    const raw = req.cookies?.[REFRESH_COOKIE];
    if (!raw) throw new HttpError(401, 'Please sign in.', 'unauthenticated');

    const token = await one('select * from refresh_tokens where token_hash = $1', [sha256(raw)]);
    if (!token || token.revoked_at || new Date(token.expires_at) < new Date()) {
      clearAuthCookies(res);
      throw new HttpError(401, 'Your session expired. Please sign in again.', 'unauthenticated');
    }

    const user = await one('select * from users where id = $1', [token.user_id]);
    if (!user || user.status !== 'active') {
      clearAuthCookies(res);
      throw new HttpError(403, 'This account is not active.', 'account_inactive');
    }

    // rotate: the used token can never be replayed
    await query('update refresh_tokens set revoked_at = now() where id = $1', [token.id]);
    const nextRefresh = await issueRefreshToken(user.id, req);
    setAuthCookies(res, { accessToken: signAccessToken(user), refreshToken: nextRefresh });

    res.json({ user: await loadProfile(user.id) });
  }),
);

router.post(
  '/logout',
  wrap(async (req, res) => {
    const raw = req.cookies?.[REFRESH_COOKIE];
    if (raw) await query('update refresh_tokens set revoked_at = now() where token_hash = $1', [sha256(raw)]);
    clearAuthCookies(res);
    res.status(204).end();
  }),
);

router.get('/me', authenticate, (req, res) => {
  res.json({ user: req.user });
});

router.post(
  '/change-password',
  authenticate,
  wrap(async (req, res) => {
    const { currentPassword, newPassword } = z
      .object({ currentPassword: z.string().min(1), newPassword: z.string().min(8).max(200) })
      .parse(req.body);

    const user = await one('select * from users where id = $1', [req.user.id]);
    const ok = await bcrypt.compare(currentPassword, user.password_hash);
    if (!ok) throw new HttpError(400, 'Your current password is incorrect.', 'bad_password');

    const hash = await bcrypt.hash(newPassword, 10);
    await query('update users set password_hash = $2, updated_at = now() where id = $1', [req.user.id, hash]);
    await query('update refresh_tokens set revoked_at = now() where user_id = $1 and revoked_at is null', [
      req.user.id,
    ]);
    await logAudit(null, {
      actorId: req.user.id,
      action: 'auth.password_changed',
      entityType: 'user',
      entityId: req.user.id,
      ip: req.ip,
    });

    res.json({ ok: true, message: 'Password updated. Please sign in again on other devices.' });
  }),
);

export { ACCESS_COOKIE };
export default router;
