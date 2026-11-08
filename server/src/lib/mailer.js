import nodemailer from 'nodemailer';
import { config } from '../config.js';

let transporter = null;

function getTransporter() {
  if (!config.smtp.host) return null;
  if (!transporter) {
    transporter = nodemailer.createTransport({
      host: config.smtp.host,
      port: config.smtp.port,
      secure: config.smtp.port === 465,
      auth: config.smtp.user ? { user: config.smtp.user, pass: config.smtp.pass } : undefined,
    });
  }
  return transporter;
}

/**
 * Sends email when SMTP is configured; otherwise writes it to the API log so a
 * development environment never silently swallows a message. The in-app
 * notification is created separately and always exists.
 * Never throws: notification delivery must not fail the business transaction.
 */
export async function sendMail({ to, subject, text }) {
  const transport = getTransporter();
  if (!transport) {
    console.log(`[mail:dev] to=${to} subject="${subject}"\n${text}`);
    return { delivered: false, reason: 'smtp_not_configured' };
  }
  try {
    await transport.sendMail({ from: config.smtp.from, to, subject, text });
    return { delivered: true };
  } catch (err) {
    console.error('[mail] delivery failed:', err.message);
    return { delivered: false, reason: 'smtp_error' };
  }
}
