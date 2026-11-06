import { useState } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import { contadorDeRuta } from '../../hooks/useNotificaciones';
import type { ResumenNotificaciones } from '../../hooks/useNotificaciones';
import { GrupoColapsable } from '../ui/GrupoColapsable';
import { ContadorInsignia } from '../notificaciones/ContadorInsignia';
import { agruparMenu, type EntradaMenu, type NavItem } from './navigation';

function EnlaceMenu({ item, resumen }: { item: NavItem; resumen: ResumenNotificaciones | undefined }) {
  return (
    <NavLink
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
  );
}

/**
 * Menú lateral por categorías desplegables, en acordeón: una sola abierta a la vez (abrir otra cierra la anterior) y al navegar
 * queda abierta solo la categoría de la pantalla actual.
 */
export function MenuLateral({ items, resumen }: { items: NavItem[]; resumen: ResumenNotificaciones | undefined }) {
  const { pathname } = useLocation();
  const entradas = agruparMenu(items);
  const grupoActivo = entradas.find(
    (e): e is Extract<EntradaMenu, { tipo: 'grupo' }> =>
      e.tipo === 'grupo' && e.items.some((i) => pathname === i.to || pathname.startsWith(`${i.to}/`))
  );
  const claveActiva = grupoActivo?.grupo.clave ?? null;
  // Lo que la persona abrió o cerró vale solo mientras siga en la misma pantalla; al navegar vuelve a la categoría activa.
  const [eleccion, setEleccion] = useState<{ ruta: string; clave: string | null }>({ ruta: pathname, clave: claveActiva });
  const abierta = eleccion.ruta === pathname ? eleccion.clave : claveActiva;

  return (
    <nav className="flex flex-col gap-1">
      {entradas.map((entrada) => {
        if (entrada.tipo === 'item') return <EnlaceMenu key={entrada.item.to} item={entrada.item} resumen={resumen} />;
        const { grupo } = entrada;
        const activo = entrada.items.some((i) => pathname === i.to || pathname.startsWith(`${i.to}/`));
        const abierto = abierta === grupo.clave;
        const total = entrada.items.reduce((suma, i) => suma + contadorDeRuta(resumen, i.to), 0);
        return (
          <GrupoColapsable
            key={grupo.clave}
            titulo={grupo.label}
            icon={grupo.icon}
            abierto={abierto}
            activo={activo}
            contador={<ContadorInsignia valor={total} />}
            onAlternar={() => setEleccion({ ruta: pathname, clave: abierto ? null : grupo.clave })}
          >
            {entrada.items.map((item) => (
              <EnlaceMenu key={item.to} item={item} resumen={resumen} />
            ))}
          </GrupoColapsable>
        );
      })}
    </nav>
  );
}
