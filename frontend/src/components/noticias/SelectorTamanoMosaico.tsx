import type { TamanoMosaico } from '../../hooks/useNoticias';
import { INFO_TAMANO, ORDEN_TAMANOS } from '../../lib/mosaicoNoticias';

interface SelectorTamanoMosaicoProps {
  value: TamanoMosaico;
  onChange: (tamano: TamanoMosaico) => void;
  /** Hay otra noticia Principal vigente: solo se avisa (en el inicio solo la primera se ve grande). */
  hayOtraPrincipal?: boolean;
}

/** Cuánto del recuadro ocupa cada tamaño en su dibujo (ancho y alto en %): lo que ve quien elige es la forma que tendrá la tarjeta. */
const FORMA: Record<TamanoMosaico, { ancho: string; alto: string }> = {
  PRINCIPAL: { ancho: 'w-full', alto: 'h-full' },
  DESTACADA: { ancho: 'w-full', alto: 'h-1/2' },
  ESTANDAR: { ancho: 'w-1/2', alto: 'h-full' },
  BREVE: { ancho: 'w-1/2', alto: 'h-1/2' },
};

/**
 * «Tamaño de impacto en mosaico»: el redactor decide qué tan importante es la noticia. Cada opción dibuja la forma que ocupará (2x2, 2x1, 1x2 o 1x1) para que no
 * haga falta saber qué significan los números.
 */
export function SelectorTamanoMosaico({ value, onChange, hayOtraPrincipal }: SelectorTamanoMosaicoProps) {
  return (
    <fieldset className="space-y-2">
      <legend className="text-label text-ink">Tamaño de impacto en el mosaico</legend>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {ORDEN_TAMANOS.map((t) => {
          const info = INFO_TAMANO[t];
          return (
            <label key={t} className="block cursor-pointer">
              <input type="radio" name="tamano_mosaico" value={t} checked={value === t} onChange={() => onChange(t)} className="peer sr-only" />
              <span className="flex h-full flex-col items-center gap-1.5 rounded-xl border border-border bg-surface p-2.5 text-center transition-colors hover:bg-soft peer-checked:border-primary peer-checked:bg-primary-soft peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-primary">
                <span className="flex h-12 w-12 items-start justify-start rounded-md border border-border bg-surface p-1" aria-hidden="true">
                  <span className={`${FORMA[t].ancho} ${FORMA[t].alto} rounded-sm bg-primary/70`} />
                </span>
                <span className="text-sm font-semibold text-ink">{info.etiqueta}</span>
                <span className="text-xs text-muted">({info.medida})</span>
              </span>
            </label>
          );
        })}
      </div>
      <p className="text-xs text-muted">{INFO_TAMANO[value].descripcion}</p>
      {value === 'PRINCIPAL' && hayOtraPrincipal && (
        <p className="text-xs text-warning">Ya hay otra noticia Principal vigente: en los inicios solo la primera se ve grande y las demás se dibujan como Destacadas.</p>
      )}
    </fieldset>
  );
}
