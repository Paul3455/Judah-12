const int = (value, fallback) => {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
};

const flag = (value, fallback) => {
  if (value === undefined || value === '') return fallback;
  return value === '1' || value.toLowerCase?.() === 'true';
};

const env = process.env.NODE_ENV || 'development';
const webOrigin = process.env.WEB_ORIGIN || 'http://localhost:3000';

export const config = {
  env,
  isProd: env === 'production',
  port: int(process.env.API_PORT, 4000),
  databaseUrl:
    process.env.DATABASE_URL ||
    'postgres://campuscheck:campuscheck_dev_pw@db:5432/campuscheck',

  // Signing material. Development placeholders come from .env.base44-defaults;
  // real values are injected by the platform via /run/base44/app.env.
  jwtSecret: process.env.JWT_SECRET || 'dev-only-jwt-secret',
  qrSecret: process.env.QR_SIGNING_SECRET || 'dev-only-qr-secret',
  deviceSecret: process.env.DEVICE_HASH_SECRET || 'dev-only-device-secret',

  accessTtlSeconds: int(process.env.ACCESS_TTL_SECONDS, 15 * 60),
  refreshTtlDays: int(process.env.REFRESH_TTL_DAYS, 7),

  seedDemo: flag(process.env.SEED_DEMO, false),
  devVerificationLinks: process.env.ALLOW_DEV_VERIFICATION_LINK !== '0',

  webOrigin,
  publicUrl: process.env.PUBLIC_URL || webOrigin,

  smtp: {
    host: process.env.SMTP_HOST || '',
    port: int(process.env.SMTP_PORT, 587),
    user: process.env.SMTP_USER || '',
    pass: process.env.SMTP_PASS || '',
    from: process.env.SMTP_FROM || 'CampusCheck <no-reply@campuscheck.local>',
  },

  defaults: {
    warningThreshold: int(process.env.WARNING_THRESHOLD, 75),
    retentionDays: int(process.env.DEFAULT_RETENTION_DAYS, 365),
    lateGraceMinutes: int(process.env.LATE_GRACE_MINUTES, 10),
    qrStepSeconds: int(process.env.QR_STEP_SECONDS, 45),
    offlineSyncGraceMinutes: int(process.env.OFFLINE_SYNC_GRACE_MINUTES, 30),
  },
};
