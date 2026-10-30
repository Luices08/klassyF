import { type PointerEvent, useRef } from 'react';
import type { TamanoMosaico } from '../../hooks/useNoticias';
import { INFO_TAMANO, ORDEN_TAMANOS } from '../../lib/mosaicoNoticias';

interface EnfoqueDePortadaProps {
  src: string;
  x: number;
  y: number;
  onChange: (x: number, y: number) => void;
  /** El tamaño elegido: se resalta en las miniaturas. */
  tamano: TamanoMosaico;
}

/** La forma (ancho/alto) de cada tarjeta, para mostrar cómo queda la portada encuadrada en cada una. */
const PROPORCION: Record<TamanoMosaico, string> = { PRINCIPAL: 'aspect-square', DESTACADA: 'aspect-[2/1]', ESTANDAR: 'aspect-[1/2]', BREVE: 'aspect-square', BANDA: 'aspect-[3/2]' };
const ANCHO_MINIATURA: Record<TamanoMosaico, string> = { PRINCIPAL: 'w-16', DESTACADA: 'w-24', ESTANDAR: 'w-12', BREVE: 'w-12', BANDA: 'w-20' };

const acotar = (n: number): number => Math.min(100, Math.max(0, Math.round(n)));

/**
 * «Punto de enfoque»: se toca (o arrastra) sobre la foto lo que no debe quedar cortado, por ejemplo un rostro. La imagen no se recorta: cada tarjeta, según su forma,
 * la muestra mirando hacia ese punto. Las miniaturas enseñan cómo queda en cada tamaño, y los controles deslizantes permiten ajustarlo con el teclado.
 */
export function EnfoqueDePortada({ src, x, y, onChange, tamano }: EnfoqueDePortadaProps) {
  const marco = useRef<HTMLDivElement>(null);
  const arrastrando = useRef(false);

  const fijar = (e: PointerEvent<HTMLDivElement>) => {
    const caja = marco.current?.getBoundingClientRect();
    if (!caja || caja.width === 0 || caja.height === 0) return;
    onChange(acotar(((e.clientX - caja.left) / caja.width) * 100), acotar(((e.clientY - caja.top) / caja.height) * 100));
  };

  return (
    <div className="space-y-3">
      <p className="text-label text-ink">Punto de enfoque</p>
      <p className="text-xs text-muted">Toca la foto en lo que no debe quedar cortado (un rostro, un afiche). La imagen no se recorta: cada tarjeta la muestra mirando hacia ese punto.</p>
      <div
        ref={marco}
        onPointerDown={(e) => {
          arrastrando.current = true;
          e.currentTarget.setPointerCapture(e.pointerId);
          fijar(e);
        }}
        onPointerMove={(e) => arrastrando.current && fijar(e)}
        onPointerUp={() => (arrastrando.current = false)}
        onPointerCancel={() => (arrastrando.current = false)}
        className="relative inline-block max-w-full cursor-crosshair touch-none select-none overflow-hidden rounded-xl border border-border"
      >
        <img src={src} alt="Portada: toca el punto que debe quedar en el centro de las tarjetas" draggable={false} className="block max-h-56 w-auto max-w-full" />
        <span
          aria-hidden="true"
          style={{ left: `${x}%`, top: `${y}%` }}
          className="pointer-events-none absolute h-7 w-7 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-surface bg-primary/30 ring-2 ring-primary"
        />
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <label className="block text-xs text-muted">
          Horizontal ({x}%)
          <input type="range" min={0} max={100} value={x} onChange={(e) => onChange(Number(e.target.value), y)} className="mt-1 w-full accent-primary" aria-label="Enfoque horizontal" />
        </label>
        <label className="block text-xs text-muted">
          Vertical ({y}%)
          <input type="range" min={0} max={100} value={y} onChange={(e) => onChange(x, Number(e.target.value))} className="mt-1 w-full accent-primary" aria-label="Enfoque vertical" />
        </label>
      </div>

      <div className="flex flex-wrap items-end gap-3" aria-label="Así queda la portada en cada tamaño">
        {ORDEN_TAMANOS.map((t) => (
          <div key={t} className="space-y-1 text-center">
            <div className={`${ANCHO_MINIATURA[t]} ${PROPORCION[t]} overflow-hidden rounded-lg border-2 ${t === tamano ? 'border-primary' : 'border-border'}`}>
              <img src={src} alt="" draggable={false} className="h-full w-full object-cover" style={{ objectPosition: `${x}% ${y}%` }} />
            </div>
            <p className={`text-[11px] ${t === tamano ? 'font-semibold text-primary' : 'text-muted'}`}>{INFO_TAMANO[t].etiqueta}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
