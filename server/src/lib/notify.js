import { pool } from '../db.js';
import { sendMail } from './mailer.js';

/**
 * Creates an in-app notification (always) and optionally emails it.
 * Never throws: a notification failure must not roll back attendance work.
 */
export async function notify({ userId, email, type, title, body, data = null, emailText = null }) {
  try {
    await pool.query(
      `insert into notifications (user_id, type, title, body, data) values ($1, $2, $3, $4, $5)`,
      [userId, type, title, body, data ? JSON.stringify(data) : null],
    );
  } catch (err) {
    console.error('[notify] could not store notification:', err.message);
  }

  if (email) {
    const result = await sendMail({ to: email, subject: title, text: emailText || body });
    if (!result.delivered) {
      console.log(`[notify] in-app only for user ${userId} (${result.reason})`);
    }
  }
}

/** Adds many notifications in one round-trip, for class-wide events. */
export async function notifyMany(recipients, { type, title, body, data = null }) {
  if (!recipients.length) return;
  const values = [];
  const params = [];
  recipients.forEach((recipient, index) => {
    const base = index * 5;
    values.push(`($${base + 1}, $${base + 2}, $${base + 3}, $${base + 4}, $${base + 5})`);
    params.push(recipient.id, type, title, body, data ? JSON.stringify(data) : null);
  });
  try {
    await pool.query(
      `insert into notifications (user_id, type, title, body, data) values ${values.join(',')}`,
      params,
    );
  } catch (err) {
    console.error('[notify] bulk insert failed:', err.message);
  }
}
