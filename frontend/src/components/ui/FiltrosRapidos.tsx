export interface FiltroRapido {
  clave: string;
  etiqueta: string;
  /** Cuántos elementos tiene el filtro; opcional. */
  cantidad?: number;
}

interface FiltrosRapidosProps {
  items: FiltroRapido[];
  valor: string;
  onChange: (clave: string) => void;
  ariaLabel: string;
}

/** Hilera de botones tipo píldora para segmentar un listado sin abrir otro select (una sola opción activa). */
export function FiltrosRapidos({ items, valor, onChange, ariaLabel }: FiltrosRapidosProps) {
  return (
    <div role="group" aria-label={ariaLabel} className="flex flex-wrap gap-2">
      {items.map((item) => {
        const activo = item.clave === valor;
        return (
          <button
            key={item.clave}
            type="button"
            aria-pressed={activo}
            onClick={() => onChange(item.clave)}
            className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-semibold transition-colors ${
              activo ? 'border-primary bg-primary-soft text-primary' : 'border-border bg-surface text-muted hover:text-body'
            }`}
          >
            {item.etiqueta}
            {item.cantidad !== undefined && <span className={activo ? 'text-primary' : 'text-muted'}>{item.cantidad}</span>}
          </button>
        );
      })}
    </div>
  );
}
