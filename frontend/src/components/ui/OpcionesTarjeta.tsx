export interface OpcionTarjeta<T extends string = string> {
  value: T;
  titulo: string;
  /** Una línea que explica la opción con un ejemplo. */
  ejemplo?: string;
}

interface OpcionesTarjetaProps<T extends string = string> {
  label: string;
  options: OpcionTarjeta<T>[];
  value: T;
  onChange: (value: T) => void;
  disabled?: boolean;
}

/** Elegir una opción entre pocas, cada una como tarjeta con su ejemplo (mejor que un select cuando la diferencia necesita explicarse). */
export function OpcionesTarjeta<T extends string = string>({ label, options, value, onChange, disabled }: OpcionesTarjetaProps<T>) {
  return (
    <div role="radiogroup" aria-label={label} className="grid grid-cols-1 gap-3 sm:grid-cols-3">
      {options.map((o) => {
        const activa = o.value === value;
        return (
          <button
            key={o.value}
            type="button"
            role="radio"
            aria-checked={activa}
            disabled={disabled}
            onClick={() => onChange(o.value)}
            className={`rounded-lg border p-3 text-left transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary disabled:cursor-not-allowed ${
              activa ? 'border-primary bg-primary-soft' : 'border-border bg-surface hover:bg-soft'
            } ${disabled && !activa ? 'opacity-60' : ''}`}
          >
            <span className={`block text-sm font-semibold ${activa ? 'text-primary' : 'text-ink'}`}>{o.titulo}</span>
            {o.ejemplo && <span className="mt-0.5 block text-xs text-muted">{o.ejemplo}</span>}
          </button>
        );
      })}
    </div>
  );
}
