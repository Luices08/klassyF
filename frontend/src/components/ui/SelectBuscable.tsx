import { useEffect, useId, useLayoutEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import { createPortal } from 'react-dom';
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
  error?: string;
  /** Validación nativa del formulario: el campo no puede quedar sin elegir al enviarlo. */
  required?: boolean;
  /** Oculta la etiqueta a la vista (sigue disponible para lectores de pantalla): filas repetidas con encabezado común. */
  hideLabel?: boolean;
  /** Clases del campo (p. ej. `max-w-xs`), igual que en `Select`. */
  className?: string;
  id?: string;
}

/** Cuántas opciones se dibujan a la vez: con cientos de registros el resto se alcanza escribiendo. */
const MAX_VISIBLES = 100;
const ALTO_MAXIMO_LISTA = 256;
const ANCHO_MINIMO_LISTA = 260;
/** Espacio libre mínimo debajo del campo para abrir la lista hacia abajo; con menos, y más sitio arriba, se abre hacia arriba. */
const ESPACIO_MINIMO_ABAJO = 180;

const normalizar = (texto: string) => texto.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

interface PosicionLista {
  left: number;
  width: number;
  top?: number;
  bottom?: number;
  maxHeight: number;
}

/** La lista se dibuja fuera del formulario (portal): así ni el cuerpo de un drawer ni una tabla con scroll la recortan. */
function calcularPosicion(campo: HTMLElement): PosicionLista {
  const r = campo.getBoundingClientRect();
  const abajo = window.innerHeight - r.bottom - 8;
  const arriba = r.top - 8;
  // En una celda angosta los nombres se partirían: la lista puede ser más ancha que el campo, sin salirse de la ventana.
  const width = Math.min(Math.max(r.width, ANCHO_MINIMO_LISTA), window.innerWidth - 16);
  const left = Math.max(8, Math.min(r.left, window.innerWidth - width - 8));
  if (abajo < ESPACIO_MINIMO_ABAJO && arriba > abajo) {
    return { left, width, bottom: window.innerHeight - r.top + 4, maxHeight: Math.min(ALTO_MAXIMO_LISTA, arriba) };
  }
  return { left, width, top: r.bottom + 4, maxHeight: Math.min(ALTO_MAXIMO_LISTA, abajo) };
}

const mismaPosicion = (a: PosicionLista | null, b: PosicionLista) =>
  a !== null && a.left === b.left && a.width === b.width && a.top === b.top && a.bottom === b.bottom && a.maxHeight === b.maxHeight;

