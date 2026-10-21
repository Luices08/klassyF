import { Link } from 'react-router-dom';
import { contadorDeRuta, useResumenNotificaciones } from '../../hooks/useNotificaciones';
import { ContadorInsignia } from '../notificaciones/ContadorInsignia';
import type { NavItem } from '../layout/navigation';

/**
 * Una tarjeta por cada pantalla que el rol puede abrir, con su punto rojo de novedades. En pantallas pequeñas es la navegación del sistema (el menú lateral
 * se oculta), por eso los dashboards de rectoría y coordinación la conservan debajo de sus indicadores.
 */
export function CuadriculaDeAccesos({ links }: { links: NavItem[] }) {
  const { data: resumen } = useResumenNotificaciones();
  return (
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
  );
}
