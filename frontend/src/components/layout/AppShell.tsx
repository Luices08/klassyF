import { useEffect, useRef } from 'react';
import { NavLink, Outlet, useLocation } from 'react-router-dom';
import { AsistenteFlotante } from '../asistente/AsistenteFlotante';
import { RolBadge } from '../ui/Badge';
import { LogOutIcon, UserIcon } from '../ui/icons';
import { useAuth } from '../../context/AuthContext';
import { useInstitution } from '../../hooks/useInstitution';
import { CambiadorDePerfil } from './CambiadorDePerfil';
import { ForcedPasswordChangeGate } from './ForcedPasswordChangeGate';
import { NAV_ITEMS } from './navigation';
import { BotonNoticias } from '../noticias/BotonNoticias';
import { Campanita } from '../notificaciones/Campanita';
import { MenuLateral } from './MenuLateral';
import { useMarcarVisto, useResumenNotificaciones } from '../../hooks/useNotificaciones';
import type { Rol } from '../../types/api';

const PERSONAL_CON_NOTICIAS: Rol[] = ['ADMIN', 'COORDINADOR', 'SECRETARIA', 'COORDINADOR_CONVIVENCIA', 'ORIENTADOR'];

export function AppShell() {
  const { user, logout } = useAuth();
  const { data: institucion } = useInstitution();
  const { data: resumen } = useResumenNotificaciones();
  const marcarVisto = useMarcarVisto();
  const { pathname } = useLocation();
  const zonaContenido = useRef<HTMLElement>(null);
  const hayPuntoEnRuta = resumen?.insignias.some((i) => i.ruta === pathname && i.pestana === '') ?? false;

  // Entrar al módulo apaga su punto (los de pestañas se apagan cuando se abre la pestaña).
  useEffect(() => {
    if (hayPuntoEnRuta) marcarVisto.mutate({ ruta: pathname });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname, hayPuntoEnRuta]);

  // El contenido es lo único que se desplaza (menú y encabezado quedan fijos): cada pantalla empieza arriba.
  useEffect(() => {
    zonaContenido.current?.scrollTo({ top: 0 });
  }, [pathname]);

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
      <div className="fixed inset-0 overflow-hidden bg-soft">
        <div className="flex h-full">
          <aside className="hidden w-64 shrink-0 border-r border-border bg-surface sm:flex sm:flex-col">
            <div className="flex h-16 shrink-0 items-center px-6">
              <span className="text-h3 text-primary">Klassy</span>
            </div>
            <div className="flex-1 overflow-y-auto px-3 pb-4">
              <MenuLateral items={items} resumen={resumen} />
            </div>
          </aside>

          <div className="flex min-w-0 flex-1 flex-col">
            <header className="flex h-16 shrink-0 items-center justify-between border-b border-border bg-surface px-4 sm:px-6">
              <span className="text-h3 text-primary sm:hidden">Klassy</span>
              <div className="ml-auto flex items-center gap-4">
                {/* Docentes, estudiantes y acudientes ven las noticias en su inicio; el personal tiene mucho en el suyo y las abre aquí. */}
                {user && PERSONAL_CON_NOTICIAS.includes(user.rol) && <BotonNoticias />}
                <Campanita />
                <NavLink
                  to="/mi-cuenta"
                  title="Mi cuenta"
                  aria-label="Mi cuenta"
                  className={({ isActive }) =>
                    `inline-flex h-9 w-9 items-center justify-center rounded-full ring-1 ring-inset ring-border ${
                      isActive ? 'bg-primary-soft text-primary' : 'text-body hover:bg-soft'
                    }`
                  }
                >
                  <UserIcon className="h-[18px] w-[18px]" />
                </NavLink>
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

            <main ref={zonaContenido} className="flex-1 overflow-y-auto p-4 sm:p-6">
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
