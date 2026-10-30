import { Link, Navigate } from 'react-router-dom';
import { MosaicoNoticiasInicio } from '../components/noticias/MosaicoNoticiasInicio';
import { Card } from '../components/ui/Card';
import { Chip } from '../components/ui/Badge';
import { useAnuncios } from '../hooks/useNotificaciones';
import { PageHeader } from '../components/ui/PageHeader';
import { useAuth } from '../context/AuthContext';
import { NAV_ITEMS } from '../components/layout/navigation';
import { DashboardConvivenciaPage } from './dashboard/DashboardConvivenciaPage';
import { DashboardCoordinacionPage } from './dashboard/DashboardCoordinacionPage';
import { DashboardDirectivoPage } from './dashboard/DashboardDirectivoPage';
import { DashboardOrientacionPage } from './dashboard/DashboardOrientacionPage';
import { DashboardSecretariaPage } from './dashboard/DashboardSecretariaPage';

const ROLE_LABELS: Record<string, string> = {
  ADMIN: 'Administrador',
  COORDINADOR: 'Coordinador',
  COORDINADOR_CONVIVENCIA: 'Coordinador de convivencia',
  ORIENTADOR: 'Orientación / Psicología',
  DOCENTE: 'Docente',
  SECRETARIA: 'Secretaría académica',
  ESTUDIANTE: 'Estudiante',
  ACUDIENTE: 'Acudiente',
};

export function DashboardPage() {
  const { user } = useAuth();
  const { data: anuncios = [] } = useAnuncios();
  if (!user) return null;
  // El acudiente no tiene panel de accesos: su inicio es el portal.
  if (user.rol === 'ACUDIENTE') return <Navigate to="/portal" replace />;

  const links = NAV_ITEMS.filter((item) => item.to !== '/panel' && !item.soloEncabezado && (!item.roles || item.roles.includes(user.rol)));

  // Rectoría, coordinación académica, secretaría, convivencia y orientación tienen su propio panel (M30), con la cuadrícula de accesos plegada al final.
  if (user.rol === 'ADMIN') return <DashboardDirectivoPage links={links} />;
  if (user.rol === 'COORDINADOR') return <DashboardCoordinacionPage links={links} />;
  // Convivencia y orientación ven lo suyo (casos, remisiones, expedientes) y solo en conteos: el detalle está en sus pantallas, con la consulta auditada.
  if (user.rol === 'COORDINADOR_CONVIVENCIA') return <DashboardConvivenciaPage links={links} />;
  if (user.rol === 'ORIENTADOR') return <DashboardOrientacionPage links={links} />;
  // Secretaría ve sus trámites (matrículas, admisiones, documentos, salidas) y solo en conteos.
  if (user.rol === 'SECRETARIA') return <DashboardSecretariaPage links={links} />;

  return (
    <div className="space-y-4">
      <PageHeader title={`Hola, ${user.nombre} ${user.apellido}`} subtitle={ROLE_LABELS[user.rol] ?? user.rol} />

      {anuncios.length > 0 && (
        <Card className="space-y-3 p-4">
          <div className="flex items-center justify-between">
            <h2 className="text-h3 text-ink">Anuncios</h2>
            <Link to="/anuncios" className="text-sm font-semibold text-primary hover:underline">
              Ver todos
            </Link>
          </div>
          {anuncios.slice(0, 3).map((a) => (
            <div key={a.id} className="border-t border-border pt-3 first:border-t-0 first:pt-0">
              <p className="flex items-center gap-2 text-sm font-semibold text-ink">
                {a.titulo}
                {a.fijado && <Chip tone="blue">Fijado</Chip>}
              </p>
              <p className="line-clamp-2 whitespace-pre-line text-sm text-body">{a.cuerpo}</p>
            </div>
          ))}
        </Card>
      )}

      {/* Las noticias que le tocan a cada perfil, como mosaico. La navegación es el menú lateral (en celular, la hamburguesa), no una cuadrícula en el inicio. */}
      <MosaicoNoticiasInicio />
    </div>
  );
}
