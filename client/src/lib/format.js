export const STATUSES = ['present', 'late', 'absent', 'excused'];

export const statusLabel = (status) => {
  if (!status) return 'Not checked in';
  return status.charAt(0).toUpperCase() + status.slice(1);
};

export function formatTime(value) {
  if (!value) return '—';
  return new Date(value).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

export function formatDate(value) {
  if (!value) return '—';
  const date = typeof value === 'string' && value.length === 10 ? new Date(`${value}T00:00:00`) : new Date(value);
  return date.toLocaleDateString([], { weekday: 'short', day: 'numeric', month: 'short' });
}

export function formatDateLong(value) {
  if (!value) return '—';
  const date = typeof value === 'string' && value.length === 10 ? new Date(`${value}T00:00:00`) : new Date(value);
  return date.toLocaleDateString([], { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
}

export function formatDateTime(value) {
  if (!value) return '—';
  return `${formatDate(value)} · ${formatTime(value)}`;
}

/** danger below the warning threshold, warn just above it, otherwise neutral. */
export function percentTone(percentage, threshold = 75) {
  if (percentage === null || percentage === undefined) return '';
  if (percentage < threshold) return 'danger';
  if (percentage < threshold + 10) return 'warn';
  return '';
}

export function todayIsoDate() {
  const now = new Date();
  const utc = new Date(now.getTime() - now.getTimezoneOffset() * 60000);
  return utc.toISOString().slice(0, 10);
}

export function minutesFromNowIso(minutes) {
  return new Date(Date.now() + minutes * 60000).toISOString();
}

/** Value for <input type="datetime-local"> from an ISO string. */
export function toLocalInputValue(value) {
  const date = value ? new Date(value) : new Date();
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60000);
  return local.toISOString().slice(0, 16);
}

export function fromLocalInputValue(value) {
  return value ? new Date(value).toISOString() : null;
}
