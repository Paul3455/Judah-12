import crypto from 'node:crypto';

export const QR_PREFIX = 'CC1';

/** Which rotation window a timestamp belongs to. */
export function timeStep(nowMs, stepSeconds = 45) {
  return Math.floor(nowMs / (stepSeconds * 1000));
}

export function stepExpiry(step, stepSeconds = 45) {
  return new Date((step + 1) * stepSeconds * 1000);
}

/** 6-digit check-in code for one session and one rotation window. */
export function deriveCode(secret, sessionId, step) {
  const mac = crypto.createHmac('sha256', secret).update(`${sessionId}.${step}`).digest();
  return String(mac.readUInt32BE(0) % 1_000_000).padStart(6, '0');
}

function signStep(secret, sessionId, step) {
  return crypto
    .createHmac('sha256', secret)
    .update(`qr.${sessionId}.${step}`)
    .digest('base64url')
    .slice(0, 16);
}

/** Signed QR payload: CC1.<sessionId>.<step>.<signature> */
export function buildPayload(secret, sessionId, step) {
  return `${QR_PREFIX}.${sessionId}.${step}.${signStep(secret, sessionId, step)}`;
}

function safeEqual(a, b) {
  const left = Buffer.from(String(a));
  const right = Buffer.from(String(b));
  if (left.length !== right.length) return false;
  return crypto.timingSafeEqual(left, right);
}

/**
 * Verifies a scanned QR payload.
 * `acceptedSteps` is the set of rotation windows we still accept (current and,
 * for offline sync, everything back to the moment the student captured it).
 */
export function verifyPayload(secret, payload, { acceptedSteps }) {
  if (typeof payload !== 'string') return { ok: false, reason: 'malformed' };
  const parts = payload.trim().split('.');
  if (parts.length !== 4 || parts[0] !== QR_PREFIX) return { ok: false, reason: 'malformed' };

  const [, sessionId, stepRaw, signature] = parts;
  const step = Number(stepRaw);
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(sessionId)) {
    return { ok: false, reason: 'malformed' };
  }
  if (!Number.isInteger(step) || step < 0) return { ok: false, reason: 'malformed' };

  if (!safeEqual(signature, signStep(secret, sessionId, step))) {
    return { ok: false, reason: 'bad_signature' };
  }
  if (!acceptedSteps.includes(step)) return { ok: false, reason: 'expired' };
  return { ok: true, sessionId, step };
}

/** Checks a typed 6-digit code against the accepted windows. */
export function verifyCode(secret, sessionId, code, { acceptedSteps }) {
  const normalized = String(code ?? '').trim();
  if (!/^\d{6}$/.test(normalized)) return { ok: false, reason: 'malformed' };
  for (const step of acceptedSteps) {
    if (deriveCode(secret, sessionId, step) === normalized) return { ok: true, step };
  }
  return { ok: false, reason: 'bad_code' };
}

/**
 * Rotation windows accepted for a check-in.
 * Normally the current step plus the previous one (typing/scanning delay).
 * For a queued offline check-in we accept every window between the moment the
 * student captured the code and now, capped by the offline sync grace period.
 */
export function acceptedStepsFor({ nowMs = Date.now(), capturedAtMs = null, stepSeconds = 45, graceMinutes = 30 }) {
  const current = timeStep(nowMs, stepSeconds);
  if (!capturedAtMs || !Number.isFinite(capturedAtMs)) return [current, current - 1];

  const earliest = Math.max(capturedAtMs - stepSeconds * 1000, nowMs - graceMinutes * 60_000);
  const from = timeStep(earliest, stepSeconds);
  const steps = [];
  for (let step = current; step >= from && steps.length < 200; step -= 1) steps.push(step);
  return steps.length ? steps : [current];
}
