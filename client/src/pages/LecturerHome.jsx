import { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api } from '../lib/api.js';
import { formatDate, formatTime, toLocalInputValue } from '../lib/format.js';
import { Alert, Card, EmptyState, SkeletonRows, StatusPill } from '../components/ui.jsx';

const emptyForm = (courses) => {
  const first = courses[0];
  const start = new Date(Date.now() + 5 * 60 * 1000);
  const end = new Date(start.getTime() + 2 * 60 * 60 * 1000);
  return {
    course_id: first?.id ?? '',
    start: toLocalInputValue(start),
    end: toLocalInputValue(end),
    venue: first?.venue ?? '',
    require_geofence: Boolean(first?.geofence_enabled),
  };
};

export default function LecturerHome() {
  const navigate = useNavigate();
  const [courses, setCourses] = useState([]);
  const [sessions, setSessions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(null);
  const [busy, setBusy] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const [coursePayload, sessionPayload] = await Promise.all([api.get('/courses'), api.get('/sessions')]);
      setCourses(coursePayload.courses);
      setSessions(sessionPayload.sessions);
      setForm((current) => current ?? emptyForm(coursePayload.courses));
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const startToday = () => {
    const start = new Date();
    const end = new Date(start.getTime() + 2 * 60 * 60 * 1000);
    setForm({
      ...(form ?? emptyForm(courses)),
      start: toLocalInputValue(start),
      end: toLocalInputValue(end),
    });
    setShowForm(true);
  };

  const createSession = async (openNow) => {
    if (!form?.course_id) {
      setError('Choose a course first.');
      return;
    }
    setBusy(openNow ? 'open' : 'schedule');
    setError('');
    try {
      const created = await api.post('/sessions', {
        course_id: form.course_id,
        start_time: new Date(form.start).toISOString(),
        end_time: new Date(form.end).toISOString(),
        venue: form.venue || courses.find((course) => course.id === form.course_id)?.venue || 'Lecture hall',
        require_geofence: form.require_geofence,
      });
      if (openNow) {
        await api.post(`/sessions/${created.session.id}/open`);
        navigate(`/lecturer/sessions/${created.session.id}`);
        return;
      }
      setNotice('Session scheduled. Students will see it on their timetable.');
      setShowForm(false);
      await load();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy('');
    }
  };

  const openSession = async (sessionId) => {
    setBusy(`open-${sessionId}`);
    try {
      await api.post(`/sessions/${sessionId}/open`);
      navigate(`/lecturer/sessions/${sessionId}`);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy('');
    }
  };

  const now = Date.now();
  const live = sessions.filter((session) => session.status === 'open');
  const upcoming = sessions
    .filter((session) => session.status === 'scheduled' && new Date(session.start_time).getTime() >= now - 60 * 60 * 1000)
    .sort((a, b) => new Date(a.start_time) - new Date(b.start_time));
  const past = sessions.filter((session) => session.status === 'closed' || session.status === 'cancelled').slice(0, 8);

  const sessionRow = (session, allowOpen) => (
    <div className="list-item" key={session.id}>
      <span className="time-chip mono">{formatTime(session.start_time)}</span>
      <div className="grow">
        <div style={{ fontWeight: 600 }}>
          {session.course_code} <span className="muted small">{session.course_title}</span>
        </div>
        <div className="tiny muted">
          {formatDate(session.date)} · {session.venue} · {session.checked_in_count}/{session.enrolled_count} checked in
        </div>
      </div>
      <div className="row" style={{ gap: 6 }}>
        <StatusPill status={session.status} />
        {session.status === 'open' ? (
          <Link className="btn btn-sm" to={`/lecturer/sessions/${session.id}`}>
            QR
          </Link>
        ) : null}
        {allowOpen && session.status === 'scheduled' ? (
          <button type="button" className="btn btn-sm btn-secondary" onClick={() => openSession(session.id)} disabled={busy === `open-${session.id}`}>
            Start
          </button>
        ) : null}
        {session.status === 'closed' ? (
          <Link className="btn btn-sm btn-secondary" to={`/lecturer/sessions/${session.id}`}>
            View
          </Link>
        ) : null}
      </div>
    </div>
  );

  return (
    <div className="stack" style={{ gap: 16 }}>
      <div className="row-between">
        <div>
          <h1>Sessions</h1>
          <p className="small muted">Start a session to show a rotating check-in code.</p>
        </div>
        <button type="button" className="btn" onClick={startToday}>
          Start session
        </button>
      </div>

      {error ? <Alert tone="error">{error}</Alert> : null}
      {notice ? <Alert tone="ok">{notice}</Alert> : null}

      {showForm && form ? (
        <Card title="New session">
          <div className="stack">
            <div className="grid" style={{ gridTemplateColumns: '1fr' }}>
              <div className="field">
                <label htmlFor="course">Course</label>
                <select
                  id="course"
                  className="select"
                  value={form.course_id}
                  onChange={(event) => {
                    const course = courses.find((item) => item.id === event.target.value);
                    setForm({ ...form, course_id: event.target.value, venue: course?.venue ?? form.venue });
                  }}
                >
                  {courses.length === 0 ? <option value="">No courses yet</option> : null}
                  {courses.map((course) => (
                    <option key={course.id} value={course.id}>
                      {course.code} · {course.title}
                    </option>
                  ))}
                </select>
              </div>

              <div className="grid" style={{ gridTemplateColumns: '1fr 1fr' }}>
                <div className="field">
                  <label htmlFor="start">Starts</label>
                  <input
                    id="start"
                    className="input"
                    type="datetime-local"
                    value={form.start}
                    onChange={(event) => setForm({ ...form, start: event.target.value })}
                  />
                </div>
                <div className="field">
                  <label htmlFor="end">Ends</label>
                  <input
                    id="end"
                    className="input"
                    type="datetime-local"
                    value={form.end}
                    onChange={(event) => setForm({ ...form, end: event.target.value })}
                  />
                </div>
              </div>

              <div className="field">
                <label htmlFor="venue">Venue</label>
                <input
                  id="venue"
                  className="input"
                  value={form.venue}
                  onChange={(event) => setForm({ ...form, venue: event.target.value })}
                  placeholder="Lecture Theatre 2"
                />
              </div>

              <label className="checkbox">
                <input
                  type="checkbox"
                  checked={form.require_geofence}
                  onChange={(event) => setForm({ ...form, require_geofence: event.target.checked })}
                />
                <span>
                  Verify students are in the venue (optional). Distance is calculated on the server; no coordinates are
                  stored.
                </span>
              </label>
            </div>

            <div className="grid" style={{ gridTemplateColumns: '1fr 1fr' }}>
              <button type="button" className="btn" onClick={() => createSession(true)} disabled={Boolean(busy)}>
                {busy === 'open' ? 'Starting…' : 'Start now'}
              </button>
              <button type="button" className="btn btn-secondary" onClick={() => createSession(false)} disabled={Boolean(busy)}>
                {busy === 'schedule' ? 'Scheduling…' : 'Schedule only'}
              </button>
            </div>
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => setShowForm(false)}>
              Cancel
            </button>
          </div>
        </Card>
      ) : null}

      {loading ? (
        <Card title="Your sessions">
          <SkeletonRows rows={4} />
        </Card>
      ) : (
        <>
          {live.length > 0 ? (
            <Card title="Live now">
              <div className="list">{live.map((session) => sessionRow(session, false))}</div>
            </Card>
          ) : null}

          <Card title="Upcoming">
            {upcoming.length === 0 ? (
              <EmptyState icon="📅" title="No upcoming sessions" hint="Start one to show a check-in code in class." />
            ) : (
              <div className="list">{upcoming.map((session) => sessionRow(session, true))}</div>
            )}
          </Card>

          <Card title="Recent">
            {past.length === 0 ? (
              <EmptyState icon="🗂" title="No past sessions yet" />
            ) : (
              <div className="list">{past.map((session) => sessionRow(session, false))}</div>
            )}
          </Card>

          <Card title="Courses" action={<span className="tiny muted">{courses.length}</span>}>
            {courses.length === 0 ? (
              <EmptyState
                icon="📚"
                title="No courses assigned"
                hint="An administrator assigns courses to your account."
              />
            ) : (
              <div className="list">
                {courses.map((course) => (
                  <div className="list-item" key={course.id}>
                    <div className="grow">
                      <div style={{ fontWeight: 600 }}>
                        {course.code} <span className="muted small">{course.title}</span>
                      </div>
                      <div className="tiny muted">
                        {course.department_code} · {course.semester} · {course.enrolled_count} enrolled
                        {course.schedule ? ` · ${course.schedule}` : ''}
                      </div>
                    </div>
                    <Link className="btn btn-sm btn-secondary" to="/lecturer/reports">
                      Reports
                    </Link>
                  </div>
                ))}
              </div>
            )}
          </Card>
        </>
      )}
    </div>
  );
}
