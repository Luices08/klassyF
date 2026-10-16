import type { ComponentType, ReactNode, SVGProps } from 'react';
import { ChevronDownIcon } from './icons';

interface GrupoColapsableProps {
  titulo: string;
  icon: ComponentType<SVGProps<SVGSVGElement>>;
  abierto: boolean;
  onAlternar: () => void;
  /** Novedades de lo que contiene; solo se muestra con el grupo cerrado, porque abierto cada pantalla lleva la suya. */
  contador?: ReactNode;
  /** Hay una pantalla activa dentro: el título se resalta aunque esté cerrado. */
  activo?: boolean;
  children: ReactNode;
}

/** Categoría desplegable del menú lateral: título con flecha y, debajo, sus pantallas con sangría. */
export function GrupoColapsable({ titulo, icon: Icono, abierto, onAlternar, contador, activo = false, children }: GrupoColapsableProps) {
  return (
    <div>
      <button
        type="button"
        onClick={onAlternar}
        aria-expanded={abierto}
        className={`flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left text-sm font-semibold transition-colors hover:bg-soft ${
          activo && !abierto ? 'text-primary' : 'text-ink'
        }`}
      >
        <Icono className="h-[18px] w-[18px] shrink-0" />
        <span className="flex-1">{titulo}</span>
        {!abierto && contador}
        <ChevronDownIcon className={`h-4 w-4 shrink-0 text-muted transition-transform ${abierto ? '' : '-rotate-90'}`} />
      </button>
      {abierto && <div className="ml-4 mt-1 flex flex-col gap-1 border-l border-border pl-2">{children}</div>}
    </div>
  );
}
