import { useMemo, useState } from 'react';
import type { DocenteCargaResumen } from '../../types/domain';

type Estado = DocenteCargaResumen['estado_carga'];

/** Cada barra mide lo mismo sin importar cuántos docentes haya: con cientos, la gráfica se desplaza hacia los lados. */
const ANCHO_BARRA = 44;
const SEPARACION = 6;
const ALTO_PLOT = 200;
/** Espacio sobre el techo del eje para el número de horas de la barra más alta. */
const MARGEN_SUPERIOR = 18;
const ALTO_TOTAL = ALTO_PLOT + MARGEN_SUPERIOR;

const ESTILO_ESTADO: Record<Estado, { etiqueta: string; barra: string; punto: string }> = {
  SOBRE_CARGA: { etiqueta: 'Sobrecarga', barra: 'bg-danger', punto: 'bg-danger' },
  NORMAL: { etiqueta: 'Normal', barra: 'bg-success', punto: 'bg-success' },
  SUB_CARGA: { etiqueta: 'Subcarga', barra: 'bg-warning', punto: 'bg-warning' },
  SIN_CARGA: { etiqueta: 'Sin carga', barra: 'bg-border', punto: 'bg-border' },
};

const ORDEN_LEYENDA: Estado[] = ['SOBRE_CARGA', 'NORMAL', 'SUB_CARGA', 'SIN_CARGA'];

interface GraficaCargaDocentesProps {
  items: DocenteCargaResumen[];
  onSeleccionar: (docenteId: string) => void;
}

interface TooltipEstado {
  item: DocenteCargaResumen;
  x: number;
  y: number;
}

/** Techo del eje en un número «redondo» para que las líneas guía caigan en valores legibles. */
function techoDelEje(maximo: number): number {
  if (maximo <= 5) return 5;
  const paso = maximo <= 20 ? 5 : 10;
  return Math.ceil(maximo / paso) * paso;
}

/**
 * Barras verticales de horas semanales por docente, de mayor a menor. Cada barra es un botón que abre su ficha;
 * el color es el estado de carga (y la leyenda y el tooltip lo dicen con palabras, no solo con color).
 */
export function GraficaCargaDocentes({ items, onSeleccionar }: GraficaCargaDocentesProps) {
  const [tooltip, setTooltip] = useState<TooltipEstado | null>(null);

  const ordenados = useMemo(
    () =>
      [...items].sort(
        (a, b) =>
          b.horas_totales - a.horas_totales ||
          a.docente.apellido.localeCompare(b.docente.apellido) ||
          a.docente.nombre.localeCompare(b.docente.nombre)
      ),
    [items]
  );

  const conteo = useMemo(() => {
    const c: Record<Estado, number> = { SOBRE_CARGA: 0, NORMAL: 0, SUB_CARGA: 0, SIN_CARGA: 0 };
    for (const i of items) c[i.estado_carga] += 1;
    return c;
  }, [items]);

  const techo = techoDelEje(Math.max(0, ...ordenados.map((i) => i.horas_totales)));
  const marcas = [0, techo / 2, techo];

  if (ordenados.length === 0) {
    return <p className="py-6 text-center text-sm text-muted">Aún no hay docentes con los que armar la gráfica.</p>;
  }

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center gap-x-4 gap-y-1">
        {ORDEN_LEYENDA.filter((e) => conteo[e] > 0).map((e) => (
          <span key={e} className="inline-flex items-center gap-1.5 text-xs text-body">
            <span className={`h-2.5 w-2.5 rounded-sm ${ESTILO_ESTADO[e].punto}`} />
            {ESTILO_ESTADO[e].etiqueta} ({conteo[e]})
          </span>
        ))}
      </div>

      <div className="flex">
        {/* El eje no se desplaza con las barras */}
        <div className="relative shrink-0 pr-2 text-right text-[11px] text-muted" style={{ height: ALTO_TOTAL, width: 34 }}>
          {marcas.map((m) => (
            <span key={m} className="absolute right-2 -translate-y-1/2" style={{ bottom: (m / techo) * ALTO_PLOT }}>
              {m}
            </span>
          ))}
        </div>

        <div className="min-w-0 flex-1 overflow-x-auto pb-2" onScroll={() => setTooltip(null)}>
          <div className="relative" style={{ width: ordenados.length * (ANCHO_BARRA + SEPARACION) }}>
            <div className="pointer-events-none absolute inset-x-0 top-0" style={{ height: ALTO_TOTAL }}>
              {marcas.map((m) => (
                <div
                  key={m}
                  className="absolute inset-x-0 border-t border-border"
                  style={{ bottom: (m / techo) * ALTO_PLOT }}
                />
              ))}
            </div>

            <div className="relative flex items-end" style={{ height: ALTO_TOTAL, gap: SEPARACION }}>
              {ordenados.map((item) => {
                const alto = item.horas_totales > 0 ? Math.max(4, (item.horas_totales / techo) * ALTO_PLOT) : 2;
                return (
                  <button
                    key={item.docente._id}
                    type="button"
                    onClick={() => onSeleccionar(item.docente._id)}
                    onMouseEnter={(e) => {
                      const r = e.currentTarget.getBoundingClientRect();
                      setTooltip({ item, x: r.left + r.width / 2, y: r.top });
                    }}
                    onMouseLeave={() => setTooltip(null)}
                    onFocus={(e) => {
                      const r = e.currentTarget.getBoundingClientRect();
                      setTooltip({ item, x: r.left + r.width / 2, y: r.top });
                    }}
                    onBlur={() => setTooltip(null)}
                    aria-label={`${item.docente.apellido}, ${item.docente.nombre}: ${item.horas_totales} horas, ${ESTILO_ESTADO[item.estado_carga].etiqueta}. Abrir su carga académica`}
                    className="group flex shrink-0 flex-col items-center justify-end focus-visible:outline-none"
                    style={{ width: ANCHO_BARRA, height: ALTO_TOTAL }}
                  >
                    <span className="mb-0.5 text-[11px] font-medium text-body">{item.horas_totales}</span>
                    <span
                      className={`w-full rounded-t-[4px] transition-opacity group-hover:opacity-80 group-focus-visible:ring-2 group-focus-visible:ring-primary ${ESTILO_ESTADO[item.estado_carga].barra}`}
                      style={{ height: alto }}
                    />
                  </button>
                );
              })}
            </div>

            <div className="mt-1 flex" style={{ gap: SEPARACION }}>
              {ordenados.map((item) => (
                <span
                  key={item.docente._id}
                  className="shrink-0 truncate text-center text-[11px] text-muted"
                  style={{ width: ANCHO_BARRA }}
                  title={`${item.docente.apellido}, ${item.docente.nombre}`}
                >
                  {item.docente.apellido}
                </span>
              ))}
            </div>
          </div>
        </div>
      </div>

      {tooltip && (
        <div
          role="tooltip"
          className="pointer-events-none fixed z-50 -translate-x-1/2 -translate-y-full rounded-lg bg-ink px-3 py-2 text-xs text-white shadow-lg"
          style={{ left: Math.min(Math.max(tooltip.x, 110), window.innerWidth - 110), top: tooltip.y - 8 }}
        >
          <p className="font-semibold">
            {tooltip.item.docente.apellido}, {tooltip.item.docente.nombre}
          </p>
          <p>
            {tooltip.item.horas_totales} h semanales · {ESTILO_ESTADO[tooltip.item.estado_carga].etiqueta}
            {tooltip.item.tope_horas ? ` (tope ${tooltip.item.tope_horas} h)` : ''}
          </p>
        </div>
      )}
    </div>
  );
}