/**
 * Select con buscador: un campo de texto que filtra la lista mientras se escribe (sin tildes ni mayúsculas; cada palabra
 * escrita debe aparecer, en cualquier orden) y se maneja con teclado (flechas, Enter, Escape). Para listas largas:
 * estudiantes, docentes, usuarios o grupos de una institución grande.
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
  error,
  required,
  hideLabel,
  className = '',
  id: idPropio,
}: SelectBuscableProps) {
  const idGenerado = useId();
  const id = idPropio ?? idGenerado;
  const contenedor = useRef<HTMLDivElement>(null);
  const lista = useRef<HTMLUListElement>(null);
  const desplazarAlActivo = useRef(false);
  const [abierto, setAbierto] = useState(false);
  const [consulta, setConsulta] = useState('');
  const [activo, setActivo] = useState(0);
  const [posicion, setPosicion] = useState<PosicionLista | null>(null);

  const seleccionada = opciones.find((o) => o.value === value);

  const filtradas = useMemo(() => {
    const palabras = normalizar(consulta.trim()).split(/\s+/).filter(Boolean);
    if (palabras.length === 0) return opciones;
    return opciones.filter((o) => {
      const texto = normalizar(`${o.label} ${o.detalle ?? ''}`);
      return palabras.every((p) => texto.includes(p));
    });
  }, [opciones, consulta]);

  const visibles = filtradas.slice(0, MAX_VISIBLES);
  const items: OpcionBuscable[] = vacioLabel && !consulta.trim() ? [{ value: '', label: vacioLabel }, ...visibles] : visibles;

  useLayoutEffect(() => {
    if (!abierto || !contenedor.current) return;
    const campo = contenedor.current;
    const actualizar = () => {
      const nueva = calcularPosicion(campo);
      setPosicion((previa) => (mismaPosicion(previa, nueva) ? previa : nueva));
    };
    actualizar();
    window.addEventListener('resize', actualizar);
    // En captura: también se mueve cuando se desplaza el cuerpo de un drawer o un contenedor con scroll.
    window.addEventListener('scroll', actualizar, true);
    return () => {
      window.removeEventListener('resize', actualizar);
      window.removeEventListener('scroll', actualizar, true);
    };
  }, [abierto]);

  useEffect(() => {
    if (!abierto) return;
    function alPresionarFuera(e: MouseEvent) {
      const destino = e.target as Node;
      if (!contenedor.current?.contains(destino) && !lista.current?.contains(destino)) setAbierto(false);
    }
    document.addEventListener('mousedown', alPresionarFuera);
    return () => document.removeEventListener('mousedown', alPresionarFuera);
  }, [abierto]);

  useEffect(() => {
    if (!desplazarAlActivo.current) return;
    desplazarAlActivo.current = false;
    lista.current?.children[activo]?.scrollIntoView({ block: 'nearest' });
  }, [activo]);

  function abrir() {
    if (abierto || disabled) return;
    setConsulta('');
    // Si ya hay algo elegido, Enter lo conserva en vez de saltar a la primera opción.
    const alInicio = vacioLabel ? [{ value: '' }, ...opciones.slice(0, MAX_VISIBLES)] : opciones.slice(0, MAX_VISIBLES);
    setActivo(seleccionada ? alInicio.findIndex((o) => o.value === value) : 0);
    setAbierto(true);
  }

  function elegir(opcion: OpcionBuscable) {
    onChange(opcion.value);
    setAbierto(false);
    setConsulta('');
  }

  function alTeclear(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      if (!abierto) {
        abrir();
        return;
      }
      desplazarAlActivo.current = true;
      setActivo((i) => Math.min(i + 1, items.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      desplazarAlActivo.current = true;
      setActivo((i) => Math.max(i - 1, 0));
    } else if (e.key === 'Enter' && abierto) {
      e.preventDefault();
      if (items[activo]) elegir(items[activo]);
    } else if (e.key === 'Escape' || e.key === 'Tab') {
      setAbierto(false);
      setConsulta('');
    }
  }

  return (
    <FieldWrapper label={label} hideLabel={hideLabel} htmlFor={id} hint={hint} error={error}>
      <div ref={contenedor} className={`relative ${className}`}>
        <input
          id={id}
          type="text"
          role="combobox"
          aria-expanded={abierto}
          aria-controls={`${id}-lista`}
          aria-autocomplete="list"
          autoComplete="off"
          disabled={disabled}
          required={required}
          placeholder={abierto && seleccionada ? seleccionada.label : placeholder}
          value={abierto ? consulta : (seleccionada?.label ?? '')}
          onFocus={abrir}
          onClick={abrir}
          onChange={(e) => {
            setConsulta(e.target.value);
            setAbierto(true);
            setActivo(0);
          }}
          onKeyDown={alTeclear}
          className="block w-full rounded-lg border-0 bg-white py-2 pl-3 pr-9 text-sm text-ink ring-1 ring-inset ring-border placeholder:text-muted focus:ring-2 focus:ring-inset focus:ring-primary disabled:bg-soft disabled:text-muted"
        />
        <ChevronDownIcon className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />

        {abierto &&
          posicion &&
          createPortal(
            <ul
              ref={lista}
              id={`${id}-lista`}
              role="listbox"
              style={{ position: 'fixed', ...posicion }}
              className="z-50 overflow-y-auto rounded-lg border border-border bg-surface py-1 shadow-lg"
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
            </ul>,
            document.body
          )}
      </div>
    </FieldWrapper>
  );
}
