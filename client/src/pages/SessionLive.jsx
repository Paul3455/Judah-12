import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { api, downloadFile } from '../lib/api.js';
import { formatDate, formatTime, statusLabel, STATUSES } from '../lib/format.js';
import { Alert, Card, EmptyState, Modal, SkeletonRows, Stat, StatusPill } from '../components/ui.jsx';

export default function SessionLive() {
  const { sessionId } = useParams();
  const [session, setSession] = useState(null);
  const [live, setLive] = useState(null);
  const [code, setCode] = useState(null);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState('');
  const [tick, setTick] = useState(Date.now());
  const [correcting, setCorrecting] = useState(null);
  const [overrideStatus, setOverrideStatus] = useState('present');
  const [reason, setReason] = useState('');
  const [confirmEnd, setConfirmEnd] = useState(false);

  const refresh = useCallback(async () => {
    try {
      const livePayload = await api.get(`/sessions/${sessionId}/live`);
      setLive(livePayload);
      setSession(livePayload.session);
      if (livePayload.session.status === 'open') {
        const codePayload = await api.get(`/sessions/${sessionId}/code`).catch(() => null);
        if (codePayload) setCode(codePayload);
      } else {
        setCode(null);
      }
      setError('');
    } catch (err) {
      setError(err.message);
    }
  }, [sessionId]);

  useEffect(() => {
    refresh();
    const poll = setInterval(refresh, 5000);
    const clock = setInterval(() => setTick(Date.now()), 1000);
    return () => {
      clearInterval(poll);
      clearInterval(clock);
    };
  }, [refresh]);

  const remaining = useMemo(() => {
    if (!code?.expires_at) return 0;
    return Math.max(0, Math.round((new Date(code.expires_at).getTime() - tick) / 1000));
  }, [code, tick]);

  useEffect(() => {
    if (code && remaining === 0) refresh();
  }, [code, remaining, refresh]);

  const act = async (label, action, successMessage) => {
    setBusy(label);
    setError('');
    try {
      await action();
      if (successMessage) setNotice(successMessage);
      await refresh();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy('');
    }
  };

  const startSession = () =>
    act('start', () => api.post(`/sessions/${sessionId}/open`), 'Session started. The code is live now.');

  const endSession = () =>
    act(
      'end',
      async () => {
        await api.post(`/sessions/${sessionId}/close`);
        setConfirmEnd(false);
      },
      'Session ended. Students who did not check in were marked absent.',
    );

  const markAbsentees = () =>
    act('absent', async () => {
      const result = await api.post(`/attendance/sessions/${sessionId}/mark-absent`);
      setNotice(`${result.marked_absent} student${result.marked_absent === 1 ? '' : 's'} marked absent.`);
    });

  const saveCorrection = async () => {
    if (!correcting) return;
    setBusy('correct');
    setError('');
    try {
      await api.patch(`/attendance/${correcting.record_id}`, { status: overrideStatus, reason: reason.trim() });
      setNotice(`${correcting.name} updated to ${statusLabel(overrideStatus)}. The change is in the audit trail.`);
      setCorrecting(null);
      setReason('');
      await refresh();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy('');
    }
  };

  if (!session && !error) {
    return (
      <Card>
        <SkeletonRows rows={5} />
      </Card>
    );
  }

  if (!session && error) {
    return <Alert tone="error">{error}</Alert>;
  }

  const counts = live?.counts ?? {};
  const students = live?.students ?? [];

  return (
    <div className="stack" style={{ gap: 16 }}>
      <div className="row-between">
        <Link className="btn btn-secondary btn-sm" to="/lecturer">
          ← Sessions
        </Link>
        <StatusPill status={session.status} />
      </div>

      <div>
        <h1>
          {session.course_code} <span className="muted" style={{ fontSize: 15 }}>{session.course_title}</span>
        </h1>
        <p className="small muted">
          {formatDate(session.date)} · {formatTime(session.start_time)}–{formatTime(session.end_time)} · {session.venue}
          {session.require_geofence ? ' · venue verified' : ''}
        </p>
      </div>

      {error ? <Alert tone="error">{error}</Alert> : null}
      {notice ? (
        <Alert tone="ok" action={<button type="button" className="btn btn-ghost btn-sm" onClick={() => setNotice('')}>Dismiss</button>}>
          {notice}
        </Alert>
      ) : null}

      {session.status !== 'open' ? (
        <Card>
          <div className="stack">
            <h2>{session.status === 'scheduled' ? 'Ready to start' : 'Session ended'}</h2>
            <p className="small muted">
              {session.status === 'scheduled'
                ? 'Starting the session makes check-in available immediately and shows the rotating code.'
                : 'Check-in is closed. You can still correct records below.'}
            </p>
            {session.status === 'scheduled' ? (
              <button type="button" className="btn btn-lg" onClick={startSession} disabled={busy === 'start'}>
                {busy === 'start' ? 'Starting…' : 'Start session'}
              </button>
            ) : null}
          </div>
        </Card>
      ) : null}

      {session.status === 'open' && code ? (
        <Card>
          <div className="stack">
            <div className="qr-frame">
              <img src={code.qr_image} alt="Rotating check-in QR code" />
            </div>

            <div className="center">
              <div className="tiny muted" style={{ textTransform: 'uppercase', letterSpacing: '0.08em' }}>or type</div>
              <div className="big-code" aria-live="polite">
                {code.code6}
              </div>
            </div>

            <div className="countdown">
              <span className="mono">{String(Math.floor(remaining / 60)).padStart(1, '0')}:{String(remaining % 60).padStart(2, '0')}</span>
              <div className="countdown-bar">
                <span style={{ width: `${Math.max(0, Math.min(100, (remaining / (code.step_seconds || 45)) * 100))}%` }} />
              </div>
              <span className="tiny muted">refreshes</span>
            </div>

            <div className="grid" style={{ gridTemplateColumns: '1fr 1fr' }}>
              <button type="button" className="btn btn-secondary" onClick={markAbsentees} disabled={busy === 'absent'}>
                Mark absentees
              </button>
              <button type="button" className="btn btn-danger" onClick={() => setConfirmEnd(true)} disabled={busy === 'end'}>
                End session
              </button>
            </div>

            <p className="tiny muted center">
              The code and QR change every {code.step_seconds} seconds. A screenshot stops working immediately.
            </p>
          </div>
        </Card>
      ) : null}

      <div className="stat-grid">
        <Stat label="Present" value={counts.present ?? 0} tone="ok" />
        <Stat label="Late" value={counts.late ?? 0} tone="warn" />
        <Stat label="Absent" value={counts.absent ?? 0} tone="danger" />
        <Stat label="Not in yet" value={counts.not_checked_in ?? 0} hint={`${live?.enrolled ?? 0} enrolled`} />
      </div>

      <Card
        title="Attendance"
        action={
          <div className="row" style={{ gap: 6 }}>
            <button type="button" className="btn btn-sm btn-secondary" onClick={() => downloadFile(`/reports/export?format=csv&session_id=${sessionId}`)}>
              CSV
            </button>
            <button type="button" className="btn btn-sm btn-secondary" onClick={() => downloadFile(`/reports/export?format=xlsx&session_id=${sessionId}`)}>
              XLSX
            </button>
          </div>
        }
      >
        {live === null ? (
          <SkeletonRows rows={6} />
        ) : students.length === 0 ? (
          <EmptyState icon="👥" title="No students enrolled" hint="Enrol students from the admin area." />
        ) : (
          <div className="list">
            {students.map((student) => (
              <div className="list-item" key={student.student_id} style={{ alignItems: 'flex-start' }}>
                <div className="grow">
                  <div style={{ fontWeight: 600 }}>
                    {student.name}
                    {student.flagged ? <span className="pill pill-flag" style={{ marginLeft: 8 }}>Flagged</span> : null}
                  </div>
                  <div className="tiny muted">
                    {student.matric_number || '—'}
                    {student.checked_in_at ? ` · ${formatTime(student.checked_in_at)}` : ''}
                    {student.check_in_method ? ` · ${student.check_in_method}` : ''}
                    {student.location_verified === false ? ' · outside venue' : ''}
                  </div>
                  {student.flag_reason ? <div className="tiny" style={{ color: 'var(--danger)' }}>{student.flag_reason.replace('_', ' ')}</div> : null}
                  {student.override_reason ? (
                    <div className="tiny" style={{ color: 'var(--info)' }}>corrected: {student.override_reason}</div>
                  ) : null}
                </div>
                <div className="row" style={{ gap: 6 }}>
                  <StatusPill status={student.status} />
                  <button
                    type="button"
                    className="btn btn-sm btn-secondary"
                    onClick={() => {
                      setCorrecting(student);
                      setOverrideStatus(student.status || 'present');
                      setReason('');
                    }}
                  >
                    Correct
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>

      {correcting ? (
        <Modal
          title={`Correct ${correcting.name}`}
          onClose={() => setCorrecting(null)}
          footer={
            <div className="grid" style={{ gridTemplateColumns: '1fr 1fr' }}>
              <button type="button" className="btn btn-secondary" onClick={() => setCorrecting(null)}>
                Cancel
              </button>
              <button type="button" className="btn" onClick={saveCorrection} disabled={busy === 'correct' || reason.trim().length < 4}>
                {busy === 'correct' ? 'Saving…' : 'Save correction'}
              </button>
            </div>
          }
        >
          <div className="field">
            <label htmlFor="new-status">New status</label>
            <select id="new-status" className="select" value={overrideStatus} onChange={(event) => setOverrideStatus(event.target.value)}>
              {STATUSES.map((status) => (
                <option key={status} value={status}>
                  {statusLabel(status)}
                </option>
              ))}
            </select>
          </div>
          <div className="field">
            <label htmlFor="reason">Reason (required)</label>
            <textarea
              id="reason"
              rows={3}
              value={reason}
              onChange={(event) => setReason(event.target.value)}
              placeholder="e.g. Student showed a valid medical note; attendance confirmed by class rep."
            />
          </div>
          <p className="tiny muted">
            This change is recorded in the audit trail with your name, the time and this reason. The student is notified.
          </p>
        </Modal>
      ) : null}

      {confirmEnd ? (
        <Modal
          title="End this session?"
          onClose={() => setConfirmEnd(false)}
          footer={
            <div className="grid" style={{ gridTemplateColumns: '1fr 1fr' }}>
              <button type="button" className="btn btn-secondary" onClick={() => setConfirmEnd(false)}>
                Keep open
              </button>
              <button type="button" className="btn btn-danger" onClick={endSession} disabled={busy === 'end'}>
                {busy === 'end' ? 'Ending…' : 'End session'}
              </button>
            </div>
          }
        >
          <p className="small">
            Check-in closes immediately and every enrolled student who has not checked in will be recorded as
            <strong> absent</strong> and notified. You can still correct individual records afterwards.
          </p>
        </Modal>
      ) : null}
    </div>
  );
}
