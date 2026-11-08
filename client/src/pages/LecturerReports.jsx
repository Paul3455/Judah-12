import { useCallback, useEffect, useState } from 'react';
import { api, downloadFile, toQueryString } from '../lib/api.js';
import { todayIsoDate } from '../lib/format.js';
import { Alert, Card, EmptyState, SkeletonRows, Stat } from '../components/ui.jsx';

export default function LecturerReports() {
  const [filters, setFilters] = useState({ from: '', to: '', course_id: '' });
  const [data, setData] = useState(null);
  const [courses, setCourses] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    api
      .get('/courses')
      .then((payload) => setCourses(payload.courses))
      .catch(() => setCourses([]));
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const query = toQueryString({ from: filters.from, to: filters.to, course_id: filters.course_id });
      const payload = await api.get(`/reports/summary${query}`);
      setData(payload);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [filters]);

  useEffect(() => {
    load();
  }, [load]);

  const exportHref = (format) =>
    `/reports/export${toQueryString({ format, from: filters.from, to: filters.to, course_id: filters.course_id })}`;

  const overall = data?.overall;

  return (
    <div className="stack" style={{ gap: 16 }}>
      <div>
        <h1>Reports</h1>
        <p className="small muted">Attendance for your own courses only.</p>
      </div>

      <Card>
        <div className="grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))' }}>
          <div className="field">
            <label htmlFor="from">From</label>
            <input id="from" className="input" type="date" max={todayIsoDate()} value={filters.from} onChange={(event) => setFilters({ ...filters, from: event.target.value })} />
          </div>
          <div className="field">
            <label htmlFor="to">To</label>
            <input id="to" className="input" type="date" max={todayIsoDate()} value={filters.to} onChange={(event) => setFilters({ ...filters, to: event.target.value })} />
          </div>
          <div className="field">
            <label htmlFor="course">Course</label>
            <select id="course" className="select" value={filters.course_id} onChange={(event) => setFilters({ ...filters, course_id: event.target.value })}>
              <option value="">All my courses</option>
              {courses.map((course) => (
                <option key={course.id} value={course.id}>
                  {course.code}
                </option>
              ))}
            </select>
          </div>
        </div>
        <div className="row wrap" style={{ marginTop: 12 }}>
          <button type="button" className="btn btn-secondary btn-sm" onClick={() => downloadFile(exportHref('csv'), `attendance-${todayIsoDate()}.csv`)}>
            Export CSV
          </button>
          <button type="button" className="btn btn-secondary btn-sm" onClick={() => downloadFile(exportHref('xlsx'), `attendance-${todayIsoDate()}.xlsx`)}>
            Export XLSX
          </button>
          {(filters.from || filters.to || filters.course_id) && (
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => setFilters({ from: '', to: '', course_id: '' })}>
              Clear filters
            </button>
          )}
        </div>
      </Card>

      {error ? <Alert tone="error">{error}</Alert> : null}

      {loading || !data ? (
        <Card title="Summary">
          <SkeletonRows rows={4} />
        </Card>
      ) : (
        <>
          <div className="stat-grid">
            <Stat label="Records" value={overall.records} />
            <Stat label="Attendance" value={overall.attendance_rate === null ? '—' : `${overall.attendance_rate}%`} tone="ok" />
            <Stat label="Absent" value={overall.absent} tone="danger" />
            <Stat label="Flagged" value={overall.flagged} tone={overall.flagged ? 'warn' : undefined} />
          </div>

          <Card title="By course">
            {data.by_course.length === 0 ? (
              <EmptyState icon="📊" title="No attendance in this range" hint="Try widening the dates." />
            ) : (
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>Course</th>
                      <th>Sessions</th>
                      <th>Present</th>
                      <th>Late</th>
                      <th>Absent</th>
                      <th>Rate</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.by_course.map((course) => (
                      <tr key={course.id}>
                        <td>
                          <strong>{course.code}</strong> <span className="muted small">{course.title}</span>
                        </td>
                        <td>{course.sessions}</td>
                        <td>{course.present}</td>
                        <td>{course.late}</td>
                        <td>{course.absent}</td>
                        <td>
                          <strong style={{ color: course.attendance_rate < 75 ? 'var(--danger)' : 'var(--ok)' }}>
                            {course.attendance_rate === null ? '—' : `${course.attendance_rate}%`}
                          </strong>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Card>

          <Card title="Most at risk">
            {data.by_student.filter((student) => student.records > 0).length === 0 ? (
              <EmptyState icon="👥" title="No student records in this range" />
            ) : (
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>Student</th>
                      <th>Matric</th>
                      <th>Attended</th>
                      <th>Absent</th>
                      <th>Rate</th>
                    </tr>
                  </thead>
                  <tbody>
                    {[...data.by_student]
                      .filter((student) => student.records > 0)
                      .sort((a, b) => (a.attendance_rate ?? 100) - (b.attendance_rate ?? 100))
                      .slice(0, 10)
                      .map((student) => (
                        <tr key={student.id}>
                          <td>{student.name}</td>
                          <td className="mono tiny">{student.matric_number || '—'}</td>
                          <td>{student.attended}</td>
                          <td>{student.absent}</td>
                          <td>
                            <strong style={{ color: (student.attendance_rate ?? 100) < 75 ? 'var(--danger)' : 'var(--ok)' }}>
                              {student.attendance_rate === null ? '—' : `${student.attendance_rate}%`}
                            </strong>
                          </td>
                        </tr>
                      ))}
                  </tbody>
                </table>
              </div>
            )}
          </Card>
        </>
      )}
    </div>
  );
}
