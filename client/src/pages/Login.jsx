import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth, useTheme } from '../lib/auth.jsx';
import { Alert } from '../components/ui.jsx';

const DEMO_ACCOUNTS = [
  { label: 'Student', email: 'ada.student@campus.edu', detail: 'Ada Obi · CSC 300' },
  { label: 'Lecturer', email: 'okafor@campus.edu', detail: 'Dr. Chidi Okafor' },
  { label: 'Admin', email: 'admin@campus.edu', detail: 'Ngozi Eze' },
];

export default function Login() {
  const { login } = useAuth();
  const { theme, toggle } = useTheme();
  const navigate = useNavigate();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async (event) => {
    event.preventDefault();
    setBusy(true);
    setError('');
    try {
      const user = await login(email.trim(), password);
      navigate(`/${user.role}`, { replace: true });
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  const fillDemo = (demoEmail) => {
    setEmail(demoEmail);
    setPassword('Campus123!');
    setError('');
  };

  return (
    <div className="auth-layout">
      <div style={{ position: 'fixed', top: 14, right: 16 }}>
        <button type="button" className="btn btn-secondary btn-sm" onClick={toggle} aria-label="Toggle dark mode">
          {theme === 'dark' ? '☀ Light' : '☾ Dark'}
        </button>
      </div>

      <div className="auth-card auth-wide">
        <div className="auth-pitch">
          <div>
            <div className="row" style={{ gap: 10, marginBottom: 18 }}>
              <span className="brand-mark" aria-hidden="true">✓</span>
              <strong style={{ fontSize: 17, letterSpacing: '-0.02em' }}>CampusCheck</strong>
            </div>
            <h2>Attendance that takes three taps.</h2>
            <p style={{ marginTop: 10, color: 'rgba(248,250,252,0.82)', fontSize: 14 }}>
              A rotating signed code per lecture. Live attendance for lecturers. Audited corrections and reports for
              administrators.
            </p>
          </div>
          <ul>
            <li>Codes rotate every 45 seconds — screenshots expire</li>
            <li>Duplicate check-ins are refused server-side</li>
            <li>Optional venue geofence, distance only — never your location trail</li>
            <li>Every correction keeps who, when and why</li>
          </ul>
          <p className="tiny" style={{ color: 'rgba(248,250,252,0.7)' }}>
            <Link to="/privacy" style={{ color: '#e0f2fe' }}>
              Privacy notice
            </Link>{' '}
            · University email required
          </p>
        </div>

        <div className="auth-body">
          <h1 style={{ marginBottom: 4 }}>Sign in</h1>
          <p className="small muted" style={{ marginBottom: 18 }}>
            Use your university account to continue.
          </p>

          <form className="stack" onSubmit={submit}>
            <div className="field">
              <label htmlFor="email">University email</label>
              <input
                id="email"
                className="input"
                type="email"
                autoComplete="email"
                inputMode="email"
                required
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                placeholder="you@campus.edu"
              />
            </div>
            <div className="field">
              <label htmlFor="password">Password</label>
              <input
                id="password"
                className="input"
                type="password"
                autoComplete="current-password"
                required
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                placeholder="••••••••"
              />
            </div>

            {error ? <Alert tone="error">{error}</Alert> : null}

            <button type="submit" className="btn btn-lg" disabled={busy}>
              {busy ? <span className="spinner" aria-hidden="true" /> : null}
              {busy ? 'Signing in…' : 'Sign in'}
            </button>
          </form>

          <div style={{ marginTop: 18 }}>
            <div className="tiny muted" style={{ textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 8 }}>
              Demo accounts · password Campus123!
            </div>
            <div className="stack-sm">
              {DEMO_ACCOUNTS.map((account) => (
                <button key={account.email} type="button" className="demo-chip" onClick={() => fillDemo(account.email)}>
                  <span>
                    <strong>{account.label}</strong>
                    <span className="muted"> · {account.detail}</span>
                  </span>
                  <span className="tiny muted">Use →</span>
                </button>
              ))}
            </div>
          </div>

          <hr className="divider" />
          <p className="small muted">
            New student?{' '}
            <Link to="/register">Create an account</Link> with your university email.
          </p>
        </div>
      </div>
    </div>
  );
}
