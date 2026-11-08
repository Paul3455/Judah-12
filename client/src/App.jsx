import { BrowserRouter, Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { AuthProvider, ThemeProvider, useAuth } from './lib/auth.jsx';
import Shell from './components/Shell.jsx';
import { Spinner } from './components/ui.jsx';

import Login from './pages/Login.jsx';
import Register from './pages/Register.jsx';
import Verify from './pages/Verify.jsx';
import Privacy from './pages/Privacy.jsx';
import StudentHome from './pages/StudentHome.jsx';
import CheckIn from './pages/CheckIn.jsx';
import StudentHistory from './pages/StudentHistory.jsx';
import LecturerHome from './pages/LecturerHome.jsx';
import LecturerReports from './pages/LecturerReports.jsx';
import SessionLive from './pages/SessionLive.jsx';
import AdminHome from './pages/AdminHome.jsx';
import AdminUsers from './pages/AdminUsers.jsx';
import AdminAudit from './pages/AdminAudit.jsx';

function LoadingScreen() {
  return (
    <div className="auth-layout">
      <Spinner label="Loading CampusCheck…" />
    </div>
  );
}

function RequireRole({ role, children }) {
  const { user, loading } = useAuth();
  const location = useLocation();

  if (loading) return <LoadingScreen />;
  if (!user) return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  if (role && user.role !== role) return <Navigate to={`/${user.role}`} replace />;
  return children;
}

function HomeRedirect() {
  const { user, loading } = useAuth();
  if (loading) return <LoadingScreen />;
  return <Navigate to={user ? `/${user.role}` : '/login'} replace />;
}

function PublicOnly({ children }) {
  const { user, loading } = useAuth();
  if (loading) return <LoadingScreen />;
  if (user) return <Navigate to={`/${user.role}`} replace />;
  return children;
}

export default function App() {
  return (
    <ThemeProvider>
      <BrowserRouter>
        <AuthProvider>
          <Routes>
          <Route
            path="/login"
            element={
              <PublicOnly>
                <Login />
              </PublicOnly>
            }
          />
          <Route
            path="/register"
            element={
              <PublicOnly>
                <Register />
              </PublicOnly>
            }
          />
          <Route path="/verify" element={<Verify />} />
          <Route path="/privacy" element={<Privacy />} />

          <Route
            element={
              <RequireRole>
                <Shell />
              </RequireRole>
            }
          >
            <Route
              path="/student"
              element={
                <RequireRole role="student">
                  <StudentHome />
                </RequireRole>
              }
            />
            <Route
              path="/student/check-in"
              element={
                <RequireRole role="student">
                  <CheckIn />
                </RequireRole>
              }
            />
            <Route
              path="/student/history"
              element={
                <RequireRole role="student">
                  <StudentHistory />
                </RequireRole>
              }
            />
            <Route
              path="/lecturer"
              element={
                <RequireRole role="lecturer">
                  <LecturerHome />
                </RequireRole>
              }
            />
            <Route
              path="/lecturer/sessions/:sessionId"
              element={
                <RequireRole role="lecturer">
                  <SessionLive />
                </RequireRole>
              }
            />
            <Route
              path="/lecturer/reports"
              element={
                <RequireRole role="lecturer">
                  <LecturerReports />
                </RequireRole>
              }
            />
            <Route
              path="/admin"
              element={
                <RequireRole role="admin">
                  <AdminHome />
                </RequireRole>
              }
            />
            <Route
              path="/admin/users"
              element={
                <RequireRole role="admin">
                  <AdminUsers />
                </RequireRole>
              }
            />
            <Route
              path="/admin/audit"
              element={
                <RequireRole role="admin">
                  <AdminAudit />
                </RequireRole>
              }
            />
          </Route>

            <Route path="/" element={<HomeRedirect />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </AuthProvider>
      </BrowserRouter>
    </ThemeProvider>
  );
}
