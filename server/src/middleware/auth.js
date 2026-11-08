import jwt from 'jsonwebtoken';
import { config } from '../config.js';
import { one } from '../db.js';
import { HttpError } from './errors.js';

export const ACCESS_COOKIE = 'cc_at';
export const REFRESH_COOKIE = 'cc_rt';

export function signAccessToken(user) {
  return jwt.sign(
    { sub: user.id, role: user.role, name: user.name, email: user.email },
    config.jwtSecret,
    { expiresIn: config.accessTtlSeconds },
  );
}

export function cookieOptions(maxAgeMs) {
  return {
    httpOnly: true,
    sameSite: 'lax',
    path: '/',
    secure: config.isProd,
    ...(maxAgeMs ? { maxAge: maxAgeMs } : {}),
  };
}

export function setAuthCookies(res, { accessToken, refreshToken }) {
  res.cookie(ACCESS_COOKIE, accessToken, cookieOptions(config.accessTtlSeconds * 1000));
  res.cookie(REFRESH_COOKIE, refreshToken, cookieOptions(config.refreshTtlDays * 24 * 60 * 60 * 1000));
}

export function clearAuthCookies(res) {
  res.clearCookie(ACCESS_COOKIE, cookieOptions());
  res.clearCookie(REFRESH_COOKIE, cookieOptions());
}

const PROFILE_SQL = `
  select u.id, u.name, u.email, u.role, u.status, u.department_id, u.email_verified_at, u.created_at,
         d.name as department_name, d.code as department_code,
         st.matric_number, st.program, st.level,
         lec.staff_id
  from users u
  left join departments d on d.id = u.department_id
  left join students st on st.user_id = u.id
  left join lecturers lec on lec.user_id = u.id
  where u.id = $1
`;

export async function loadProfile(userId) {
  return one(PROFILE_SQL, [userId]);
}

/** Verifies the access cookie and attaches a live, non-suspended profile to req.user. */
export async function authenticate(req, res, next) {
  try {
    const token = req.cookies?.[ACCESS_COOKIE];
    if (!token) throw new HttpError(401, 'Please sign in.', 'unauthenticated');

    let payload;
    try {
      payload = jwt.verify(token, config.jwtSecret);
    } catch {
      throw new HttpError(401, 'Your session expired. Please sign in again.', 'unauthenticated');
    }

    const user = await loadProfile(payload.sub);
    if (!user) throw new HttpError(401, 'Please sign in.', 'unauthenticated');
    if (user.status === 'suspended') {
      throw new HttpError(403, 'This account is suspended. Contact your administrator.', 'account_suspended');
    }
    if (user.status !== 'active') {
      throw new HttpError(403, 'Verify your university email to continue.', 'email_unverified');
    }

    req.user = user;
    return next();
  } catch (err) {
    return next(err);
  }
}

export function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.user) return next(new HttpError(401, 'Please sign in.', 'unauthenticated'));
    if (!roles.includes(req.user.role)) {
      return next(new HttpError(403, 'You do not have access to this action.', 'forbidden'));
    }
    return next();
  };
}

/**
 * CSRF defence in depth: cookies already use SameSite=Lax, and here any
 * state-changing request that carries an Origin header must come from our own
 * host (the preview proxy forwards the original Host, so this works proxied).
 */
export function sameOrigin(req, res, next) {
  const method = req.method.toUpperCase();
  if (method === 'GET' || method === 'HEAD' || method === 'OPTIONS') return next();

  const origin = req.headers.origin;
  if (!origin) return next(); // non-browser client (curl, server-to-server)

  try {
    const originHost = new URL(origin).host;
    const requestHost = req.headers.host;
    const trusted = req.headers['x-forwarded-host'] || requestHost;
    if (originHost === requestHost || originHost === trusted) return next();
    if (origin === config.webOrigin) return next();
    if (originHost === new URL(config.webOrigin).host) return next();
  } catch {
    /* fall through */
  }
  return next(new HttpError(403, 'Request blocked: unexpected origin.', 'bad_origin'));
}

export function securityHeaders(req, res, next) {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'same-origin');
  res.setHeader('X-Permitted-Cross-Domain-Policies', 'none');
  res.setHeader('Cross-Origin-Resource-Policy', 'same-site');
  next();
}

function isTrustedOrigin(origin) {
  if (!origin) return false;
  if (origin === config.webOrigin) return true;
  try {
    const host = new URL(origin).host;
    const sandboxDomain = process.env.BASE44_SANDBOX_HOST_DOMAIN;
    const publicSuffix = process.env.BASE44_PUBLIC_HOST_SUFFIX;
    if (sandboxDomain && host.endsWith(`.${sandboxDomain}`)) return true;
    if (publicSuffix && host === `3000-${publicSuffix}`) return true;
  } catch {
    /* ignore malformed origins */
  }
  return false;
}

/** Minimal credentialed CORS for the published API port (the web app uses a proxy). */
export function corsForWeb(req, res, next) {
  const origin = req.headers.origin;
  if (isTrustedOrigin(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Access-Control-Allow-Credentials', 'true');
    res.setHeader('Vary', 'Origin');
  }
  if (req.method === 'OPTIONS') {
    res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PATCH,PUT,DELETE,OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    return res.sendStatus(204);
  }
  return next();
}
