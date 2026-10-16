import { Link, Navigate } from 'react-router-dom';
import { ContadorInsignia } from '../components/notificaciones/ContadorInsignia';
import { Card } from '../components/ui/Card';
import { Chip } from '../components/ui/Badge';
import { contadorDeRuta, useAnuncios, useResumenNotificaciones } from '../hooks/useNotificaciones';
import { PageHeader } from '../components/ui/PageHeader';
import { useAuth } from '../context/AuthContext';
import { NAV_ITEMS } from '../components/layout/navigation';

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
  const { data: resumen } = useResumenNotificaciones();
  const { data: anuncios = [] } = useAnuncios();
  if (!user) return null;
  // El acudiente no tiene panel de accesos: su inicio es el portal.
  if (user.rol === 'ACUDIENTE') return <Navigate to="/portal" replace />;

  const links = NAV_ITEMS.filter((item) => item.to !== '/panel' && !item.soloEncabezado && (!item.roles || item.roles.includes(user.rol)));

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

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {links.map((link) => (
          <Link
            key={link.to}
            to={link.to}
            className="flex items-center gap-3 rounded-xl border border-border bg-surface p-4 text-sm font-semibold text-ink transition-colors hover:border-primary/40 hover:bg-primary-soft hover:text-primary"
          >
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary-soft text-primary">
              <link.icon className="h-[18px] w-[18px]" />
            </span>
            {link.label}
            <ContadorInsignia valor={contadorDeRuta(resumen, link.to)} />
          </Link>
        ))}
      </div>
    </div>
  );
}
