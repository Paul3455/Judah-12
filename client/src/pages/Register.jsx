import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api } from '../lib/api.js';
import { Alert, Spinner } from '../components/ui.jsx';

export default function Register() {
  const navigate = useNavigate();
  const [departments, setDepartments] = useState([]);
  const [form, setForm] = useState({
    name: '',
    email: '',
    password: '',
    matric_number: '',
    program: '',
    level: '300',
    department_id: '',
  });
  const [error, setError] = useState('');
  const [fieldErrors, setFieldErrors] = useState({});
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState(null);

  useEffect(() => {
    api
      .get('/auth/departments')
      .then((payload) => setDepartments(payload.departments))
      .catch(() => setDepartments([]));
  }, []);

  const update = (key) => (event) => setForm((current) => ({ ...current, [key]: event.target.value }));

  const submit = async (event) => {
    event.preventDefault();
    setBusy(true);
    setError('');
    setFieldErrors({});
    try {
      const payload = await api.post('/auth/register', {
        name: form.name,
        email: form.email,
        password: form.password,
        matricNumber: form.matric_number,
        program: form.program,
        level: Number(form.level),
        departmentId: form.department_id || undefined,
      });
      setResult(payload);
    } catch (err) {
      setError(err.message);
      setFieldErrors(err.fieldErrors() || {});
    } finally {
      setBusy(false);
    }
  };

  if (result) {
    const token = result.verificationUrl ? new URL(result.verificationUrl).searchParams.get('token') : null;
    return (
      <div className="auth-layout">
        <div className="auth-card">
          <h1 style={{ marginBottom: 8 }}>Check your university email</h1>
          <p className="small muted" style={{ marginBottom: 16 }}>
            We sent a verification link to <strong>{result.user.email}</strong>. The link expires in 24 hours.
          </p>
          {result.verificationUrl ? (
            <>
              <Alert tone="info">
                Email delivery is not configured in this environment, so here is the verification link.
              </Alert>
              <button type="button" className="btn btn-lg" style={{ marginTop: 12 }} onClick={() => navigate(`/verify?token=${token}`)}>
                Verify this account now
              </button>
            </>
          ) : null}
          <p className="small muted" style={{ marginTop: 16 }}>
            Already verified? <Link to="/login">Sign in</Link>
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="auth-layout">
      <div className="auth-card">
        <div className="row" style={{ marginBottom: 12 }}>
          <span className="brand-mark" aria-hidden="true">✓</span>
          <strong>CampusCheck</strong>
        </div>
        <h1 style={{ marginBottom: 4 }}>Create a student account</h1>
        <p className="small muted" style={{ marginBottom: 16 }}>
          Student sign-up only. Lecturers and administrators are created by your department office.
        </p>

        <form className="stack" onSubmit={submit}>
          <div className="field">
            <label htmlFor="name">Full name</label>
            <input id="name" className="input" required value={form.name} onChange={update('name')} autoComplete="name" />
            {fieldErrors.name ? <span className="tiny" style={{ color: 'var(--danger)' }}>{fieldErrors.name}</span> : null}
          </div>

          <div className="field">
            <label htmlFor="email">University email</label>
            <input id="email" className="input" type="email" required value={form.email} onChange={update('email')} placeholder="you@campus.edu" autoComplete="email" />
            {fieldErrors.email ? <span className="tiny" style={{ color: 'var(--danger)' }}>{fieldErrors.email}</span> : null}
          </div>

          <div className="field">
            <label htmlFor="matric">Matric number</label>
            <input id="matric" className="input" required value={form.matric_number} onChange={update('matric_number')} placeholder="CSC/22/1043" />
            {fieldErrors.matricNumber ? <span className="tiny" style={{ color: 'var(--danger)' }}>{fieldErrors.matricNumber}</span> : null}
          </div>

          <div className="field">
            <label htmlFor="program">Programme</label>
            <input id="program" className="input" required value={form.program} onChange={update('program')} placeholder="Computer Science" />
          </div>

          <div className="grid" style={{ gridTemplateColumns: '1fr 1fr' }}>
            <div className="field">
              <label htmlFor="level">Level</label>
              <select id="level" className="select" value={form.level} onChange={update('level')}>
                {[100, 200, 300, 400, 500, 600, 700].map((level) => (
                  <option key={level} value={level}>
                    {level}
                  </option>
                ))}
              </select>
            </div>
            <div className="field">
              <label htmlFor="department">Department</label>
              <select id="department" className="select" value={form.department_id} onChange={update('department_id')}>
                <option value="">Select…</option>
                {departments.map((department) => (
                  <option key={department.id} value={department.id}>
                    {department.code} — {department.name}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="field">
            <label htmlFor="password">Password</label>
            <input
              id="password"
              className="input"
              type="password"
              required
              minLength={8}
              value={form.password}
              onChange={update('password')}
              autoComplete="new-password"
              placeholder="At least 8 characters"
            />
            {fieldErrors.password ? <span className="tiny" style={{ color: 'var(--danger)' }}>{fieldErrors.password}</span> : null}
          </div>

          <p className="tiny muted">
            We collect your name, university email, matric number, programme and attendance records. Location is used
            only to confirm you are in the venue when your lecturer enables it, and only the distance is stored.{' '}
            <Link to="/privacy">Privacy notice</Link>
          </p>

          {error ? <Alert tone="error">{error}</Alert> : null}

          <button type="submit" className="btn btn-lg" disabled={busy}>
            {busy ? 'Creating account…' : 'Create account'}
          </button>
        </form>

        <p className="small muted" style={{ marginTop: 14 }}>
          Already have an account? <Link to="/login">Sign in</Link>
        </p>
      </div>
    </div>
  );
}
