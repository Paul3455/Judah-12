import { pool } from '../db.js';

/**
 * Append-only audit trail. Call inside the same transaction as the mutation it
 * describes so a record can never change without its history.
 * Values are diffed, never wholesale, and never contain secrets or coordinates.
 */
export async function logAudit(
  client,
  { actorId = null, action, entityType, entityId = null, oldValue = null, newValue = null, reason = null, ip = null },
) {
  const runner = client ?? pool;
  await runner.query(
    `insert into audit_logs (actor_id, action, entity_type, entity_id, old_value, new_value, reason, ip)
     values ($1, $2, $3, $4, $5, $6, $7, $8)`,
    [
      actorId,
      action,
      entityType,
      entityId,
      oldValue ? JSON.stringify(oldValue) : null,
      newValue ? JSON.stringify(newValue) : null,
      reason,
      ip,
    ],
  );
}

/** Reduces a row to the keys that actually changed. */
export function diff(before, after, keys) {
  const changed = {};
  for (const key of keys) {
    const a = before?.[key] ?? null;
    const b = after?.[key] ?? null;
    const same =
      a instanceof Date || b instanceof Date ? new Date(a).getTime() === new Date(b).getTime() : a === b;
    if (!same) changed[key] = { old: a, new: b };
  }
  return changed;
}
