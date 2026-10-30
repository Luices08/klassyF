import type { NavItem } from '../layout/navigation';
import { CuadriculaDeAccesos } from './CuadriculaDeAccesos';
import { SeccionPlegable } from './SeccionPlegable';

/** La cuadrícula de todos los accesos del menú, plegada: el menú lateral (o la hamburguesa en celular) ya es la navegación; esto es un atajo con las novedades. */
export function SeccionTodasLasPantallas({ links }: { links: NavItem[] }) {
  return (
    <SeccionPlegable titulo="Todas las pantallas" subtitulo="Los accesos del menú, con sus novedades.">
      <CuadriculaDeAccesos links={links} />
    </SeccionPlegable>
  );
}
