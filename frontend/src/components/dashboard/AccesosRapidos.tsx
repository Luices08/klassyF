import type { ComponentType, SVGProps } from 'react';
import { Link } from 'react-router-dom';
import { ContadorInsignia } from '../notificaciones/ContadorInsignia';
import type { Tone } from '../ui/Badge';
import { Card, CardHeader } from '../ui/Card';
import { ChevronRightIcon } from '../ui/icons';

export interface AccesoRapido {
  etiqueta: string;
  descripcion?: string;
  icono: ComponentType<SVGProps<SVGSVGElement>>;
  /** Una pantalla del sistema… */
  to?: string;
  /** …o una acción que abre algo en la misma página (p. ej. el formulario de un comunicado). Uno de los dos. */
  onClick?: () => void;
  /** Novedades pendientes de esa pantalla (el mismo punto rojo del menú). */
  contador?: number;
  /** Color del icono en la versión `destacados`; por defecto azul. */
  tono?: Tone;
}

const CLASES = 'flex items-center gap-3 rounded-xl border border-border bg-surface p-3 text-left text-sm font-semibold text-ink transition-colors hover:border-primary/40 hover:bg-primary-soft hover:text-primary';
const CLASES_DESTACADO = 'group flex items-center gap-4 rounded-xl border border-border bg-surface p-4 text-left text-sm font-semibold text-ink shadow-sm transition-colors hover:border-primary/40 hover:bg-primary-soft/50';

const TONO_ICONO: Record<Tone, string> = {
  blue: 'bg-primary-soft text-primary',
  green: 'bg-success-soft text-success',
  orange: 'bg-warning-soft text-warning',
  red: 'bg-danger-soft text-danger',
  neutral: 'bg-soft text-muted',
};

function Contenido({ a, destacado }: { a: AccesoRapido; destacado: boolean }) {
  return (
    <>
      <span className={`flex shrink-0 items-center justify-center rounded-full ${destacado ? `h-11 w-11 ${TONO_ICONO[a.tono ?? 'blue']}` : 'h-9 w-9 bg-primary-soft text-primary'}`}>
        <a.icono className={destacado ? 'h-5 w-5' : 'h-[18px] w-[18px]'} />
      </span>
      <span className={`min-w-0 ${destacado ? 'flex-1' : ''}`}>
        <span className="block">{a.etiqueta}</span>
        {a.descripcion && <span className="block text-xs font-normal text-muted">{a.descripcion}</span>}
      </span>
      <ContadorInsignia valor={a.contador ?? 0} />
      {destacado && <ChevronRightIcon className="h-4 w-4 shrink-0 text-muted transition-transform group-hover:translate-x-0.5 group-hover:text-primary" />}
    </>
  );
}

/**
 * Los atajos a lo que el rol hace más seguido. Cada uno lleva a la pantalla que ya existe: el dashboard no duplica ningún formulario.
 * `destacados` es la versión de pocos accesos grandes (icono de color y flecha) que usa el panel de rectoría.
 */
export function AccesosRapidos({
  accesos,
  titulo = 'Accesos rápidos',
  subtitulo,
  destacados = false,
  columnas = 2,
}: {
  accesos: AccesoRapido[];
  titulo?: string;
  subtitulo?: string;
  destacados?: boolean;
  /** `1` para una columna angosta (los accesos se apilan); por defecto dos en pantallas medianas. */
  columnas?: 1 | 2;
}) {
  const clases = destacados ? CLASES_DESTACADO : CLASES;
  return (
    <Card>
      <CardHeader title={titulo} subtitle={subtitulo} />
      <div className={`grid grid-cols-1 gap-3 ${columnas === 2 ? 'sm:grid-cols-2' : ''}`}>
        {accesos.map((a) =>
          a.to ? (
            <Link key={a.etiqueta} to={a.to} className={clases}>
              <Contenido a={a} destacado={destacados} />
            </Link>
          ) : (
            <button key={a.etiqueta} type="button" onClick={a.onClick} className={clases}>
              <Contenido a={a} destacado={destacados} />
            </button>
          )
        )}
      </div>
    </Card>
  );
}
