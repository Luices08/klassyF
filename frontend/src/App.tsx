import { Navigate, Route, Routes } from 'react-router-dom';
import { AppShell } from './components/layout/AppShell';
import { ProtectedRoute } from './components/layout/ProtectedRoute';
import { DashboardPage } from './pages/DashboardPage';
import { LoginPage } from './pages/LoginPage';
import { MyAccountPage } from './pages/MyAccountPage';
import { NotFoundPage } from './pages/NotFoundPage';
import { ReportCardPage } from './pages/ReportCardPage';
import { HomePage } from './pages/public/HomePage';
import { AnioLectivoPage } from './pages/AnioLectivoPage';
import { AdmissionRequestsPage } from './pages/admin/AdmissionRequestsPage';
import { EnrollmentDetailPage } from './pages/admin/EnrollmentDetailPage';
import { EnrollmentsPage } from './pages/admin/EnrollmentsPage';
import { EspaciosPage } from './pages/admin/EspaciosPage';
import { GradesPage } from './pages/admin/GradesPage';
import { GroupsPage } from './pages/admin/GroupsPage';
import { InstitutionSetupPage } from './pages/admin/InstitutionSetupPage';
import { SedesPage } from './pages/admin/SedesPage';
import { StudentDetailPage } from './pages/admin/StudentDetailPage';
import { StudentsPage } from './pages/admin/StudentsPage';
import { UsersPage } from './pages/admin/UsersPage';

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<HomePage />} />
      <Route path="/login" element={<LoginPage />} />

      <Route element={<ProtectedRoute />}>
        <Route element={<AppShell />}>
          <Route path="/panel" element={<DashboardPage />} />
          <Route path="/report-card" element={<ReportCardPage />} />
          <Route path="/mi-cuenta" element={<MyAccountPage />} />
          <Route path="/anio-lectivo" element={<AnioLectivoPage />} />

          <Route element={<ProtectedRoute allowedRoles={['ADMIN']} />}>
            <Route path="/admin/setup" element={<InstitutionSetupPage />} />
            <Route path="/admin/sedes" element={<SedesPage />} />
            <Route path="/admin/grades" element={<GradesPage />} />
          </Route>

          <Route element={<ProtectedRoute allowedRoles={['ADMIN', 'COORDINADOR', 'SECRETARIA']} />}>
            <Route path="/admin/users" element={<UsersPage />} />
            <Route path="/admin/enrollments" element={<EnrollmentsPage />} />
            <Route path="/admin/enrollments/:id" element={<EnrollmentDetailPage />} />
            <Route path="/admin/students" element={<StudentsPage />} />
            <Route path="/admin/students/:id" element={<StudentDetailPage />} />
            <Route path="/admin/admisiones" element={<AdmissionRequestsPage />} />
          </Route>

          <Route element={<ProtectedRoute allowedRoles={['ADMIN', 'COORDINADOR']} />}>
            <Route path="/admin/groups" element={<GroupsPage />} />
            <Route path="/admin/espacios" element={<EspaciosPage />} />
          </Route>
        </Route>
      </Route>

      <Route path="/404" element={<NotFoundPage />} />
      <Route path="*" element={<Navigate to="/404" replace />} />
    </Routes>
  );
}
