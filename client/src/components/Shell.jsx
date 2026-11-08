import { useEffect, useState } from 'react';
import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { api } from '../lib/api.js';
import { useAuth, useTheme } from '../lib/auth.jsx';
import { Modal } from './ui.jsx';

const ICONS = {
  home: 'M3 11.5 12 4l9 7.5V20a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z',
  check: 'M20 6 9 17l-5-5',
  list: 'M4 6h16M4 12h16M4 18h10',
  calendar: 'M7 3v3m10-3v3M4 8h16M5 21h14a1 1 0 0 0 1-1V6a1 1 0 0 0-1-1H5a1 1 0 0 0-1 1v14a1 1 0 0 0 1 1Z',
  chart: 'M4 20V10m5 10V4m5 16v-7m5 7V8',
  users: 'M16 19v-1a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v1M9 10a4 4 0 1 0 0-8 4 4 0 0 0 0 8Zm13 9v-1a4 4 0 0 0-3-3.87M16 3.13A4 4 0 0 1 16 11',
  bell: 'M18 8a6 6 0 1 0-12 0c0 7-3 9-3 9h18s-3-2-3-9M13.7 21a2 2 0 0 1-3.4 0',
  shield: 'M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10Z',
};

function Icon({ name }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d={ICONS[name]} />
    </svg>
  );
}

const NAV = {
  student: [
    { to: '/student', label: 'Home', icon: 'home', end: true },
    { to: '/student/check-in', label: 'Check in', icon: 'check' },
    { to: '/student/history', label: 'History', icon: 'list' },
  ],
  lecturer: [
    { to: '/lecturer', label: 'Sessions', icon: 'calendar', end: true },
    { to: '/lecturer/reports', label: 'Reports', icon: 'chart' },
  ],
  admin: [
    { to: '/admin', label: 'Overview', icon: 'chart', end: true },
    { to: '/admin/users', label: 'People', icon: 'users' },
    { to: '/admin/audit', label: 'Audit', icon: 'shield' },
  ],
};

export default function Shell() {
  const { user, logout } = useAuth();
  const { theme, toggle } = useTheme();
  const navigate = useNavigate();
  const [notifications, setNotifications] = useState({ items: [], unread: 0 });
  const [panelOpen, setPanelOpen] = useState(false);

  useEffect(() => {
    let cancelled = false;
    api
      .get('/notifications')
      .then((payload) => {
        if (!cancelled) setNotifications({ items: payload.notifications, unread: payload.unread });
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  const openPanel = async () => {
    setPanelOpen(true);
    try {
      const payload = await api.get('/notifications');
      setNotifications({ items: payload.notifications, unread: payload.unread });
    } catch {
      /* keep whatever we had */
    }
  };

  const markAllRead = async () => {
    await api.post('/notifications/read-all').catch(() => {});
    setNotifications((current) => ({
      unread: 0,
      items: current.items.map((item) => ({ ...item, read_at: item.read_at || new Date().toISOString() })),
    }));
  };

  const signOut = async () => {
    await logout();
    navigate('/login', { replace: true });
  };

  const items = NAV[user?.role] || [];

  return (
    <div className="shell">
      <header className="shell-header">
        <NavLink to={`/${user?.role ?? ''}`} className="brand">
          <span className="brand-mark" aria-hidden="true">
            ✓
          </span>
          CampusCheck
        </NavLink>

        <nav className="nav-desktop" aria-label="Main">
          {items.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}
            >
              {item.label}
            </NavLink>
          ))}
        </nav>

        <div className="row" style={{ gap: 6 }}>
          <button type="button" className="btn btn-icon" onClick={openPanel} aria-label="Notifications">
            <span style={{ position: 'relative', display: 'inline-flex' }}>
              <Icon name="bell" />
              {notifications.unread > 0 ? (
                <span
                  style={{
                    position: 'absolute',
                    top: -4,
                    right: -4,
                    width: 8,
                    height: 8,
                    borderRadius: 999,
                    background: 'var(--danger)',
                  }}
                />
              ) : null}
            </span>
          </button>
          <button
            type="button"
            className="btn btn-icon"
            onClick={toggle}
            aria-label={`Switch to ${theme === 'dark' ? 'light' : 'dark'} mode`}
          >
            {theme === 'dark' ? '☀' : '☾'}
          </button>
          <button type="button" className="btn btn-secondary btn-sm" onClick={signOut}>
            Sign out
          </button>
        </div>
      </header>

      <main className="shell-main">
        <Outlet />
      </main>

      {items.length > 0 ? (
        <nav className="nav-bottom" aria-label="Main">
          {items.map((item) => (
            <NavLink key={item.to} to={item.to} end={item.end} className={({ isActive }) => (isActive ? 'active' : '')}>
              <Icon name={item.icon} />
              {item.label}
            </NavLink>
          ))}
        </nav>
      ) : null}

      {panelOpen ? (
        <Modal
          title="Notifications"
          onClose={() => setPanelOpen(false)}
          footer={
            <div className="row-between">
              <span className="small muted">{user?.email}</span>
              <button type="button" className="btn btn-secondary btn-sm" onClick={markAllRead}>
                Mark all read
              </button>
            </div>
          }
        >
          {notifications.items.length === 0 ? (
            <p className="muted small">You have no notifications yet.</p>
          ) : (
            <div className="list">
              {notifications.items.map((item) => (
                <div key={item.id} className="list-item" style={{ alignItems: 'flex-start' }}>
                  <div className="grow">
                    <div style={{ fontWeight: 600 }}>{item.title}</div>
                    <div className="small muted">{item.body}</div>
                    <div className="tiny muted" style={{ marginTop: 4 }}>
                      {new Date(item.created_at).toLocaleString()}
                    </div>
                  </div>
                  {!item.read_at ? <span className="pill pill-late">New</span> : null}
                </div>
              ))}
            </div>
          )}
        </Modal>
      ) : null}
    </div>
  );
}
