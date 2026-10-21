export interface BarraVertical {
  clave: string;
  etiqueta: string;
  /** Porcentaje 0–100. */
  valor: number;
  /** Lo que dice la ayuda al pasar el cursor (número exacto y base). */
  ayuda: string;
}

const ALTO_PX = 176;

/**
 * Barras verticales de una sola serie, porcentajes de 0 a 100: rejilla discreta, valor escrito sobre cada barra y etiqueta debajo. La más alta es la más oscura (el tono
 * baja con el orden, pero el número siempre está escrito: el color no es la única señal). El eje se redondea a la decena de arriba del mayor valor para que las
 * barras aprovechen la altura, sin pasar de 100.
 */
export function GraficaBarrasVerticales({ barras, vacio, etiquetaEje }: { barras: BarraVertical[]; vacio: string; etiquetaEje: string }) {
  if (barras.length === 0) return <p className="py-8 text-center text-sm text-muted">{vacio}</p>;

  const mayor = Math.max(...barras.map((b) => b.valor));
  const tope = Math.min(100, Math.max(10, Math.ceil(mayor / 10) * 10));
  const paso = tope > 50 ? 25 : tope > 20 ? 10 : 5;
  const marcas = Array.from({ length: Math.floor(tope / paso) + 1 }, (_, i) => i * paso);
  const alturaDe = (valor: number) => `${(valor / tope) * 100}%`;

  return (
    <div role="group" aria-label={etiquetaEje} className="flex gap-2">
      <div className="relative w-9 shrink-0" style={{ height: ALTO_PX }} aria-hidden="true">
        {marcas.map((m) => (
          <span key={m} className="absolute right-0 translate-y-1/2 text-[11px] text-muted" style={{ bottom: alturaDe(m) }}>
            {m}%
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
                  {Math.round(b.valor)}%
                </span>
                <div
                  className="absolute inset-x-1 bottom-0 rounded-t bg-primary"
                  style={{ height: alturaDe(b.valor), opacity: Math.max(0.35, 1 - i * 0.15) }}
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

