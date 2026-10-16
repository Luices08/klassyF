import { useState } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import { contadorDeRuta } from '../../hooks/useNotificaciones';
import type { ResumenNotificaciones } from '../../hooks/useNotificaciones';
import { GrupoColapsable } from '../ui/GrupoColapsable';
import { ContadorInsignia } from '../notificaciones/ContadorInsignia';
import { agruparMenu, type NavItem } from './navigation';

const CLAVE_ALMACEN = 'klassy.menu.grupos-abiertos';

// Solo comodidad: qué categorías dejó abiertas la persona. El menú funciona igual si el navegador no deja guardar.
function leerAbiertos(): string[] {
  try {
    const crudo = localStorage.getItem(CLAVE_ALMACEN);
    const valor: unknown = crudo ? JSON.parse(crudo) : [];
    return Array.isArray(valor) ? valor.filter((v): v is string => typeof v === 'string') : [];
  } catch {
    return [];
  }
}

function guardarAbiertos(claves: string[]) {
  try {
    localStorage.setItem(CLAVE_ALMACEN, JSON.stringify(claves));
  } catch {
    /* sin almacenamiento: se queda en memoria */
  }
}

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

/** Menú lateral por categorías desplegables. La categoría con la pantalla activa se abre sola. */
export function MenuLateral({ items, resumen }: { items: NavItem[]; resumen: ResumenNotificaciones | undefined }) {
  const { pathname } = useLocation();
  const [abiertos, setAbiertos] = useState<string[]>(leerAbiertos);
  // Cerrar a mano la categoría de la pantalla actual no sirve de nada mientras sigas en ella: se reabre al navegar, no al renderizar.
  const [cerradasAqui, setCerradasAqui] = useState<{ ruta: string; claves: string[] }>({ ruta: pathname, claves: [] });
  const cerradas = cerradasAqui.ruta === pathname ? cerradasAqui.claves : [];

  function alternar(clave: string, estabaAbierto: boolean) {
    if (estabaAbierto) {
      setAbiertos((prev) => {
        const nuevo = prev.filter((c) => c !== clave);
        guardarAbiertos(nuevo);
        return nuevo;
      });
      setCerradasAqui({ ruta: pathname, claves: [...cerradas, clave] });
    } else {
      setAbiertos((prev) => {
        const nuevo = [...prev, clave];
        guardarAbiertos(nuevo);
        return nuevo;
      });
      setCerradasAqui({ ruta: pathname, claves: cerradas.filter((c) => c !== clave) });
    }
  }

  return (
    <nav className="flex flex-col gap-1">
      {agruparMenu(items).map((entrada) => {
        if (entrada.tipo === 'item') return <EnlaceMenu key={entrada.item.to} item={entrada.item} resumen={resumen} />;
        const { grupo } = entrada;
        const activo = entrada.items.some((i) => pathname === i.to || pathname.startsWith(`${i.to}/`));
        const abierto = abiertos.includes(grupo.clave) || (activo && !cerradas.includes(grupo.clave));
        const total = entrada.items.reduce((suma, i) => suma + contadorDeRuta(resumen, i.to), 0);
        return (
          <GrupoColapsable
            key={grupo.clave}
            titulo={grupo.label}
            icon={grupo.icon}
            abierto={abierto}
            activo={activo}
            contador={<ContadorInsignia valor={total} />}
            onAlternar={() => alternar(grupo.clave, abierto)}
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
