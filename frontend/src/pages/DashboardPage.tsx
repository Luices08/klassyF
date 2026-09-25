import { Link } from 'react-router-dom';
import { PageHeader } from '../components/ui/PageHeader';
import { useAuth } from '../context/AuthContext';
import { NAV_ITEMS } from '../components/layout/navigation';

const ROLE_LABELS: Record<string, string> = {
  SUPERADMIN: 'Super administrador',
  ADMIN: 'Administrador',
  COORDINADOR: 'Coordinador',
  DOCENTE: 'Docente',
  SECRETARIA: 'Secretaría académica',
  ESTUDIANTE: 'Estudiante',
  ACUDIENTE: 'Acudiente',
};

export function DashboardPage() {
  const { user } = useAuth();
  if (!user) return null;

  const links = NAV_ITEMS.filter((item) => item.to !== '/' && (!item.roles || item.roles.includes(user.rol)));

  return (
    <div className="space-y-6">
      <PageHeader title={`Hola, ${user.nombre} ${user.apellido}`} subtitle={ROLE_LABELS[user.rol] ?? user.rol} />

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
          </Link>
        ))}
      </div>
    </div>
  );
}
