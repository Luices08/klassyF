import type { Tone } from '../ui/Badge';
import { ProgressBar } from '../ui/ProgressBar';

export interface FilaBarra {
  clave: string;
  etiqueta: string;
  valor: number;
  /** Con qué valor la barra se llena del todo (el mismo para todas las filas, así se pueden comparar). */
  maximo: number;
  /** Lo que se lee a la derecha de la etiqueta; por defecto el valor. */
  texto?: string;
  detalle?: string;
  tono?: Tone;
}

/**
 * Barras horizontales comparables: una etiqueta, su número escrito y la barra. El número va siempre en texto (el color nunca es la única señal) y la barra
 * reusa `ProgressBar`, así que no hay un estilo de gráfica nuevo que mantener.
 */
export function BarrasHorizontales({ filas, vacio }: { filas: FilaBarra[]; vacio: string }) {
  if (filas.length === 0) return <p className="py-4 text-center text-sm text-muted">{vacio}</p>;
  return (
    <ul className="space-y-3">
      {filas.map((f) => (
        <li key={f.clave} className="space-y-1">
          <div className="flex items-baseline justify-between gap-3 text-sm">
            <span className="min-w-0 truncate font-medium text-ink" title={f.etiqueta}>
              {f.etiqueta}
            </span>
            <span className="shrink-0 text-body">{f.texto ?? String(f.valor)}</span>
          </div>
          <ProgressBar value={f.valor} max={f.maximo} tone={f.tono ?? 'blue'} label={`${f.etiqueta}: ${f.texto ?? f.valor}`} />
          {f.detalle && <p className="text-xs text-muted">{f.detalle}</p>}
        </li>
      ))}
    </ul>
  );
}
