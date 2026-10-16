import { Navigate, Route, Routes } from 'react-router-dom';
import { AppShell } from './components/layout/AppShell';
import { ProtectedRoute } from './components/layout/ProtectedRoute';
import { DashboardPage } from './pages/DashboardPage';
import { LoginPage } from './pages/LoginPage';
import { MyAccountPage } from './pages/MyAccountPage';
import { NotFoundPage } from './pages/NotFoundPage';
import { ReportCardPage } from './pages/ReportCardPage';
import { HomePage } from './pages/public/HomePage';
import { VerificarCertificadoPage } from './pages/public/VerificarCertificadoPage';
import { CertificadosPage } from './pages/admin/CertificadosPage';
import { AnioLectivoPage } from './pages/AnioLectivoPage';
import { ActividadesDocentePage } from './pages/ActividadesDocentePage';
import { NotasPlanillaPage } from './pages/NotasPlanillaPage';
import { RecuperacionesPage } from './pages/RecuperacionesPage';
import { ObservacionesBoletinPage } from './pages/ObservacionesBoletinPage';
import { AsistenciaPage } from './pages/AsistenciaPage';
import { GestionAsistenciaPage } from './pages/GestionAsistenciaPage';
import { MisActividadesPage } from './pages/MisActividadesPage';
import { MisNotasPage } from './pages/MisNotasPage';
import { AnunciosPage } from './pages/AnunciosPage';
import { MiObservadorPage } from './pages/MiObservadorPage';
import { ObservadorPage } from './pages/ObservadorPage';
import { OrientacionPage } from './pages/OrientacionPage';
import { ExpedienteInclusionPage } from './pages/ExpedienteInclusionPage';
import { InclusionPage } from './pages/InclusionPage';
import { MisAjustesPage } from './pages/MisAjustesPage';
import { AcademicCatalogPage } from './pages/admin/AcademicCatalogPage';
import { ActividadEstudiantePage } from './pages/ActividadEstudiantePage';
import { ActividadRevisionPage } from './pages/ActividadRevisionPage';
import { ActividadesGestionPage } from './pages/admin/ActividadesGestionPage';
import { NotasGestionPage } from './pages/admin/NotasGestionPage';
import { CreadorPlanillasPage } from './pages/admin/CreadorPlanillasPage';
import { ConfiguracionBoletinPage } from './pages/admin/ConfiguracionBoletinPage';
import { AdmissionRequestsPage } from './pages/admin/AdmissionRequestsPage';
import { CasosConvivenciaPage } from './pages/admin/CasosConvivenciaPage';
import { ComitePage } from './pages/admin/ComitePage';
import { CatalogoConvivenciaPage } from './pages/admin/CatalogoConvivenciaPage';
import { SolicitudesCasoPage } from './pages/admin/SolicitudesCasoPage';
import { EnrollmentDetailPage } from './pages/admin/EnrollmentDetailPage';
import { DocumentosPorRevisarPage } from './pages/admin/DocumentosPorRevisarPage';
import { EnrollmentsPage } from './pages/admin/EnrollmentsPage';
import { PazYSalvoPage } from './pages/admin/PazYSalvoPage';
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
import { UsersPage } from './pages/admin/UsersPage';
import { DocumentosReferenciaPage } from './pages/admin/DocumentosReferenciaPage';
import { RevisionPlaneacionPage } from './pages/admin/RevisionPlaneacionPage';
import { PlaneacionDocentePage } from './pages/PlaneacionDocentePage';
import { PortalAcudientePage } from './pages/PortalAcudientePage';

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<HomePage />} />
      <Route path="/login" element={<LoginPage />} />
      <Route path="/verificar" element={<VerificarCertificadoPage />} />
      <Route path="/verificar/:token" element={<VerificarCertificadoPage />} />

      <Route element={<ProtectedRoute />}>
        <Route element={<AppShell />}>
          <Route path="/panel" element={<DashboardPage />} />
          <Route path="/report-card" element={<ReportCardPage />} />
          <Route path="/mi-cuenta" element={<MyAccountPage />} />
          <Route path="/anuncios" element={<AnunciosPage />} />
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
            <Route path="/admin/documentos-por-revisar" element={<DocumentosPorRevisarPage />} />
            <Route path="/admin/students" element={<StudentsPage />} />
            <Route path="/admin/students/:id" element={<StudentDetailPage />} />
            <Route path="/admin/admisiones" element={<AdmissionRequestsPage />} />
          </Route>

          {/* El docente entra a la ruta: el servidor dice si la institución lo habilitó (Configuración institucional). */}
          <Route element={<ProtectedRoute allowedRoles={['ADMIN', 'COORDINADOR', 'SECRETARIA', 'DOCENTE']} />}>
            <Route path="/paz-y-salvo" element={<PazYSalvoPage />} />
          </Route>

          <Route element={<ProtectedRoute allowedRoles={['ADMIN', 'SECRETARIA']} />}>
            <Route path="/secretaria/certificados" element={<CertificadosPage />} />
          </Route>

          <Route element={<ProtectedRoute allowedRoles={['ADMIN', 'COORDINADOR']} />}>
            <Route path="/admin/groups" element={<GroupsPage />} />
            <Route path="/admin/groups/:id" element={<GrupoFichaPage />} />
            <Route path="/admin/espacios" element={<EspaciosPage />} />
            <Route path="/admin/teacher-assignments" element={<TeacherAssignmentsPage />} />
            <Route path="/admin/horarios" element={<HorariosPage />} />
            <Route path="/admin/academic-catalog" element={<AcademicCatalogPage />} />
            <Route path="/admin/study-plan" element={<StudyPlanPage />} />
            <Route path="/admin/documentos-referencia" element={<DocumentosReferenciaPage />} />
            <Route path="/admin/revision-planeacion" element={<RevisionPlaneacionPage />} />
            <Route path="/admin/actividades" element={<ActividadesGestionPage />} />
            <Route path="/admin/actividades/:id" element={<ActividadRevisionPage />} />
            <Route path="/admin/notas" element={<NotasGestionPage />} />
            <Route path="/admin/boletin" element={<ConfiguracionBoletinPage />} />
          </Route>

          <Route element={<ProtectedRoute allowedRoles={['DOCENTE', 'ESTUDIANTE', 'ACUDIENTE']} />}>
            <Route path="/mi-horario" element={<MiHorarioPage />} />
          </Route>

          <Route element={<ProtectedRoute allowedRoles={['ADMIN', 'COORDINADOR', 'DOCENTE']} />}>
            <Route path="/recuperaciones" element={<RecuperacionesPage />} />
          </Route>

          <Route element={<ProtectedRoute allowedRoles={['DOCENTE']} />}>
            <Route path="/docente/mi-carga" element={<MyTeacherLoadPage />} />
            <Route path="/docente/planeacion" element={<PlaneacionDocentePage />} />
            <Route path="/docente/asistencia" element={<AsistenciaPage />} />
            <Route path="/docente/actividades" element={<ActividadesDocentePage />} />
            <Route path="/docente/actividades/:id" element={<ActividadRevisionPage />} />
            <Route path="/docente/notas" element={<NotasPlanillaPage />} />
            <Route path="/docente/boletin-observaciones" element={<ObservacionesBoletinPage />} />
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
          <Route element={<ProtectedRoute allowedRoles={['ACUDIENTE']} />}>
            <Route path="/portal" element={<PortalAcudientePage />} />
          </Route>
          <Route element={<ProtectedRoute allowedRoles={['ESTUDIANTE']} />}>
            <Route path="/mis-actividades" element={<MisActividadesPage />} />
            <Route path="/mis-actividades/:id" element={<ActividadEstudiantePage />} />
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
