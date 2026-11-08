import { config } from '../config.js';
import { many, pool } from '../db.js';

const DEFAULTS = {
  'attendance.warning_threshold': config.defaults.warningThreshold,
  'retention.attendance_days': config.defaults.retentionDays,
  'attendance.late_grace_minutes': config.defaults.lateGraceMinutes,
  'checkin.qr_step_seconds': config.defaults.qrStepSeconds,
};

let cache = null;
let cacheUntil = 0;

/**
 * Runtime configuration that administrators can change (retention period,
 * warning threshold, late grace, QR rotation). Cached briefly so the check-in
 * hot path does not hit the database for every request.
 */
export async function getSettings({ fresh = false } = {}) {
  const now = Date.now();
  if (!fresh && cache && cacheUntil > now) return cache;

  const rows = await many('select key, value from app_settings');
  const merged = { ...DEFAULTS };
  for (const row of rows) {
    const raw = row.value?.value ?? row.value;
    if (raw !== undefined && raw !== null) merged[row.key] = raw;
  }

  const settings = {
    warningThreshold: Number(merged['attendance.warning_threshold']) || config.defaults.warningThreshold,
    retentionDays: Number(merged['retention.attendance_days']) || config.defaults.retentionDays,
    lateGraceMinutes: Number.isFinite(Number(merged['attendance.late_grace_minutes']))
      ? Number(merged['attendance.late_grace_minutes'])
      : config.defaults.lateGraceMinutes,
    qrStepSeconds: Math.min(60, Math.max(30, Number(merged['checkin.qr_step_seconds']) || config.defaults.qrStepSeconds)),
  };

  cache = settings;
  cacheUntil = now + 5_000;
  return settings;
}

export function invalidateSettings() {
  cache = null;
  cacheUntil = 0;
}

export async function saveSetting(key, value, actorId) {
  await pool.query(
    `insert into app_settings (key, value, updated_by, updated_at) values ($1, $2, $3, now())
     on conflict (key) do update set value = excluded.value, updated_by = excluded.updated_by, updated_at = now()`,
    [key, JSON.stringify({ value }), actorId],
  );
  invalidateSettings();
}

export const SETTING_KEYS = Object.keys(DEFAULTS);
