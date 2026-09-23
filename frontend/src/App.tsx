import { Navigate, Route, Routes } from 'react-router-dom';
import { AppShell } from './components/layout/AppShell';
import { ProtectedRoute } from './components/layout/ProtectedRoute';
import { DashboardPage } from './pages/DashboardPage';
import { LoginPage } from './pages/LoginPage';
import { NotFoundPage } from './pages/NotFoundPage';
import { ReportCardPage } from './pages/ReportCardPage';
import { EnrollmentsPage } from './pages/admin/EnrollmentsPage';
import { GroupsPage } from './pages/admin/GroupsPage';
import { InstitutionSetupPage } from './pages/admin/InstitutionSetupPage';
import { SedesPage } from './pages/admin/SedesPage';
import { UsersPage } from './pages/admin/UsersPage';

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />

      <Route element={<ProtectedRoute />}>
        <Route element={<AppShell />}>
          <Route path="/" element={<DashboardPage />} />
          <Route path="/report-card" element={<ReportCardPage />} />

          <Route element={<ProtectedRoute allowedRoles={['SUPERADMIN']} />}>
            <Route path="/admin/setup" element={<InstitutionSetupPage />} />
          </Route>

          <Route element={<ProtectedRoute allowedRoles={['SUPERADMIN', 'ADMIN']} />}>
            <Route path="/admin/sedes" element={<SedesPage />} />
          </Route>

          <Route element={<ProtectedRoute allowedRoles={['SUPERADMIN', 'ADMIN', 'COORDINADOR', 'SECRETARIA']} />}>
            <Route path="/admin/users" element={<UsersPage />} />
            <Route path="/admin/enrollments" element={<EnrollmentsPage />} />
          </Route>

          <Route element={<ProtectedRoute allowedRoles={['SUPERADMIN', 'ADMIN', 'COORDINADOR']} />}>
            <Route path="/admin/groups" element={<GroupsPage />} />
          </Route>
        </Route>
      </Route>

      <Route path="/404" element={<NotFoundPage />} />
      <Route path="*" element={<Navigate to="/404" replace />} />
    </Routes>
  );
}
