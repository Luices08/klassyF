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
import { ActividadesDocentePage } from './pages/ActividadesDocentePage';
import { NotasPlanillaPage } from './pages/NotasPlanillaPage';
import { AsistenciaPage } from './pages/AsistenciaPage';
import { GestionAsistenciaPage } from './pages/GestionAsistenciaPage';
import { MisActividadesPage } from './pages/MisActividadesPage';
import { MisNotasPage } from './pages/MisNotasPage';
import { MiObservadorPage } from './pages/MiObservadorPage';
import { ObservadorPage } from './pages/ObservadorPage';
import { OrientacionPage } from './pages/OrientacionPage';
import { ExpedienteInclusionPage } from './pages/ExpedienteInclusionPage';
import { InclusionPage } from './pages/InclusionPage';
import { MisAjustesPage } from './pages/MisAjustesPage';
import { AcademicCatalogPage } from './pages/admin/AcademicCatalogPage';
import { ActividadesGestionPage } from './pages/admin/ActividadesGestionPage';
import { NotasGestionPage } from './pages/admin/NotasGestionPage';
import { CreadorPlanillasPage } from './pages/admin/CreadorPlanillasPage';
import { AdmissionRequestsPage } from './pages/admin/AdmissionRequestsPage';
import { CasosConvivenciaPage } from './pages/admin/CasosConvivenciaPage';
import { ComitePage } from './pages/admin/ComitePage';
import { CatalogoConvivenciaPage } from './pages/admin/CatalogoConvivenciaPage';
import { SolicitudesCasoPage } from './pages/admin/SolicitudesCasoPage';
import { EnrollmentDetailPage } from './pages/admin/EnrollmentDetailPage';
import { EnrollmentsPage } from './pages/admin/EnrollmentsPage';
import { EspaciosPage } from './pages/admin/EspaciosPage';
import { GradesPage } from './pages/admin/GradesPage';
import { GrupoFichaPage } from './pages/admin/GrupoFichaPage';
import { GroupsPage } from './pages/admin/GroupsPage';
import { HorariosPage } from './pages/admin/HorariosPage';
import { MiHorarioPage } from './pages/MiHorarioPage';
import { InstitutionSetupPage } from './pages/admin/InstitutionSetupPage';
import { SedesPage } from './pages/admin/SedesPage';
import { StudentDetailPage } from './pages/admin/StudentDetailPage';
import { StudentsPage } from './pages/admin/StudentsPage';
import { StudyPlanPage } from './pages/admin/StudyPlanPage';
import { TeacherAssignmentsPage } from './pages/admin/TeacherAssignmentsPage';
import { MyTeacherLoadPage } from './pages/MyTeacherLoadPage';
import { DesarrolloCurricularPage } from './pages/DesarrolloCurricularPage';
import { RevisionCurricularPage } from './pages/admin/RevisionCurricularPage';
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
            <Route path="/admin/creador-planillas" element={<CreadorPlanillasPage />} />
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
            <Route path="/admin/groups/:id" element={<GrupoFichaPage />} />
            <Route path="/admin/espacios" element={<EspaciosPage />} />
            <Route path="/admin/teacher-assignments" element={<TeacherAssignmentsPage />} />
            <Route path="/admin/horarios" element={<HorariosPage />} />
            <Route path="/admin/academic-catalog" element={<AcademicCatalogPage />} />
            <Route path="/admin/study-plan" element={<StudyPlanPage />} />
            <Route path="/admin/revision-curricular" element={<RevisionCurricularPage />} />
            <Route path="/admin/actividades" element={<ActividadesGestionPage />} />
            <Route path="/admin/notas" element={<NotasGestionPage />} />
          </Route>

          <Route element={<ProtectedRoute allowedRoles={['DOCENTE', 'ESTUDIANTE', 'ACUDIENTE']} />}>
            <Route path="/mi-horario" element={<MiHorarioPage />} />
          </Route>

          <Route element={<ProtectedRoute allowedRoles={['DOCENTE']} />}>
            <Route path="/docente/mi-carga" element={<MyTeacherLoadPage />} />
            <Route path="/docente/planeacion-curricular" element={<DesarrolloCurricularPage />} />
            <Route path="/docente/asistencia" element={<AsistenciaPage />} />
            <Route path="/docente/actividades" element={<ActividadesDocentePage />} />
            <Route path="/docente/notas" element={<NotasPlanillaPage />} />
          </Route>

          <Route element={<ProtectedRoute allowedRoles={['ADMIN', 'COORDINADOR', 'SECRETARIA', 'DOCENTE']} />}>
            <Route path="/asistencia/gestion" element={<GestionAsistenciaPage />} />
          </Route>

          {/* Convivencia (M14): SECRETARIA no tiene acceso; el rol abre la puerta y el servidor decide por estudiante. */}
          <Route element={<ProtectedRoute allowedRoles={['ADMIN', 'COORDINADOR', 'COORDINADOR_CONVIVENCIA', 'ORIENTADOR', 'DOCENTE']} />}>
            <Route path="/convivencia/observador" element={<ObservadorPage />} />
          </Route>
          <Route element={<ProtectedRoute allowedRoles={['ADMIN', 'COORDINADOR_CONVIVENCIA']} />}>
            <Route path="/convivencia/catalogo" element={<CatalogoConvivenciaPage />} />
            <Route path="/convivencia/casos" element={<CasosConvivenciaPage />} />
            <Route path="/convivencia/comite" element={<ComitePage />} />
            <Route path="/convivencia/solicitudes" element={<SolicitudesCasoPage />} />
          </Route>
          <Route element={<ProtectedRoute allowedRoles={['ADMIN', 'ORIENTADOR']} />}>
            <Route path="/orientacion/remisiones" element={<OrientacionPage />} />
          </Route>
          {/* Inclusión (M16): el expediente lo abren también los docentes con vínculo (el servidor decide qué ven). */}
          <Route element={<ProtectedRoute allowedRoles={['ADMIN', 'ORIENTADOR', 'COORDINADOR']} />}>
            <Route path="/inclusion" element={<InclusionPage />} />
          </Route>
          <Route element={<ProtectedRoute allowedRoles={['ADMIN', 'ORIENTADOR', 'COORDINADOR', 'DOCENTE']} />}>
            <Route path="/inclusion/expedientes/:id" element={<ExpedienteInclusionPage />} />
          </Route>
          <Route element={<ProtectedRoute allowedRoles={['DOCENTE']} />}>
            <Route path="/docente/ajustes-razonables" element={<MisAjustesPage />} />
          </Route>
          <Route element={<ProtectedRoute allowedRoles={['ESTUDIANTE']} />}>
            <Route path="/mis-actividades" element={<MisActividadesPage />} />
            <Route path="/mis-notas" element={<MisNotasPage />} />
            <Route path="/mi-observador" element={<MiObservadorPage />} />
          </Route>
        </Route>
      </Route>

      <Route path="/404" element={<NotFoundPage />} />
      <Route path="*" element={<Navigate to="/404" replace />} />
    </Routes>
  );
}
