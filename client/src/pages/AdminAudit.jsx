import { useCallback, useEffect, useState } from 'react';
import { api, toQueryString } from '../lib/api.js';
import { Alert, Card, EmptyState, SkeletonRows } from '../components/ui.jsx';

const ENTITY_TYPES = ['attendance_record', 'session', 'course', 'user', 'app_settings', 'department'];

function summarise(entry) {
  const parts = [];
  if (entry.old_value && Object.keys(entry.old_value).length) {
    parts.push(`was ${JSON.stringify(entry.old_value)}`);
  }
  if (entry.new_value && Object.keys(entry.new_value).length) {
    parts.push(`now ${JSON.stringify(entry.new_value)}`);
  }
  return parts.join(' → ');
}

export default function AdminAudit() {
  const [entries, setEntries] = useState(null);
  const [filters, setFilters] = useState({ entity_type: '', from: '', to: '' });
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setError('');
    try {
      const payload = await api.get(`/admin/audit${toQueryString(filters)}`);
      setEntries(payload.entries);
    } catch (err) {
      setError(err.message);
    }
  }, [filters]);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <div className="stack" style={{ gap: 16 }}>
      <div>
        <h1>Audit trail</h1>
        <p className="small muted">Every attendance change, session action and role change, newest first (max 200).</p>
      </div>

      {error ? <Alert tone="error">{error}</Alert> : null}

      <Card>
        <div className="grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))' }}>
          <div className="field">
            <label htmlFor="entity">Entity</label>
            <select id="entity" className="select" value={filters.entity_type} onChange={(event) => setFilters({ ...filters, entity_type: event.target.value })}>
              <option value="">Everything</option>
              {ENTITY_TYPES.map((type) => (
                <option key={type} value={type}>
                  {type.replace('_', ' ')}
                </option>
              ))}
            </select>
          </div>
          <div className="field">
            <label htmlFor="from">From</label>
            <input id="from" className="input" type="date" value={filters.from} onChange={(event) => setFilters({ ...filters, from: event.target.value })} />
          </div>
          <div className="field">
            <label htmlFor="to">To</label>
            <input id="to" className="input" type="date" value={filters.to} onChange={(event) => setFilters({ ...filters, to: event.target.value })} />
          </div>
        </div>
      </Card>

      {entries === null ? (
        <Card>
          <SkeletonRows rows={8} />
        </Card>
      ) : entries.length === 0 ? (
        <EmptyState icon="🛡" title="Nothing recorded for these filters" hint="Audit entries appear as soon as records change." />
      ) : (
        <Card padded={false}>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>When</th>
                  <th>Who</th>
                  <th>Action</th>
                  <th>Entity</th>
                  <th>Change</th>
                  <th>Reason</th>
                </tr>
              </thead>
              <tbody>
                {entries.map((entry) => (
                  <tr key={entry.id}>
                    <td className="small nowrap">{new Date(entry.created_at).toLocaleString()}</td>
                    <td className="small">{entry.actor_name || 'System'}</td>
                    <td className="small mono">{entry.action}</td>
                    <td className="small">{entry.entity_type}</td>
                    <td className="small" style={{ maxWidth: 320, whiteSpace: 'normal' }}>
                      {summarise(entry) || '—'}
                    </td>
                    <td className="small muted" style={{ maxWidth: 240, whiteSpace: 'normal' }}>
                      {entry.reason || '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </div>
  );
}
