import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../lib/api.js';
import { useAuth } from '../lib/auth.jsx';
import { queueLength } from '../lib/offline.js';
import { formatDate, percentTone } from '../lib/format.js';
import { Alert, Card, EmptyState, SkeletonRows, Stat } from '../components/ui.jsx';

export default function StudentHome() {
  const { user } = useAuth();
  const [summary, setSummary] = useState(null);
  const [week, setWeek] = useState(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [queued, setQueued] = useState(queueLength());

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const [summaryPayload, weekPayload] = await Promise.all([api.get('/attendance/me/summary'), api.get('/timetable')]);
      setSummary(summaryPayload);
      setWeek(weekPayload);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
      setQueued(queueLength());
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const warningCourses = (summary?.courses || []).filter((course) => course.below_threshold);
  const todayKey = new Date().toISOString().slice(0, 10);
  const days = (week?.days || []).filter((day) => day.items.length > 0);
  const today = (week?.days || []).find((day) => day.date === todayKey);

  return (
    <div className="stack" style={{ gap: 16 }}>
      <div>
        <h1>Hello, {user?.name?.split(' ')[0] || 'student'}</h1>
        <p className="small muted">
          {formatDate(todayKey)} · {user?.matric_number || ''} {user?.program ? `· ${user.program}` : ''}
        </p>
      </div>

      {error ? <Alert tone="error" action={<button type="button" className="btn btn-secondary btn-sm" onClick={load}>Retry</button>}>{error}</Alert> : null}
      {queued > 0 ? (
        <Alert tone="warn">
          {queued} check-in{queued > 1 ? 's are' : ' is'} waiting on this device and will sync automatically when you are
          back online.
        </Alert>
      ) : null}
      {warningCourses.length > 0 ? (
        <Alert tone="warn">
          <strong>Attendance warning.</strong> You are below {summary?.threshold}% in{' '}
          {warningCourses.map((course) => course.code).join(', ')}. Speak to your lecturer if a record is wrong.
        </Alert>
      ) : null}

      <Link to="/student/check-in" className="card" style={{ textDecoration: 'none', color: 'inherit', display: 'block', borderColor: 'var(--brand)' }}>
        <div className="row-between">
          <div>
            <div style={{ fontWeight: 700, fontSize: 17 }}>Check in to a lecture</div>
            <div className="small muted">Scan the code or type the six digits</div>
          </div>
          <span aria-hidden="true" style={{ fontSize: 26 }}>→</span>
        </div>
      </Link>

      {loading ? (
        <Card title="This week">
          <SkeletonRows rows={3} />
        </Card>
      ) : (
        <>
          <div className="stat-grid">
            <Stat label="Overall" value={summary?.overall_percentage === null ? '—' : `${summary?.overall_percentage}%`} hint="attended / held" />
            <Stat label="Courses" value={summary?.courses?.length ?? 0} />
            <Stat label="Threshold" value={`${summary?.threshold ?? 75}%`} hint="warning level" />
            <Stat
              label="At risk"
              value={warningCourses.length}
              tone={warningCourses.length ? 'danger' : undefined}
              hint={warningCourses.length ? 'below threshold' : 'all clear'}
            />
          </div>

          <Card
            title="This week"
            action={
              week ? (
                <span className="tiny muted">
                  {formatDate(week.week_start)} – {formatDate(new Date(new Date(`${week.week_start}T00:00:00Z`).getTime() + 6 * 86400000).toISOString().slice(0, 10))}
                </span>
              ) : null
            }
          >
            {days.length === 0 ? (
              <EmptyState
                icon="🗓"
                title="No classes this week"
                hint="Your timetable appears here once your courses have a schedule."
              />
            ) : (
              <div className="list">
                {days.map((day) => (
                  <div key={day.date} style={{ paddingBottom: 8 }}>
                    <div className="tiny muted" style={{ fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 6 }}>
                      {day.date === todayKey ? 'Today · ' : ''}
                      {formatDate(day.date)}
                    </div>
                    <div className="list" style={{ paddingLeft: 2 }}>
                      {day.items.map((item, index) => (
                        <div className="list-item" key={`${day.date}-${index}`}>
                          <span className="time-chip mono">{item.start}</span>
                          <div className="grow">
                            <div style={{ fontWeight: 600 }}>
                              {item.course_code} <span className="muted small">{item.course_title}</span>
                            </div>
                            <div className="tiny muted">
                              {item.venue || 'Venue to be confirmed'}
                              {item.kind === 'session' ? ` · session ${item.status}` : ''}
                            </div>
                          </div>
                          {item.kind === 'session' && item.status === 'open' ? (
                            <Link className="btn btn-sm" to="/student/check-in">
                              Check in
                            </Link>
                          ) : null}
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </Card>

          <Card title="My attendance" action={<Link className="small" to="/student/history">History</Link>}>
            {(summary?.courses || []).length === 0 ? (
              <EmptyState
                icon="📚"
                title="No enrolled courses yet"
                hint="Your department office adds you to courses. Check back after registration."
              />
            ) : (
              <div className="stack">
                {summary.courses.map((course) => {
                  const tone = percentTone(course.percentage, summary.threshold);
                  return (
                    <div key={course.course_id} className="stack-sm">
                      <div className="row-between">
                        <div>
                          <div style={{ fontWeight: 600 }}>
                            {course.code} <span className="muted small">{course.title}</span>
                          </div>
                          <div className="tiny muted">
                            Attended {course.attended} of {course.held} held
                            {course.late ? ` · ${course.late} late` : ''}
                            {course.absent ? ` · ${course.absent} absent` : ''}
                          </div>
                        </div>
                        <strong style={{ color: tone === 'danger' ? 'var(--danger)' : tone === 'warn' ? 'var(--warn)' : 'var(--ok)' }}>
                          {course.percentage === null ? '—' : `${course.percentage}%`}
                        </strong>
                      </div>
                      <div className="progress">
                        <span
                          style={{
                            width: `${course.percentage ?? 0}%`,
                            background: tone === 'danger' ? 'var(--danger)' : tone === 'warn' ? 'var(--warn)' : 'var(--ok)',
                          }}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </Card>

          {today && today.items.length > 0 ? (
            <p className="tiny muted center">
              Check-in opens 15 minutes before a lecture starts and closes when your lecturer ends the session.
            </p>
          ) : null}
        </>
      )}
    </div>
  );
}
