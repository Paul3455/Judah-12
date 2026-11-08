import { useEffect, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { api } from '../lib/api.js';
import { Alert, Spinner } from '../components/ui.jsx';

export default function Verify() {
  const [params] = useSearchParams();
  const token = params.get('token') || '';
  const [state, setState] = useState({ status: 'working', message: '' });
  const started = useRef(false);

  useEffect(() => {
    if (started.current) return;
    started.current = true;

    if (!token) {
      setState({ status: 'error', message: 'This link is missing its verification token.' });
      return;
    }
    api
      .post('/auth/verify-email', { token })
      .then(() => setState({ status: 'done', message: 'Your email is verified. You can sign in now.' }))
      .catch((err) => setState({ status: 'error', message: err.message }));
  }, [token]);

  return (
    <div className="auth-layout">
      <div className="auth-card">
        <h1 style={{ marginBottom: 10 }}>Email verification</h1>
        {state.status === 'working' ? <Spinner label="Verifying your email…" /> : null}
        {state.status === 'done' ? (
          <>
            <Alert tone="ok">{state.message}</Alert>
            <Link className="btn btn-lg" to="/login" style={{ marginTop: 14 }}>
              Go to sign in
            </Link>
          </>
        ) : null}
        {state.status === 'error' ? (
          <>
            <Alert tone="error">{state.message}</Alert>
            <Link className="btn btn-secondary" to="/register" style={{ marginTop: 14 }}>
              Start again
            </Link>
          </>
        ) : null}
      </div>
    </div>
  );
}
