import { useCallback, useEffect, useState } from 'react';
import { api, downloadFile, toQueryString } from '../lib/api.js';
import { todayIsoDate } from '../lib/format.js';
import { Alert, Card, EmptyState, Modal, SkeletonRows, Stat } from '../components/ui.jsx';

const TABS = [
  { id: 'overview', label: 'Overview' },
  { id: 'departments', label: 'Departments' },
  { id: 'settings', label: 'Retention & settings' },
];

export default function AdminHome() {
  const [tab, setTab] = useState('overview');
  const [departments, setDepartments] = useState([]);
  const [courses, setCourses] = useState([]);
  const [filters, setFilters] = useState({ from: '', to: '', department_id: '', course_id: '' });
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const loadAnalytics = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const query = toQueryString({
        from: filters.from,
        to: filters.to,
        department_id: filters.department_id,
        course_id: filters.course_id,
      });
      setData(await api.get(`/reports/summary${query}`));
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [filters]);

  useEffect(() => {
    api.get('/admin/departments').then((payload) => setDepartments(payload.departments)).catch(() => {});
    api.get('/courses').then((payload) => setCourses(payload.courses)).catch(() => {});
  }, []);

  useEffect(() => {
    if (tab === 'overview') loadAnalytics();
  }, [tab, loadAnalytics]);

  const exportHref = (format) =>
    `/reports/export${toQueryString({
      format,
      from: filters.from,
      to: filters.to,
      department_id: filters.department_id,
      course_id: filters.course_id,
    })}`;

  return (
    <div className="stack" style={{ gap: 16 }}>
      <div>
        <h1>Administration</h1>
        <p className="small muted">Institution-wide attendance, people and policy.</p>
      </div>

      {error ? <Alert tone="error">{error}</Alert> : null}
      {notice ? (
        <Alert tone="ok" action={<button type="button" className="btn btn-ghost btn-sm" onClick={() => setNotice('')}>Dismiss</button>}>
          {notice}
        </Alert>
      ) : null}

      <div className="tabs" role="tablist">
        {TABS.map((item) => (
          <button key={item.id} type="button" role="tab" aria-selected={tab === item.id} onClick={() => setTab(item.id)}>
            {item.label}
          </button>
        ))}
      </div>

      {tab === 'overview' ? (
        <>
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
                <label htmlFor="dept">Department</label>
                <select id="dept" className="select" value={filters.department_id} onChange={(event) => setFilters({ ...filters, department_id: event.target.value })}>
                  <option value="">All departments</option>
                  {departments.map((department) => (
                    <option key={department.id} value={department.id}>
                      {department.name}
                    </option>
                  ))}
                </select>
              </div>
              <div className="field">
                <label htmlFor="course">Course</label>
                <select id="course" className="select" value={filters.course_id} onChange={(event) => setFilters({ ...filters, course_id: event.target.value })}>
                  <option value="">All courses</option>
                  {courses.map((course) => (
                    <option key={course.id} value={course.id}>
                      {course.code}
                    </option>
                  ))}
                </select>
              </div>
            </div>
            <div className="row wrap" style={{ marginTop: 12 }}>
              <button type="button" className="btn btn-secondary btn-sm" onClick={() => downloadFile(exportHref('csv'), `campuscheck-${todayIsoDate()}.csv`)}>
                Export CSV
              </button>
              <button type="button" className="btn btn-secondary btn-sm" onClick={() => downloadFile(exportHref('xlsx'), `campuscheck-${todayIsoDate()}.xlsx`)}>
                Export XLSX
              </button>
              {(filters.from || filters.to || filters.department_id || filters.course_id) && (
                <button type="button" className="btn btn-ghost btn-sm" onClick={() => setFilters({ from: '', to: '', department_id: '', course_id: '' })}>
                  Clear filters
                </button>
              )}
            </div>
          </Card>

          {loading || !data ? (
            <Card title="Summary">
              <SkeletonRows rows={4} />
            </Card>
          ) : (
            <>
              <div className="stat-grid">
                <Stat label="Records" value={data.overall.records} />
                <Stat label="Attendance" value={data.overall.attendance_rate === null ? '—' : `${data.overall.attendance_rate}%`} tone="ok" />
                <Stat label="Sessions" value={data.overall.sessions} hint={`${data.overall.courses} courses`} />
                <Stat label="Flagged" value={data.overall.flagged} tone={data.overall.flagged ? 'warn' : undefined} hint="suspicious check-ins" />
              </div>

              <Card title="By course">
                {data.by_course.length === 0 ? (
                  <EmptyState icon="📊" title="No attendance in this range" hint="Widen the dates or clear the filters." />
                ) : (
                  <div className="table-wrap">
                    <table>
                      <thead>
                        <tr>
                          <th>Course</th>
                          <th>Department</th>
                          <th>Lecturer</th>
                          <th>Present</th>
                          <th>Late</th>
                          <th>Absent</th>
                          <th>Flagged</th>
                          <th>Rate</th>
                        </tr>
                      </thead>
                      <tbody>
                        {data.by_course.map((course) => (
                          <tr key={course.id}>
                            <td>
                              <strong>{course.code}</strong> <span className="muted small">{course.title}</span>
                            </td>
                            <td>{course.department}</td>
                            <td>{course.lecturer || '—'}</td>
                            <td>{course.present}</td>
                            <td>{course.late}</td>
                            <td>{course.absent}</td>
                            <td>{course.flagged || '—'}</td>
                            <td>
                              <strong style={{ color: (course.attendance_rate ?? 100) < 75 ? 'var(--danger)' : 'var(--ok)' }}>
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

              <div className="grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))' }}>
                <Card title="By department">
                  {data.by_department.length === 0 ? (
                    <p className="small muted">No data.</p>
                  ) : (
                    <div className="list">
                      {data.by_department.map((department) => (
                        <div className="list-item" key={department.id}>
                          <div className="grow small">{department.name}</div>
                          <span className="small mono">{department.attended}/{department.records}</span>
                          <strong className="small">{department.attendance_rate === null ? '—' : `${department.attendance_rate}%`}</strong>
                        </div>
                      ))}
                    </div>
                  )}
                </Card>

                <Card title="By lecturer">
                  {data.by_lecturer.length === 0 ? (
                    <p className="small muted">No data.</p>
                  ) : (
                    <div className="list">
                      {data.by_lecturer.map((lecturer) => (
                        <div className="list-item" key={lecturer.id}>
                          <div className="grow small">{lecturer.name}</div>
                          <span className="small mono">{lecturer.attended}/{lecturer.records}</span>
                          <strong className="small">{lecturer.attendance_rate === null ? '—' : `${lecturer.attendance_rate}%`}</strong>
                        </div>
                      ))}
                    </div>
                  )}
                </Card>
              </div>

              <Card title="By day">
                {data.by_date.length === 0 ? (
                  <p className="small muted">No data.</p>
                ) : (
                  <div className="table-wrap">
                    <table>
                      <thead>
                        <tr>
                          <th>Date</th>
                          <th>Records</th>
                          <th>Attended</th>
                          <th>Rate</th>
                        </tr>
                      </thead>
                      <tbody>
                        {data.by_date.slice(-14).map((day) => (
                          <tr key={String(day.date)}>
                            <td>{String(day.date).slice(0, 10)}</td>
                            <td>{day.records}</td>
                            <td>{day.attended}</td>
                            <td>{day.attendance_rate === null ? '—' : `${day.attendance_rate}%`}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </Card>
            </>
          )}
        </>
      ) : null}

      {tab === 'departments' ? (
        <DepartmentsPanel departments={departments} onChanged={(payload, message) => {
          setDepartments(payload);
          setNotice(message);
        }} />
      ) : null}

      {tab === 'settings' ? <SettingsPanel onSaved={(message) => setNotice(message)} /> : null}
    </div>
  );
}

function DepartmentsPanel({ departments, onChanged }) {
  const [form, setForm] = useState({ name: '', code: '' });
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const create = async (event) => {
    event.preventDefault();
    setBusy(true);
    setError('');
    try {
      await api.post('/admin/departments', form);
      const payload = await api.get('/admin/departments');
      onChanged(payload.departments, `${form.code.toUpperCase()} department created.`);
      setForm({ name: '', code: '' });
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="stack">
      <Card title="Add department">
        <form className="stack" onSubmit={create}>
          <div className="grid" style={{ gridTemplateColumns: '1fr 140px' }}>
            <div className="field">
              <label htmlFor="dept-name">Name</label>
              <input id="dept-name" className="input" required value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} placeholder="Computer Science" />
            </div>
            <div className="field">
              <label htmlFor="dept-code">Code</label>
              <input id="dept-code" className="input" required value={form.code} onChange={(event) => setForm({ ...form, code: event.target.value })} placeholder="CSC" />
            </div>
          </div>
          {error ? <Alert tone="error">{error}</Alert> : null}
          <button type="submit" className="btn" disabled={busy}>
            {busy ? 'Creating…' : 'Create department'}
          </button>
        </form>
      </Card>

      <Card title="Departments">
        {departments.length === 0 ? (
          <EmptyState icon="🏛" title="No departments yet" />
        ) : (
          <div className="list">
            {departments.map((department) => (
              <div className="list-item" key={department.id}>
                <div className="grow">
                  <div style={{ fontWeight: 600 }}>{department.name}</div>
                  <div className="tiny muted">
                    {department.code} · {department.course_count} courses · {department.lecturer_count} lecturers
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}

function SettingsPanel({ onSaved }) {
  const [settings, setSettings] = useState(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState('');
  const [confirmPurge, setConfirmPurge] = useState(false);

  const load = useCallback(async () => {
    try {
      const payload = await api.get('/admin/settings');
      setSettings(payload.settings);
    } catch (err) {
      setError(err.message);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const save = async () => {
    setBusy('save');
    setError('');
    try {
      const payload = await api.put('/admin/settings', settings);
      setSettings(payload.settings);
      onSaved('Settings saved.');
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy('');
    }
  };

  const purge = async () => {
    setBusy('purge');
    setError('');
    try {
      const result = await api.post('/admin/retention/purge');
      setConfirmPurge(false);
      onSaved(`Retention applied: ${result.deleted} records deleted, ${result.location_fields_scrubbed} location fields scrubbed.`);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy('');
    }
  };

  if (!settings) {
    return (
      <Card title="Settings">
        <SkeletonRows rows={4} />
      </Card>
    );
  }

  const update = (key) => (event) => setSettings({ ...settings, [key]: Number(event.target.value) });

  return (
    <div className="stack">
      <Card title="Policy">
        <div className="stack">
          {error ? <Alert tone="error">{error}</Alert> : null}
          <div className="grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))' }}>
            <div className="field">
              <label htmlFor="threshold">Warning threshold (%)</label>
              <input id="threshold" className="input" type="number" min={0} max={100} value={settings.warningThreshold} onChange={update('warningThreshold')} />
              <span className="tiny muted">Students below this are warned on their dashboard.</span>
            </div>
            <div className="field">
              <label htmlFor="retention">Attendance retention (days)</label>
              <input id="retention" className="input" type="number" min={1} max={3650} value={settings.retentionDays} onChange={update('retentionDays')} />
              <span className="tiny muted">Older records are deleted when you purge.</span>
            </div>
            <div className="field">
              <label htmlFor="grace">Late grace (minutes)</label>
              <input id="grace" className="input" type="number" min={0} max={120} value={settings.lateGraceMinutes} onChange={update('lateGraceMinutes')} />
              <span className="tiny muted">Checked in after this are marked late.</span>
            </div>
            <div className="field">
              <label htmlFor="step">Code rotation (seconds)</label>
              <input id="step" className="input" type="number" min={30} max={60} value={settings.qrStepSeconds} onChange={update('qrStepSeconds')} />
              <span className="tiny muted">Allowed range 30–60 seconds.</span>
            </div>
          </div>
          <div className="row wrap">
            <button type="button" className="btn" onClick={save} disabled={busy === 'save'}>
              {busy === 'save' ? 'Saving…' : 'Save settings'}
            </button>
            <button type="button" className="btn btn-secondary" onClick={() => setConfirmPurge(true)}>
              Apply retention now
            </button>
          </div>
        </div>
      </Card>

      <Card title="Privacy">
        <p className="small muted">
          Attendance records older than the retention period are deleted permanently. Location verification fields on
          surviving records are scrubbed on the same schedule. The audit trail is retained for 24 months so that every
          deletion and correction stays provable. Raw GPS coordinates are never stored.
        </p>
      </Card>

      {confirmPurge ? (
        <Modal
          title="Apply retention policy?"
          onClose={() => setConfirmPurge(false)}
          footer={
            <div className="grid" style={{ gridTemplateColumns: '1fr 1fr' }}>
              <button type="button" className="btn btn-secondary" onClick={() => setConfirmPurge(false)}>
                Cancel
              </button>
              <button type="button" className="btn btn-danger" onClick={purge} disabled={busy === 'purge'}>
                {busy === 'purge' ? 'Purging…' : 'Delete old records'}
              </button>
            </div>
          }
        >
          <p className="small">
            Every attendance record for sessions older than <strong>{settings.retentionDays} days</strong> will be
            deleted. This cannot be undone.
          </p>
        </Modal>
      ) : null}
    </div>
  );
}
