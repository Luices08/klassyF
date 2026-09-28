import { Navigate, Route, Routes } from 'react-router-dom';
import { AppShell } from './components/layout/AppShell';
import { ProtectedRoute } from './components/layout/ProtectedRoute';
import { DashboardPage } from './pages/DashboardPage';
import { LoginPage } from './pages/LoginPage';
import { NotFoundPage } from './pages/NotFoundPage';
import { ReportCardPage } from './pages/ReportCardPage';
import { AcademicCatalogPage } from './pages/admin/AcademicCatalogPage';
import { EnrollmentsPage } from './pages/admin/EnrollmentsPage';
import { GradesPage } from './pages/admin/GradesPage';
import { GroupsPage } from './pages/admin/GroupsPage';
import { InstitutionSetupPage } from './pages/admin/InstitutionSetupPage';
import { SedesPage } from './pages/admin/SedesPage';
import { StudyPlanPage } from './pages/admin/StudyPlanPage';
import { UsersPage } from './pages/admin/UsersPage';

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />

      <Route element={<ProtectedRoute />}>
        <Route element={<AppShell />}>
          <Route path="/" element={<DashboardPage />} />
          <Route path="/report-card" element={<ReportCardPage />} />

          <Route element={<ProtectedRoute allowedRoles={['ADMIN']} />}>
            <Route path="/admin/setup" element={<InstitutionSetupPage />} />
            <Route path="/admin/sedes" element={<SedesPage />} />
            <Route path="/admin/grades" element={<GradesPage />} />
          </Route>

          <Route element={<ProtectedRoute allowedRoles={['ADMIN', 'COORDINADOR', 'SECRETARIA']} />}>
            <Route path="/admin/users" element={<UsersPage />} />
            <Route path="/admin/enrollments" element={<EnrollmentsPage />} />
          </Route>

          <Route element={<ProtectedRoute allowedRoles={['ADMIN', 'COORDINADOR']} />}>
            <Route path="/admin/groups" element={<GroupsPage />} />
          </Route>

          <Route element={<ProtectedRoute allowedRoles={['COORDINADOR']} />}>
            <Route path="/admin/academic-catalog" element={<AcademicCatalogPage />} />
            <Route path="/admin/study-plan" element={<StudyPlanPage />} />
          </Route>
        </Route>
      </Route>

      <Route path="/404" element={<NotFoundPage />} />
      <Route path="*" element={<Navigate to="/404" replace />} />
    </Routes>
  );
}
