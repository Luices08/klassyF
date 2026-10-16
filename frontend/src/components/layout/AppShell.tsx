import { useEffect } from 'react';
import { NavLink, Outlet, useLocation } from 'react-router-dom';
import { AsistenteFlotante } from '../asistente/AsistenteFlotante';
import { RolBadge } from '../ui/Badge';
import { LogOutIcon } from '../ui/icons';
import { useAuth } from '../../context/AuthContext';
import { useInstitution } from '../../hooks/useInstitution';
import { CambiadorDePerfil } from './CambiadorDePerfil';
import { ForcedPasswordChangeGate } from './ForcedPasswordChangeGate';
import { NAV_ITEMS } from './navigation';
import { Campanita } from '../notificaciones/Campanita';
import { ContadorInsignia } from '../notificaciones/ContadorInsignia';
import { contadorDeRuta, useMarcarVisto, useResumenNotificaciones } from '../../hooks/useNotificaciones';

export function AppShell() {
  const { user, logout } = useAuth();
  const { data: institucion } = useInstitution();
  const { data: resumen } = useResumenNotificaciones();
  const marcarVisto = useMarcarVisto();
  const { pathname } = useLocation();
  const hayPuntoEnRuta = resumen?.insignias.some((i) => i.ruta === pathname && i.pestana === '') ?? false;

  // Entrar al módulo apaga su punto (los de pestañas se apagan cuando se abre la pestaña).
  useEffect(() => {
    if (hayPuntoEnRuta) marcarVisto.mutate({ ruta: pathname });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname, hayPuntoEnRuta]);

  const noLeidas = resumen?.no_leidas ?? 0;
  // Quien deja la pestaña abierta ve en el título si le llegó algo.
  useEffect(() => {
    document.title = noLeidas > 0 ? `(${noLeidas}) Klassy` : 'Klassy';
    return () => {
      document.title = 'Klassy';
    };
  }, [noLeidas]);

  if (!user) return null;


  const esVirtual = institucion?.modalidad === 'VIRTUAL';
  const items = NAV_ITEMS.filter(
    (item) => (!item.roles || item.roles.includes(user.rol)) && !(item.soloPresencial && esVirtual)
  );

  return (
    <ForcedPasswordChangeGate>
      <div className="min-h-screen bg-soft">
        <div className="flex min-h-screen">
          <aside className="hidden w-64 shrink-0 border-r border-border bg-surface sm:flex sm:flex-col">
            <div className="flex h-16 items-center px-6">
              <span className="text-h3 text-primary">Klassy</span>
            </div>
            <nav className="flex flex-col gap-1 px-3">
              {items.map((item) => (
                <NavLink
                  key={item.to}
                  to={item.to}
                  end={item.to === '/panel'}
                  className={({ isActive }) =>
                    `flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
                      isActive ? 'bg-primary-soft text-primary' : 'text-body hover:bg-soft'
                    }`
                  }
                >
                  <item.icon className="h-[18px] w-[18px] shrink-0" />
                  {item.label}
                  <ContadorInsignia valor={contadorDeRuta(resumen, item.to)} />
                </NavLink>
              ))}
            </nav>
          </aside>

          <div className="flex flex-1 flex-col">
            <header className="flex h-16 items-center justify-between border-b border-border bg-surface px-4 sm:px-6">
              <span className="text-h3 text-primary sm:hidden">Klassy</span>
              <div className="ml-auto flex items-center gap-4">
                <Campanita />
                <CambiadorDePerfil />
                <div className="text-right">
                  <p className="text-sm font-semibold text-ink">
                    {user.nombre} {user.apellido}
                  </p>
                  <div className="mt-0.5 flex justify-end">
                    <RolBadge value={user.rol} />
                  </div>
                </div>
                <button
                  onClick={logout}
                  className="inline-flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium text-body ring-1 ring-inset ring-border hover:bg-soft"
                >
                  <LogOutIcon className="h-4 w-4" />
                  Salir
                </button>
              </div>
            </header>

            <main className="flex-1 p-4 sm:p-6">
              {/* Contenedor global: max-w-7xl (no max-w-5xl) para que tablas anchas
                  (Usuarios, Grupos) no scrolleen antes de tiempo en pantallas grandes. */}
              <div className="mx-auto max-w-7xl">
                <Outlet />
              </div>
            </main>
          </div>
        </div>
      </div>
      <AsistenteFlotante items={items} />
    </ForcedPasswordChangeGate>
  );
}
