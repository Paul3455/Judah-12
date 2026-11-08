import { useCallback, useEffect, useState } from 'react';
import { api } from '../lib/api.js';
import { statusLabel } from '../lib/format.js';
import { Alert, Card, EmptyState, Modal, SkeletonRows } from '../components/ui.jsx';

const emptyCreate = {
  name: '',
  email: '',
  password: '',
  role: 'student',
  department_id: '',
  staff_id: '',
  matric_number: '',
  program: '',
  level: '100',
};

export default function AdminUsers() {
  const [users, setUsers] = useState(null);
  const [departments, setDepartments] = useState([]);
  const [query, setQuery] = useState('');
  const [role, setRole] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [createOpen, setCreateOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setError('');
    try {
      const payload = await api.get(`/admin/users?${new URLSearchParams({ ...(role ? { role } : {}), ...(query ? { q: query } : {}) })}`);
      setUsers(payload.users);
    } catch (err) {
      setError(err.message);
    }
  }, [query, role]);

  useEffect(() => {
    api.get('/admin/departments').then((payload) => setDepartments(payload.departments)).catch(() => {});
  }, []);

  useEffect(() => {
    const timer = setTimeout(load, 220);
    return () => clearTimeout(timer);
  }, [load]);

  return (
    <div className="stack" style={{ gap: 16 }}>
      <div className="row-between">
        <div>
          <h1>People</h1>
          <p className="small muted">Create lecturers and administrators, change roles, suspend access.</p>
        </div>
        <button type="button" className="btn" onClick={() => setCreateOpen(true)}>
          Add person
        </button>
      </div>

      {error ? <Alert tone="error">{error}</Alert> : null}
      {notice ? (
        <Alert tone="ok" action={<button type="button" className="btn btn-ghost btn-sm" onClick={() => setNotice('')}>Dismiss</button>}>
          {notice}
        </Alert>
      ) : null}

      <Card>
        <div className="grid" style={{ gridTemplateColumns: '1fr 180px' }}>
          <div className="field">
            <label htmlFor="search">Search</label>
            <input id="search" className="input" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Name or email" />
          </div>
          <div className="field">
            <label htmlFor="role-filter">Role</label>
            <select id="role-filter" className="select" value={role} onChange={(event) => setRole(event.target.value)}>
              <option value="">All roles</option>
              <option value="student">Students</option>
              <option value="lecturer">Lecturers</option>
              <option value="admin">Administrators</option>
            </select>
          </div>
        </div>
      </Card>

      {users === null ? (
        <Card>
          <SkeletonRows rows={6} />
        </Card>
      ) : users.length === 0 ? (
        <EmptyState icon="👥" title="No people match" hint="Try a different search or role." />
      ) : (
        <Card padded={false}>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Email</th>
                  <th>Role</th>
                  <th>Department</th>
                  <th>Identifier</th>
                  <th>Status</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {users.map((user) => (
                  <tr key={user.id}>
                    <td>{user.name}</td>
                    <td className="small muted">{user.email}</td>
                    <td>
                      <span className={`pill pill-${user.role === 'admin' ? 'excused' : user.role === 'lecturer' ? 'scheduled' : 'closed'}`}>
                        {statusLabel(user.role)}
                      </span>
                    </td>
                    <td className="small">{user.department_name || '—'}</td>
                    <td className="small mono">{user.staff_id || user.matric_number || '—'}</td>
                    <td>
                      <span className={`pill ${user.status === 'active' ? 'pill-present' : user.status === 'suspended' ? 'pill-absent' : 'pill-late'}`}>
                        {statusLabel(user.status)}
                      </span>
                    </td>
                    <td>
                      <button
                        type="button"
                        className="btn btn-sm btn-secondary"
                        onClick={() =>
                          setEditing({
                            ...user,
                            staff_id: user.staff_id || '',
                            matric_number: user.matric_number || '',
                            department_id: user.department_id || '',
                          })
                        }
                      >
                        Edit
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {createOpen ? (
        <CreatePerson
          departments={departments}
          onClose={() => setCreateOpen(false)}
          onCreated={async (message) => {
            setCreateOpen(false);
            setNotice(message);
            await load();
          }}
        />
      ) : null}

      {editing ? (
        <EditPerson
          user={editing}
          departments={departments}
          onClose={() => setEditing(null)}
          busy={busy}
          onSave={async (patch) => {
            setBusy(true);
            setError('');
            try {
              await api.patch(`/admin/users/${editing.id}`, patch);
              setNotice(`${editing.name} updated.`);
              setEditing(null);
              await load();
            } catch (err) {
              setError(err.message);
            } finally {
              setBusy(false);
            }
          }}
        />
      ) : null}
    </div>
  );
}

function CreatePerson({ departments, onClose, onCreated }) {
  const [form, setForm] = useState(emptyCreate);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const update = (key) => (event) => setForm({ ...form, [key]: event.target.value });

  const submit = async (event) => {
    event.preventDefault();
    setBusy(true);
    setError('');
    try {
      await api.post('/admin/users', {
        name: form.name,
        email: form.email,
        password: form.password,
        role: form.role,
        department_id: form.department_id || null,
        staff_id: form.role === 'lecturer' ? form.staff_id : undefined,
        matric_number: form.role === 'student' ? form.matric_number : undefined,
        program: form.role === 'student' ? form.program : undefined,
        level: form.role === 'student' ? Number(form.level) : undefined,
      });
      await onCreated(`${form.name} created. They can sign in immediately with the password you set.`);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      title="Add person"
      onClose={onClose}
      footer={
        <div className="grid" style={{ gridTemplateColumns: '1fr 1fr' }}>
          <button type="button" className="btn btn-secondary" onClick={onClose}>
            Cancel
          </button>
          <button type="submit" form="create-person" className="btn" disabled={busy}>
            {busy ? 'Creating…' : 'Create'}
          </button>
        </div>
      }
    >
      <form id="create-person" className="stack" onSubmit={submit}>
        <div className="field">
          <label htmlFor="c-name">Full name</label>
          <input id="c-name" className="input" required value={form.name} onChange={update('name')} />
        </div>
        <div className="field">
          <label htmlFor="c-email">University email</label>
          <input id="c-email" className="input" type="email" required value={form.email} onChange={update('email')} placeholder="name@campus.edu" />
        </div>
        <div className="field">
          <label htmlFor="c-password">Temporary password</label>
          <input id="c-password" className="input" type="text" required minLength={8} value={form.password} onChange={update('password')} />
          <span className="tiny muted">Share it securely; the person can change it after signing in.</span>
        </div>
        <div className="grid" style={{ gridTemplateColumns: '1fr 1fr' }}>
          <div className="field">
            <label htmlFor="c-role">Role</label>
            <select id="c-role" className="select" value={form.role} onChange={update('role')}>
              <option value="student">Student</option>
              <option value="lecturer">Lecturer</option>
              <option value="admin">Administrator</option>
            </select>
          </div>
          <div className="field">
            <label htmlFor="c-dept">Department</label>
            <select id="c-dept" className="select" value={form.department_id} onChange={update('department_id')}>
              <option value="">None</option>
              {departments.map((department) => (
                <option key={department.id} value={department.id}>
                  {department.code}
                </option>
              ))}
            </select>
          </div>
        </div>

        {form.role === 'lecturer' ? (
          <div className="field">
            <label htmlFor="c-staff">Staff id</label>
            <input id="c-staff" className="input" required value={form.staff_id} onChange={update('staff_id')} placeholder="CSC-1042" />
          </div>
        ) : null}

        {form.role === 'student' ? (
          <div className="stack-sm">
            <div className="field">
              <label htmlFor="c-matric">Matric number</label>
              <input id="c-matric" className="input" required value={form.matric_number} onChange={update('matric_number')} placeholder="CSC/22/1043" />
            </div>
            <div className="grid" style={{ gridTemplateColumns: '1fr 120px' }}>
              <div className="field">
                <label htmlFor="c-program">Programme</label>
                <input id="c-program" className="input" required value={form.program} onChange={update('program')} />
              </div>
              <div className="field">
                <label htmlFor="c-level">Level</label>
                <input id="c-level" className="input" type="number" min={100} max={700} step={100} value={form.level} onChange={update('level')} />
              </div>
            </div>
          </div>
        ) : null}

        {error ? <Alert tone="error">{error}</Alert> : null}
      </form>
    </Modal>
  );
}

function EditPerson({ user, departments, onClose, onSave, busy }) {
  const [form, setForm] = useState({
    name: user.name,
    role: user.role,
    status: user.status,
    department_id: user.department_id || '',
    staff_id: user.staff_id || '',
    matric_number: user.matric_number || '',
  });

  const roleChanged = form.role !== user.role;

  return (
    <Modal
      title={`Edit ${user.name}`}
      onClose={onClose}
      footer={
        <div className="grid" style={{ gridTemplateColumns: '1fr 1fr' }}>
          <button type="button" className="btn btn-secondary" onClick={onClose}>
            Cancel
          </button>
          <button
            type="button"
            className="btn"
            disabled={busy}
            onClick={() =>
              onSave({
                name: form.name,
                role: form.role,
                status: form.status,
                department_id: form.department_id || null,
                staff_id: roleChanged && form.role === 'lecturer' ? form.staff_id : undefined,
                matric_number: roleChanged && form.role === 'student' ? form.matric_number : undefined,
              })
            }
          >
            {busy ? 'Saving…' : 'Save'}
          </button>
        </div>
      }
    >
      <div className="field">
        <label htmlFor="e-name">Full name</label>
        <input id="e-name" className="input" value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} />
      </div>
      <div className="grid" style={{ gridTemplateColumns: '1fr 1fr' }}>
        <div className="field">
          <label htmlFor="e-role">Role</label>
          <select id="e-role" className="select" value={form.role} onChange={(event) => setForm({ ...form, role: event.target.value })}>
            <option value="student">Student</option>
            <option value="lecturer">Lecturer</option>
            <option value="admin">Administrator</option>
          </select>
        </div>
        <div className="field">
          <label htmlFor="e-status">Status</label>
          <select id="e-status" className="select" value={form.status} onChange={(event) => setForm({ ...form, status: event.target.value })}>
            <option value="active">Active</option>
            <option value="suspended">Suspended</option>
          </select>
        </div>
      </div>
      <div className="field">
        <label htmlFor="e-dept">Department</label>
        <select id="e-dept" className="select" value={form.department_id} onChange={(event) => setForm({ ...form, department_id: event.target.value })}>
          <option value="">None</option>
          {departments.map((department) => (
            <option key={department.id} value={department.id}>
              {department.name}
            </option>
          ))}
        </select>
      </div>
      {roleChanged && form.role === 'lecturer' ? (
        <div className="field">
          <label htmlFor="e-staff">Staff id (required for the new role)</label>
          <input id="e-staff" className="input" value={form.staff_id} onChange={(event) => setForm({ ...form, staff_id: event.target.value })} />
        </div>
      ) : null}
      {roleChanged && form.role === 'student' ? (
        <div className="field">
          <label htmlFor="e-matric">Matric number (required for the new role)</label>
          <input id="e-matric" className="input" value={form.matric_number} onChange={(event) => setForm({ ...form, matric_number: event.target.value })} />
        </div>
      ) : null}
      <p className="tiny muted">Suspending an account signs the person out on their next request.</p>
    </Modal>
  );
}
