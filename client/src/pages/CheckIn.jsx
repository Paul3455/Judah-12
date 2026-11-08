import { useCallback, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../lib/api.js';
import { dequeueCheckIn, enqueueCheckIn, getDeviceId, queueLength, readQueue } from '../lib/offline.js';
import { formatTime, statusLabel } from '../lib/format.js';
import { Alert, Card, Modal } from '../components/ui.jsx';
import QrScanner from '../components/QrScanner.jsx';

async function locate() {
  if (!navigator.geolocation) return null;
  try {
    const permission = await navigator.permissions?.query({ name: 'geolocation' });
    if (permission && permission.state === 'denied') return null;
  } catch {
    /* permissions API unavailable — try anyway */
  }
  return new Promise((resolve) => {
    let settled = false;
    const finish = (value) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve(value);
    };
    const timer = setTimeout(() => finish(null), 6000);
    navigator.geolocation.getCurrentPosition(
      (position) => finish({ lat: position.coords.latitude, lng: position.coords.longitude }),
      () => finish(null),
      { enableHighAccuracy: true, timeout: 5500, maximumAge: 30000 },
    );
  });
}

export default function CheckIn() {
  const [code, setCode] = useState('');
  const [scanning, setScanning] = useState(false);
  const [phase, setPhase] = useState('idle');
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);
  const [queued, setQueued] = useState(queueLength());
  const [notice, setNotice] = useState('');
  const submitting = useRef(false);
  const inputRef = useRef(null);

  const submit = useCallback(
    async ({ submittedCode, qrPayload } = {}) => {
      if (submitting.current) return;
      const body = { device_id: getDeviceId() };
      if (qrPayload) body.qr_payload = qrPayload;
      else body.code = (submittedCode ?? code).trim();

      if (!body.qr_payload && !body.code) {
        setError({ message: 'Enter the six-digit code shown in class.' });
        return;
      }

      submitting.current = true;
      setError(null);
      setPhase('submitting');

      const location = await locate();
      if (location) body.location = location;

      try {
        const payload = await api.post('/attendance/check-in', body);
        setResult(payload);
        setPhase('done');
        setCode('');
        setScanning(false);
      } catch (err) {
        if (err.isOffline) {
          enqueueCheckIn(body);
          setQueued(queueLength());
          setPhase('queued');
          setCode('');
          setScanning(false);
        } else {
          setError({ message: err.message, code: err.code, details: err.details });
          setPhase('error');
        }
      } finally {
        submitting.current = false;
      }
    },
    [code],
  );

  const flushQueue = useCallback(async () => {
    const items = readQueue();
    if (!items.length) return;
    let delivered = 0;
    for (const item of items) {
      try {
        await api.post('/attendance/check-in', { ...item.payload, captured_at: item.queued_at });
        dequeueCheckIn(item.id);
        delivered += 1;
      } catch (err) {
        if (err.isOffline) break;
        // The server rejected it (expired window, duplicate, not enrolled):
        // retrying can never succeed, so drop it and tell the student.
        dequeueCheckIn(item.id);
        setNotice(`A queued check-in could not be accepted: ${err.message}`);
      }
    }
    setQueued(queueLength());
    if (delivered) {
      setNotice(`${delivered} queued check-in${delivered > 1 ? 's' : ''} synced.`);
    }
  }, []);

  useEffect(() => {
    flushQueue();
    const onOnline = () => flushQueue();
    window.addEventListener('online', onOnline);
    return () => window.removeEventListener('online', onOnline);
  }, [flushQueue]);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const onCodeChange = (event) => {
    const digits = event.target.value.replace(/\D/g, '').slice(0, 6);
    setCode(digits);
    if (digits.length === 6) submit({ submittedCode: digits });
  };

  const reset = () => {
    setPhase('idle');
    setResult(null);
    setError(null);
    setCode('');
  };

  return (
    <div className="stack" style={{ gap: 16 }}>
      <div>
        <h1>Check in</h1>
        <p className="small muted">Scan the code on the screen, or type the six digits your lecturer shows.</p>
      </div>

      {notice ? <Alert tone="info" action={<button type="button" className="btn btn-ghost btn-sm" onClick={() => setNotice('')}>Dismiss</button>}>{notice}</Alert> : null}
      {queued > 0 ? (
        <Alert tone="warn">
          {queued} check-in{queued > 1 ? 's are' : ' is'} queued on this device and will sync when you are back online.
        </Alert>
      ) : null}

      {phase === 'done' && result ? (
        <Card>
          <div className="stack">
            <div className="row" style={{ gap: 10 }}>
              <span
                aria-hidden="true"
                style={{
                  width: 40,
                  height: 40,
                  borderRadius: 999,
                  display: 'grid',
                  placeItems: 'center',
                  background: 'var(--ok-soft)',
                  color: 'var(--ok)',
                  fontSize: 20,
                }}
              >
                ✓
              </span>
              <div>
                <h2>Checked in — {statusLabel(result.record.status)}</h2>
                <p className="small muted">
                  {result.session.course_code} · {result.session.venue} · {formatTime(result.record.checked_in_at)}
                </p>
              </div>
            </div>

            {result.record.flagged ? (
              <Alert tone="warn">
                This check-in was flagged ({result.record.flag_reason?.replace('_', ' ')}). Your lecturer can review it.
              </Alert>
            ) : null}

            <div className="grid" style={{ gridTemplateColumns: '1fr 1fr' }}>
              <Link to="/student/history" className="btn btn-secondary">
                View history
              </Link>
              <button type="button" className="btn" onClick={reset}>
                Check in again
              </button>
            </div>
          </div>
        </Card>
      ) : null}

      {phase === 'queued' ? (
        <Card>
          <div className="stack">
            <h2>Saved on this device</h2>
            <p className="small muted">
              You are offline, so this check-in is queued. It will be sent automatically when your connection returns.
              Your lecturer can also mark you present from their attendance list.
            </p>
            <button type="button" className="btn btn-secondary" onClick={reset}>
              Enter another code
            </button>
          </div>
        </Card>
      ) : null}

      {phase !== 'done' && phase !== 'queued' ? (
        <Card>
          <div className="stack">
            <label htmlFor="checkin-code" className="small muted center">
              Six-digit code
            </label>
            <input
              id="checkin-code"
              ref={inputRef}
              className="code-input"
              inputMode="numeric"
              autoComplete="one-time-code"
              pattern="[0-9]*"
              maxLength={6}
              value={code}
              onChange={onCodeChange}
              placeholder="000000"
              aria-describedby="code-hint"
              disabled={phase === 'submitting'}
            />
            <p id="code-hint" className="tiny muted center" aria-live="polite">
              {phase === 'submitting' ? 'Sending your check-in…' : 'The code changes every minute.'}
            </p>

            {error ? (
              <Alert
                tone="error"
                action={
                  error.code === 'already_checked_in' ? (
                    <Link className="btn btn-secondary btn-sm" to="/student/history">
                      History
                    </Link>
                  ) : null
                }
              >
                {error.message}
                {error.code === 'geofence_failed' && error.details?.distanceM
                  ? ` (You are ${error.details.distanceM} m away; the limit is ${error.details.radiusM} m.)`
                  : ''}
              </Alert>
            ) : null}

            <button
              type="button"
              className="btn btn-lg"
              onClick={() => submit()}
              disabled={phase === 'submitting' || code.length < 6}
            >
              {phase === 'submitting' ? <span className="spinner" aria-hidden="true" /> : null}
              {phase === 'submitting' ? 'Checking in…' : 'Check in'}
            </button>

            <button type="button" className="btn btn-secondary" onClick={() => setScanning(true)}>
              Scan QR code
            </button>

            <p className="tiny muted center">
              📍 If your lecturer enables venue verification, your location is used once to confirm you are in the room.
              Only the distance is stored — never your coordinates.{' '}
              <Link to="/privacy">Privacy notice</Link>
            </p>
          </div>
        </Card>
      ) : null}

      {scanning ? (
        <Modal title="Scan the code" onClose={() => setScanning(false)}>
          <QrScanner
            onDetected={(payload) => {
              setScanning(false);
              submit({ qrPayload: payload });
            }}
            onClose={() => setScanning(false)}
          />
        </Modal>
      ) : null}
    </div>
  );
}
