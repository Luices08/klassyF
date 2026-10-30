import type { Tone } from '../ui/Badge';

export interface BarraVertical {
  clave: string;
  etiqueta: string;
  /** Porcentaje 0–100, o la cantidad si la gráfica es de conteos. */
  valor: number;
  /** Lo que dice la ayuda al pasar el cursor (número exacto y base). */
  ayuda: string;
  /** Color de la barra por su significado (p. ej. el nivel de desempeño). Sin él, azul que se aclara con el orden. */
  tono?: Tone;
}

const ALTO_PX = 176;

const COLOR_BARRA: Record<Tone, string> = {
  blue: 'bg-primary',
  green: 'bg-success',
  orange: 'bg-warning',
  red: 'bg-danger',
  neutral: 'bg-muted',
};

/** Marcas del eje para conteos: enteros redondos hasta el mayor valor (1, 2, 5, 10, 20, 50…). */
function topeDeConteo(mayor: number) {
  if (mayor <= 4) return Math.max(2, Math.ceil(mayor));
  const orden = 10 ** Math.floor(Math.log10(mayor));
  return Math.ceil(mayor / (orden / 2)) * (orden / 2);
}

/**
 * Barras verticales de una sola serie: rejilla discreta, valor escrito sobre cada barra y etiqueta debajo. Por defecto son porcentajes de 0 a 100 (el eje se redondea
 * a la decena de arriba del mayor valor); con `unidad="conteo"` son cantidades. Sin `tono` la más alta es la más oscura; con `tono` el color dice qué significa la barra.
 * En ambos casos el número está siempre escrito: el color no es la única señal.
 */
export function GraficaBarrasVerticales({
  barras,
  vacio,
  etiquetaEje,
  unidad = 'porcentaje',
}: {
  barras: BarraVertical[];
  vacio: string;
  etiquetaEje: string;
  unidad?: 'porcentaje' | 'conteo';
}) {
  if (barras.length === 0) return <p className="py-8 text-center text-sm text-muted">{vacio}</p>;

  const porcentaje = unidad === 'porcentaje';
  const mayor = Math.max(...barras.map((b) => b.valor));
  const tope = porcentaje ? Math.min(100, Math.max(10, Math.ceil(mayor / 10) * 10)) : topeDeConteo(mayor);
  const paso = porcentaje ? (tope > 50 ? 25 : tope > 20 ? 10 : 5) : Math.max(1, tope / (tope <= 4 ? tope : 4));
  const marcas = Array.from({ length: Math.floor(tope / paso) + 1 }, (_, i) => i * paso);
  const alturaDe = (valor: number) => `${(valor / tope) * 100}%`;
  const texto = (valor: number) => (porcentaje ? `${Math.round(valor)}%` : Math.round(valor).toLocaleString('es-CO'));

  return (
    <div role="group" aria-label={etiquetaEje} className="flex gap-2">
      <div className="relative w-9 shrink-0" style={{ height: ALTO_PX }} aria-hidden="true">
        {marcas.map((m) => (
          <span key={m} className="absolute right-0 translate-y-1/2 text-[11px] text-muted" style={{ bottom: alturaDe(m) }}>
            {texto(m)}
          </span>
        ))}
      </div>

      <div className="min-w-0 flex-1">
        <div className="relative" style={{ height: ALTO_PX }}>
          {marcas.map((m) => (
            <div key={m} aria-hidden="true" className="absolute inset-x-0 border-t border-border/70" style={{ bottom: alturaDe(m) }} />
          ))}
          <ul className="absolute inset-0 flex justify-around gap-2 px-2">
            {barras.map((b, i) => (
              <li key={b.clave} title={b.ayuda} className="relative h-full w-full max-w-24">
                <span className="absolute inset-x-0 mb-1 text-center text-xs font-semibold text-ink" style={{ bottom: alturaDe(b.valor) }}>
                  {texto(b.valor)}
                </span>
                <div
                  className={`absolute inset-x-1 bottom-0 rounded-t ${COLOR_BARRA[b.tono ?? 'blue']}`}
                  style={{ height: alturaDe(b.valor), opacity: b.tono ? 1 : Math.max(0.35, 1 - i * 0.15) }}
                />
              </li>
            ))}
          </ul>
        </div>
        <ul className="mt-2 flex justify-around gap-2 px-2">
          {barras.map((b) => (
            <li key={b.clave} className="w-full max-w-24 text-center text-[11px] leading-tight text-muted" title={b.etiqueta}>
              <span className="line-clamp-2 break-words">{b.etiqueta}</span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
