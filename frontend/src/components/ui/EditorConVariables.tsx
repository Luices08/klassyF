import { type ClipboardEvent, type KeyboardEvent, forwardRef, useCallback, useEffect, useImperativeHandle, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { aSegmentos, limpiarPegado } from '../../lib/segmentosPlantilla';
import { Button } from './Button';
import { PlusIcon } from './icons';

export interface VariableDeEditor {
  clave: string;
  etiqueta: string;
  /** Módulo de donde sale el dato (se muestra al elegir y al pasar el cursor por la ficha). */
  origen: string;
  ejemplo: string;
}

export interface EditorConVariablesHandle {
  insertarVariable: (clave: string) => void;
  focus: () => void;
}

interface EditorConVariablesProps {
  /** Nombre accesible del párrafo. */
  label: string;
  /** El texto guardado: variables escritas como `{{modulo.dato}}`. El editor las muestra como fichas y emite el mismo formato. */
  value: string;
  onChange: (valor: string) => void;
  variables: VariableDeEditor[];
  disabled?: boolean;
  placeholder?: string;
  /** Avisa cuando el párrafo recibe el foco (para saber en cuál insertar un dato elegido desde otro lugar). */
  onFocus?: () => void;
  maxLength?: number;
}

const CLASES_FICHA = 'mx-0.5 inline-block select-none rounded-full bg-primary-soft px-2 py-0.5 text-xs font-semibold text-primary';
const CLASES_FICHA_DESCONOCIDA = 'mx-0.5 inline-block select-none rounded-full bg-danger-soft px-2 py-0.5 text-xs font-semibold text-danger';

// El editor construye su contenido con nodos del DOM y `textContent`, nunca con HTML: un texto pegado o guardado no puede inyectar marcado.

function crearFicha(clave: string, variables: Map<string, VariableDeEditor>): HTMLSpanElement {
  const def = variables.get(clave);
  const ficha = document.createElement('span');
  ficha.contentEditable = 'false';
  ficha.dataset.variable = clave;
  ficha.className = def ? CLASES_FICHA : CLASES_FICHA_DESCONOCIDA;
  ficha.textContent = def ? def.etiqueta : `${clave} (no existe)`;
  ficha.title = def ? `${def.origen} · ejemplo: ${def.ejemplo}` : 'Este dato no existe en el catálogo: quítalo antes de publicar.';
  return ficha;
}

function nodosDe(texto: string, variables: Map<string, VariableDeEditor>): Node[] {
  return aSegmentos(texto).map((s) => (s.tipo === 'texto' ? document.createTextNode(s.texto) : crearFicha(s.clave, variables)));
}

/** Lo que el editor contiene, en el formato guardado: el texto tal cual y cada ficha como `{{clave}}`. */
function leerTexto(nodo: Node): string {
  let salida = '';
  nodo.childNodes.forEach((hijo) => {
    if (hijo.nodeType === Node.TEXT_NODE) salida += (hijo.nodeValue ?? '').replace(/ /g, ' ');
    else if (hijo instanceof HTMLElement) {
      if (hijo.dataset.variable) salida += `{{${hijo.dataset.variable}}}`;
      else if (hijo.tagName !== 'BR') salida += leerTexto(hijo);
    }
  });
  return salida;
}

/**
 * Un párrafo de texto con los datos del sistema como fichas («Nombre oficial del colegio», «Grado»…) en lugar de `{{llaves}}`. Se inserta un
 * dato con el botón «Insertar dato», escribiendo «/» o desde la lista de datos de la pantalla; una ficha se borra de una vez. El texto que
 * entrega es el mismo que se guardaba antes, así que no cambia nada en el servidor ni en las versiones ya publicadas. Es de una sola línea:
 * Enter no agrega saltos y lo pegado se limpia.
 */
export const EditorConVariables = forwardRef<EditorConVariablesHandle, EditorConVariablesProps>(function EditorConVariables(
  { label, value, onChange, variables, disabled, placeholder, onFocus, maxLength = 1500 },
  refExterno
) {
  const raiz = useRef<HTMLDivElement>(null);
  const contenedor = useRef<HTMLDivElement>(null);
  const seleccion = useRef<Range | null>(null);
  const [abierto, setAbierto] = useState(false);
  const [busqueda, setBusqueda] = useState('');

  const mapa = useMemo(() => new Map(variables.map((v) => [v.clave, v])), [variables]);
  const mapaActual = useRef(mapa);
  // La lista de datos puede ser un arreglo nuevo en cada render: solo importa si cambió su contenido.
  const huellaVariables = useMemo(() => variables.map((v) => v.clave).join('|'), [variables]);

  // Los manejadores de eventos leen siempre el catálogo vigente (se actualiza antes de reconstruir el contenido).
  useLayoutEffect(() => {
    mapaActual.current = mapa;
  }, [mapa]);

  // El contenido del DOM lo maneja el editor al escribir; React solo lo reconstruye cuando el texto cambió desde afuera (descartar, restablecer).
  useLayoutEffect(() => {
    const el = raiz.current;
    if (!el || leerTexto(el) === value) return;
    el.replaceChildren(...nodosDe(value, mapaActual.current));
  }, [value, huellaVariables]);

  const emitir = useCallback(() => {
    if (raiz.current) onChange(leerTexto(raiz.current));
  }, [onChange]);

  const guardarSeleccion = useCallback(() => {
    const sel = window.getSelection();
    const el = raiz.current;
    if (sel && sel.rangeCount > 0 && el && el.contains(sel.anchorNode)) seleccion.current = sel.getRangeAt(0).cloneRange();
  }, []);

  /** Pone nodos donde estaba el cursor (o al final) y deja el cursor justo después. */
  const colocar = useCallback(
    (nodos: Node[]) => {
      const el = raiz.current;
      const sel = window.getSelection();
      if (!el || !sel || disabled || nodos.length === 0) return;
      el.focus();
      let rango = seleccion.current;
      if (!rango || !el.contains(rango.commonAncestorContainer)) {
        rango = document.createRange();
        rango.selectNodeContents(el);
        rango.collapse(false);
      }
      rango.deleteContents();
      const fragmento = document.createDocumentFragment();
      nodos.forEach((n) => fragmento.appendChild(n));
      const ultimo = fragmento.lastChild as Node;
      rango.insertNode(fragmento);
      // Insertar en el borde de un texto deja un texto vacío pegado a la ficha: se quita para que el cursor y el espacio final queden donde corresponde.
      for (const vecino of [ultimo.nextSibling, fragmento.firstChild, nodos[0]?.previousSibling ?? null]) {
        if (vecino && vecino.nodeType === Node.TEXT_NODE && !vecino.nodeValue) vecino.parentNode?.removeChild(vecino);
      }
      // Una ficha al final no deja dónde seguir escribiendo: se agrega un espacio después de ella.
      if (ultimo instanceof HTMLElement && !ultimo.nextSibling) el.appendChild(document.createTextNode(' '));
      const siguiente = ultimo.nextSibling;
      if (siguiente && siguiente.nodeType === Node.TEXT_NODE) rango.setStart(siguiente, 0);
      else rango.setStartAfter(ultimo);
      rango.collapse(true);
      sel.removeAllRanges();
      sel.addRange(rango);
      seleccion.current = rango.cloneRange();
      emitir();
    },
    [disabled, emitir]
  );

  const insertarVariable = useCallback((clave: string) => colocar([crearFicha(clave, mapaActual.current)]), [colocar]);

  useImperativeHandle(refExterno, () => ({ insertarVariable, focus: () => raiz.current?.focus() }), [insertarVariable]);

  const cerrar = useCallback(() => {
    setAbierto(false);
    setBusqueda('');
  }, []);

  useEffect(() => {
    if (!abierto) return;
    const fuera = (e: MouseEvent) => {
      if (contenedor.current && !contenedor.current.contains(e.target as Node)) cerrar();
    };
    document.addEventListener('mousedown', fuera);
    return () => document.removeEventListener('mousedown', fuera);
  }, [abierto, cerrar]);

  const elegir = (clave: string) => {
    cerrar();
    insertarVariable(clave);
  };

  const alTeclear = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key === 'Enter') e.preventDefault();
    if (e.key === '/' && !disabled) {
      e.preventDefault();
      guardarSeleccion();
      setAbierto(true);
    }
  };

  const alPegar = (e: ClipboardEvent<HTMLDivElement>) => {
    e.preventDefault();
    colocar(nodosDe(limpiarPegado(e.clipboardData.getData('text/plain')), mapaActual.current));
  };

  const filtradas = variables.filter((v) => `${v.etiqueta} ${v.origen} ${v.clave}`.toLowerCase().includes(busqueda.trim().toLowerCase()));
  const origenes = [...new Set(filtradas.map((v) => v.origen))];
  const largo = value.length;

  return (
    <div ref={contenedor} className="relative space-y-1">
      <div className="flex items-center justify-between gap-2">
        <span className={`text-xs ${largo > maxLength ? 'text-danger' : 'text-muted'}`}>
          {largo}/{maxLength}
        </span>
        <Button
          type="button"
          variant="soft-edit"
          className="px-2.5 py-1 text-xs"
          disabled={disabled}
          // El botón no roba el cursor: se inserta donde estaba escribiendo.
          onMouseDown={(e) => {
            e.preventDefault();
            guardarSeleccion();
          }}
          onClick={() => setAbierto((a) => !a)}
        >
          <PlusIcon className="h-3.5 w-3.5" /> Insertar dato
        </Button>
      </div>
      <div
        ref={raiz}
        role="textbox"
        aria-multiline="false"
        aria-label={label}
        aria-disabled={disabled}
        contentEditable={!disabled}
        suppressContentEditableWarning
        spellCheck
        data-placeholder={placeholder ?? 'Escribe el texto y usa «Insertar dato» (o «/») para colocar un dato del sistema'}
        className={`block min-h-14 w-full whitespace-pre-wrap break-words rounded-lg px-3 py-2 text-sm leading-8 ring-1 ring-inset ring-border focus:outline-none focus:ring-2 focus:ring-primary empty:before:text-muted empty:before:content-[attr(data-placeholder)] ${disabled ? 'bg-soft text-muted' : 'bg-white text-ink'}`}
        onInput={emitir}
        onKeyDown={alTeclear}
        onKeyUp={guardarSeleccion}
        onMouseUp={guardarSeleccion}
        onBlur={guardarSeleccion}
        onFocus={onFocus}
        onPaste={alPegar}
        onDrop={(e) => e.preventDefault()}
      />
      {abierto && (
        <div className="absolute left-0 right-0 z-20 mt-1 rounded-lg border border-border bg-surface p-2 shadow-lg">
          <input
            autoFocus
            value={busqueda}
            onChange={(e) => setBusqueda(e.target.value)}
            placeholder="Buscar un dato…"
            aria-label="Buscar un dato del sistema"
            className="block w-full rounded-lg border-0 px-3 py-1.5 text-sm text-ink ring-1 ring-inset ring-border placeholder:text-muted focus:ring-2 focus:ring-inset focus:ring-primary"
            onKeyDown={(e) => {
              if (e.key === 'Escape') cerrar();
              if (e.key === 'Enter') {
                e.preventDefault();
                if (filtradas[0]) elegir(filtradas[0].clave);
              }
            }}
          />
          <div className="mt-2 max-h-60 space-y-2 overflow-y-auto">
            {origenes.map((origen) => (
              <div key={origen}>
                <p className="mb-1 text-xs font-semibold text-muted">{origen}</p>
                <div className="flex flex-wrap gap-1.5">
                  {filtradas
                    .filter((v) => v.origen === origen)
                    .map((v) => (
                      <button key={v.clave} type="button" title={`Ejemplo: ${v.ejemplo}`} onClick={() => elegir(v.clave)} className="rounded-full bg-primary-soft px-3 py-1 text-xs font-medium text-primary hover:bg-primary hover:text-white">
                        {v.etiqueta}
                      </button>
                    ))}
                </div>
              </div>
            ))}
            {filtradas.length === 0 && <p className="px-1 py-2 text-sm text-muted">Ningún dato coincide con «{busqueda}».</p>}
          </div>
        </div>
      )}
    </div>
  );
});
