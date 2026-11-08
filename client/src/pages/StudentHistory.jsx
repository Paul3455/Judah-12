import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../lib/api.js';
import { formatDate, formatTime } from '../lib/format.js';
import { Alert, Card, EmptyState, SkeletonRows, StatusPill } from '../components/ui.jsx';

export default function StudentHistory() {
  const [records, setRecords] = useState(null);
  const [courses, setCourses] = useState([]);
  const [courseId, setCourseId] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    api
      .get('/attendance/me/summary')
      .then((payload) => setCourses(payload.courses))
      .catch(() => setCourses([]));
  }, []);

  useEffect(() => {
    setRecords(null);
    setError('');
    api
      .get(`/attendance/me${courseId ? `?course_id=${courseId}` : ''}`)
      .then((payload) => setRecords(payload.records))
      .catch((err) => setError(err.message));
  }, [courseId]);

  const grouped = useMemo(() => {
    if (!records) return [];
    const byCourse = new Map();
    for (const record of records) {
      const key = record.course_code;
      if (!byCourse.has(key)) byCourse.set(key, []);
      byCourse.get(key).push(record);
    }
    return Array.from(byCourse.entries());
  }, [records]);

  return (
    <div className="stack" style={{ gap: 16 }}>
      <div className="row-between">
        <div>
          <h1>Attendance history</h1>
          <p className="small muted">Newest first. Corrections show the reason your lecturer recorded.</p>
        </div>
        <Link className="btn btn-secondary btn-sm" to="/student">
          Home
        </Link>
      </div>

      <div className="field" style={{ maxWidth: 320 }}>
        <label htmlFor="course-filter">Course</label>
        <select id="course-filter" className="select" value={courseId} onChange={(event) => setCourseId(event.target.value)}>
          <option value="">All courses</option>
          {courses.map((course) => (
            <option key={course.course_id} value={course.course_id}>
              {course.code} · {course.title}
            </option>
          ))}
        </select>
      </div>

      {error ? <Alert tone="error">{error}</Alert> : null}

      {records === null ? (
        <Card>
          <SkeletonRows rows={5} />
        </Card>
      ) : records.length === 0 ? (
        <EmptyState
          icon="🗂"
          title="No attendance records yet"
          hint="Records appear here after you check in to a session."
          action={<Link className="btn" to="/student/check-in">Check in now</Link>}
        />
      ) : (
        <div className="stack">
          {grouped.map(([courseCode, items]) => (
            <Card key={courseCode} title={courseCode}>
              <div className="list">
                {items.map((record) => (
                  <div className="list-item" key={record.id} style={{ alignItems: 'flex-start' }}>
                    <div className="grow">
                      <div style={{ fontWeight: 600 }}>
                        {formatDate(record.date)} · {formatTime(record.start_time)}
                      </div>
                      <div className="tiny muted">
                        {record.venue}
                        {record.check_in_method ? ` · via ${record.check_in_method}` : ''}
                        {record.flagged ? ' · flagged for review' : ''}
                      </div>
                      {record.override_reason ? (
                        <div className="tiny" style={{ color: 'var(--info)', marginTop: 4 }}>
                          Corrected: {record.override_reason}
                        </div>
                      ) : null}
                    </div>
                    <StatusPill status={record.status} />
                  </div>
                ))}
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
