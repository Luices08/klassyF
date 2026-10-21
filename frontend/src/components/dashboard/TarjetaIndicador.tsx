import type { ComponentType, ReactNode, SVGProps } from 'react';
import { errorMessage } from '../ui/Alert';
import type { Tone } from '../ui/Badge';
import { Card } from '../ui/Card';
import { ProgressBar } from '../ui/ProgressBar';
import { Spinner } from '../ui/Spinner';

const TONO_ICONO: Record<Tone, string> = {
  blue: 'bg-primary-soft text-primary',
  green: 'bg-success-soft text-success',
  orange: 'bg-warning-soft text-warning',
  red: 'bg-danger-soft text-danger',
  neutral: 'bg-soft text-muted',
};

/** Fondo de la variante `tinte`: la familia soft del tono que se desvanece a blanco, sin colores nuevos. */
const TONO_TINTE: Record<Tone, string> = {
  blue: 'bg-gradient-to-br from-primary-soft to-surface',
  green: 'bg-gradient-to-br from-success-soft to-surface',
  orange: 'bg-gradient-to-br from-warning-soft to-surface',
  red: 'bg-gradient-to-br from-danger-soft to-surface',
  neutral: 'bg-gradient-to-br from-soft to-surface',
};

const TEXTO_ICONO_TINTE: Record<Tone, string> = {
  blue: 'text-primary',
  green: 'text-success',
  orange: 'text-warning',
  red: 'text-danger',
  neutral: 'text-muted',
};

interface TarjetaIndicadorProps {
  titulo: string;
  icono: ComponentType<SVGProps<SVGSVGElement>>;
  tono?: Tone;
  /** El número grande ya formateado; `null` = no hay datos que medir (se muestra «—» y `vacio`). */
  valor: string | null;
  detalle?: ReactNode;
  /** Barra bajo el número (p. ej. matrícula contra cupos). */
  progreso?: { value: number; max: number; tono?: Tone; etiqueta: string };
  /** Lo que se dice cuando no hay datos: nunca un 0 % inventado. */
  vacio?: string;
  cargando?: boolean;
  error?: unknown;
  /** Fondo teñido con el tono y número más discreto: la versión de las tarjetas de resumen del panel de rectoría. */
  tinte?: boolean;
  /** La explicación larga (p. ej. de dónde sale una cifra provisional), como ayuda al pasar el cursor por el título. */
  ayuda?: string;
}

/** Una tarjeta de indicador del dashboard: título, número grande, barra opcional y una línea de contexto. Maneja sola su carga y su error. */
export function TarjetaIndicador({ titulo, icono: Icono, tono = 'blue', valor, detalle, progreso, vacio = 'Aún no hay datos para medir.', cargando, error, tinte = false, ayuda }: TarjetaIndicadorProps) {
  return (
    <Card className={`space-y-3 p-4 ${tinte ? TONO_TINTE[tono] : ''}`}>
      <div className="flex items-center gap-3" title={ayuda}>
        <span className={`flex shrink-0 items-center justify-center rounded-full ${tinte ? `h-10 w-10 bg-surface shadow-sm ${TEXTO_ICONO_TINTE[tono]}` : `h-9 w-9 ${TONO_ICONO[tono]}`}`}>
          <Icono className="h-[18px] w-[18px]" />
        </span>
        <p className={tinte ? 'text-sm font-semibold text-ink' : 'text-label text-muted'}>{titulo}</p>
      </div>

      {cargando ? (
        <Spinner />
      ) : error ? (
        <p className="text-sm text-danger">{errorMessage(error)}</p>
      ) : (
        <>
          <p className={tinte ? 'text-h2 text-ink' : 'text-h1 text-ink'}>{valor ?? '—'}</p>
          {valor === null && <p className="text-sm text-muted">{vacio}</p>}
          {valor !== null && progreso && <ProgressBar value={progreso.value} max={progreso.max} tone={progreso.tono ?? tono} label={progreso.etiqueta} />}
          {valor !== null && detalle && <div className="text-sm text-body">{detalle}</div>}
        </>
      )}
    </Card>
  );
}
