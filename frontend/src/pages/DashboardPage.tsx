import { Link } from 'react-router-dom';
import { Card, CardHeader } from '../components/ui/Card';
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
      <div>
        <h1 className="text-xl font-bold text-slate-900">
          Hola, {user.nombre} {user.apellido}
        </h1>
        <p className="text-sm text-slate-500">{ROLE_LABELS[user.rol] ?? user.rol}</p>
      </div>

      <Card>
        <CardHeader title="Accesos rápidos" />
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {links.map((link) => (
            <Link
              key={link.to}
              to={link.to}
              className="rounded-lg border border-slate-200 p-4 text-sm font-medium text-slate-700 transition-colors hover:border-indigo-300 hover:bg-indigo-50 hover:text-indigo-700"
            >
              {link.label}
            </Link>
          ))}
        </div>
      </Card>
    </div>
  );
}
