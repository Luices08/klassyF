import { useEffect, useId, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import { FieldWrapper } from './Field';
import { ChevronDownIcon } from './icons';

export interface OpcionBuscable {
  value: string;
  label: string;
  /** Texto secundario que también se busca (p. ej. el documento). */
  detalle?: string;
}

interface SelectBuscableProps {
  label: string;
  value: string;
  onChange: (value: string) => void;
  opciones: OpcionBuscable[];
  placeholder?: string;
  /** Si se da, la lista ofrece esta opción primero para dejar el valor vacío. */
  vacioLabel?: string;
  hint?: string;
  disabled?: boolean;
}

/** Cuántas opciones se dibujan a la vez: con cientos de registros el resto se alcanza escribiendo. */
const MAX_VISIBLES = 100;

const normalizar = (texto: string) => texto.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();

/**
 * Select con buscador: un campo de texto que filtra la lista mientras se escribe (sin tildes ni mayúsculas) y se
 * maneja con teclado (flechas, Enter, Escape). Para listas largas, como los docentes de una institución grande.
 */
export function SelectBuscable({
  label,
  value,
  onChange,
  opciones,
  placeholder = 'Buscar…',
  vacioLabel,
  hint,
  disabled,
}: SelectBuscableProps) {
  const id = useId();
  const contenedor = useRef<HTMLDivElement>(null);
  const [abierto, setAbierto] = useState(false);
  const [consulta, setConsulta] = useState('');
  const [activo, setActivo] = useState(0);

  const seleccionada = opciones.find((o) => o.value === value);

  const filtradas = useMemo(() => {
    const q = normalizar(consulta.trim());
    const coinciden = q
      ? opciones.filter((o) => normalizar(`${o.label} ${o.detalle ?? ''}`).includes(q))
      : opciones;
    return coinciden;
  }, [opciones, consulta]);

  const visibles = filtradas.slice(0, MAX_VISIBLES);
  const items: OpcionBuscable[] = vacioLabel && !consulta.trim() ? [{ value: '', label: vacioLabel }, ...visibles] : visibles;

  useEffect(() => {
    if (!abierto) return;
    function alPresionarFuera(e: MouseEvent) {
      if (!contenedor.current?.contains(e.target as Node)) setAbierto(false);
    }
    document.addEventListener('mousedown', alPresionarFuera);
    return () => document.removeEventListener('mousedown', alPresionarFuera);
  }, [abierto]);

  function elegir(opcion: OpcionBuscable) {
    onChange(opcion.value);
    setAbierto(false);
    setConsulta('');
  }

  function alTeclear(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setAbierto(true);
      setActivo((i) => Math.min(i + 1, items.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActivo((i) => Math.max(i - 1, 0));
    } else if (e.key === 'Enter' && abierto) {
      e.preventDefault();
      if (items[activo]) elegir(items[activo]);
    } else if (e.key === 'Escape') {
      setAbierto(false);
      setConsulta('');
    }
  }

  return (
    <FieldWrapper label={label} htmlFor={id} hint={hint}>
      <div ref={contenedor} className="relative">
        <input
          id={id}
          type="text"
          role="combobox"
          aria-expanded={abierto}
          aria-controls={`${id}-lista`}
          aria-autocomplete="list"
          autoComplete="off"
          disabled={disabled}
          placeholder={seleccionada && !abierto ? undefined : placeholder}
          value={abierto ? consulta : (seleccionada?.label ?? '')}
          onFocus={() => {
            setAbierto(true);
            setConsulta('');
            setActivo(0);
          }}
          onChange={(e) => {
            setConsulta(e.target.value);
            setAbierto(true);
            setActivo(0);
          }}
          onKeyDown={alTeclear}
          className="block w-full rounded-lg border-0 bg-white py-2 pl-3 pr-9 text-sm text-ink ring-1 ring-inset ring-border placeholder:text-muted focus:ring-2 focus:ring-inset focus:ring-primary disabled:bg-soft disabled:text-muted"
        />
        <ChevronDownIcon className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />

        {abierto && (
          <ul
            id={`${id}-lista`}
            role="listbox"
            className="absolute z-30 mt-1 max-h-64 w-full overflow-y-auto rounded-lg border border-border bg-surface py-1 shadow-lg"
          >
            {items.length === 0 && <li className="px-3 py-2 text-sm text-muted">Sin coincidencias.</li>}
            {items.map((o, i) => (
              <li
                key={o.value || 'vacio'}
                role="option"
                aria-selected={o.value === value}
                onMouseEnter={() => setActivo(i)}
                onMouseDown={(e) => {
                  e.preventDefault();
                  elegir(o);
                }}
                className={`cursor-pointer px-3 py-2 text-sm ${
                  i === activo ? 'bg-primary-soft text-primary' : 'text-body'
                } ${o.value === value ? 'font-semibold' : ''}`}
              >
                {o.label}
                {o.detalle && <span className="ml-2 text-xs text-muted">{o.detalle}</span>}
              </li>
            ))}
            {filtradas.length > MAX_VISIBLES && (
              <li className="px-3 py-2 text-xs text-muted">
                Se muestran {MAX_VISIBLES} de {filtradas.length}: escribe para acotar la búsqueda.
              </li>
            )}
          </ul>
        )}
      </div>
    </FieldWrapper>
  );
}
