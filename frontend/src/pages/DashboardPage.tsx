import { Navigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { NAV_ITEMS, PERFILES_CON_COMISION_POR_DESIGNACION, esVisibleParaRol } from '../components/layout/navigation';
import { useIntegraComision } from '../hooks/useComision';
import { DashboardConvivenciaPage } from './dashboard/DashboardConvivenciaPage';
import { DashboardCoordinacionPage } from './dashboard/DashboardCoordinacionPage';
import { DashboardDirectivoPage } from './dashboard/DashboardDirectivoPage';
import { DashboardOrientacionPage } from './dashboard/DashboardOrientacionPage';
import { DashboardPersonaPage } from './dashboard/DashboardPersonaPage';
import { DashboardSecretariaPage } from './dashboard/DashboardSecretariaPage';

export function DashboardPage() {
  const { user } = useAuth();
  // La misma consulta del menú (comparten caché): los accesos del inicio no ofrecen la comisión a quien no integra ninguna sesión.
  const { data: participacion } = useIntegraComision(Boolean(user && PERFILES_CON_COMISION_POR_DESIGNACION.includes(user.rol)));
  if (!user) return null;
  // El acudiente no tiene panel de accesos: su inicio es el portal.
  if (user.rol === 'ACUDIENTE') return <Navigate to="/portal" replace />;

  const links = NAV_ITEMS.filter((item) => item.to !== '/panel' && !item.soloEncabezado && esVisibleParaRol(item, user.rol, participacion?.integra ?? false));

  // Rectoría, coordinación académica, secretaría, convivencia y orientación tienen su propio panel (M30), con la cuadrícula de accesos plegada al final.
  if (user.rol === 'ADMIN') return <DashboardDirectivoPage links={links} />;
  if (user.rol === 'COORDINADOR') return <DashboardCoordinacionPage links={links} />;
  // Convivencia y orientación ven lo suyo (casos, remisiones, expedientes) y solo en conteos: el detalle está en sus pantallas, con la consulta auditada.
  if (user.rol === 'COORDINADOR_CONVIVENCIA') return <DashboardConvivenciaPage links={links} />;
  if (user.rol === 'ORIENTADOR') return <DashboardOrientacionPage links={links} />;
  // Secretaría ve sus trámites (matrículas, admisiones, documentos, salidas) y solo en conteos.
  if (user.rol === 'SECRETARIA') return <DashboardSecretariaPage links={links} />;

  // Docentes y estudiantes: bienvenida, accesos rápidos, avisos y noticias. La navegación es el menú lateral (en celular, la hamburguesa).
  return <DashboardPersonaPage />;
}
