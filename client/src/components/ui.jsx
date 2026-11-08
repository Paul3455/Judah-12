import { useEffect } from 'react';
import { statusLabel } from '../lib/format.js';

export function Card({ title, action, children, className = '', padded = true }) {
  return (
    <section className={`card ${padded ? '' : 'card-flat'} ${className}`}>
      {title || action ? (
        <div className="row-between" style={{ marginBottom: 12 }}>
          {title ? <h2>{title}</h2> : <span />}
          {action}
        </div>
      ) : null}
      {children}
    </section>
  );
}

export function StatusPill({ status, prefix }) {
  if (!status) return <span className="pill pill-closed">{prefix || 'Not checked in'}</span>;
  return <span className={`pill pill-${status}`}>{prefix ? `${prefix} · ` : ''}{statusLabel(status)}</span>;
}

export function Stat({ label, value, hint, tone }) {
  return (
    <div className="stat">
      <div className="stat-label">{label}</div>
      <div className="stat-value" style={tone ? { color: `var(--${tone})` } : undefined}>
        {value}
      </div>
      {hint ? <div className="tiny muted">{hint}</div> : null}
    </div>
  );
}

export function Spinner({ label }) {
  return (
    <div className="row small muted" role="status" aria-live="polite" style={{ padding: '10px 0' }}>
      <span className="spinner" aria-hidden="true" />
      {label || 'Loading…'}
    </div>
  );
}

export function EmptyState({ icon = '•', title, hint, action }) {
  return (
    <div className="empty">
      <div style={{ fontSize: 22, marginBottom: 6 }} aria-hidden="true">
        {icon}
      </div>
      <div style={{ fontWeight: 600, color: 'var(--ink)' }}>{title}</div>
      {hint ? <div className="small" style={{ marginTop: 4 }}>{hint}</div> : null}
      {action ? <div style={{ marginTop: 12 }}>{action}</div> : null}
    </div>
  );
}

export function Alert({ tone = 'info', children, action }) {
  return (
    <div className={`banner ${tone === 'error' ? 'banner-danger' : tone === 'warn' ? 'banner-warn' : tone === 'ok' ? 'banner-ok' : 'banner-info'}`} role={tone === 'error' ? 'alert' : 'status'}>
      <div className="grow">{children}</div>
      {action}
    </div>
  );
}

export function Modal({ title, children, footer, onClose }) {
  useEffect(() => {
    const onKey = (event) => {
      if (event.key === 'Escape') onClose?.();
    };
    document.addEventListener('keydown', onKey);
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = previous;
    };
  }, [onClose]);

  return (
    <div
      className="modal-backdrop"
      role="dialog"
      aria-modal="true"
      aria-label={title}
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose?.();
      }}
    >
      <div className="modal">
        <div className="row-between" style={{ marginBottom: 14 }}>
          <h2>{title}</h2>
          <button type="button" className="btn btn-icon" onClick={onClose} aria-label="Close">
            ✕
          </button>
        </div>
        <div className="stack">{children}</div>
        {footer ? <div style={{ marginTop: 16 }}>{footer}</div> : null}
      </div>
    </div>
  );
}

export function Toast({ message }) {
  if (!message) return null;
  return (
    <div className="toast" role="status" aria-live="polite">
      {message}
    </div>
  );
}

export function SkeletonRows({ rows = 3 }) {
  return (
    <div className="stack-sm" aria-hidden="true">
      {Array.from({ length: rows }, (_, index) => (
        <div key={index} className="skeleton" style={{ width: `${92 - index * 12}%` }} />
      ))}
    </div>
  );
}

export function ProgressBar({ percentage, threshold = 75, label }) {
  const value = percentage ?? 0;
  const tone = percentage === null ? '' : value < threshold ? 'danger' : value < threshold + 10 ? 'warn' : '';
  return (
    <div className="stack-sm">
      <div className={`progress ${tone}`} role="progressbar" aria-valuenow={value} aria-valuemin={0} aria-valuemax={100} aria-label={label || 'Attendance'} data-tone={tone}>
        <span style={{ width: `${value}%`, background: tone === 'danger' ? 'var(--danger)' : tone === 'warn' ? 'var(--warn)' : 'var(--ok)' }} />
      </div>
    </div>
  );
}
