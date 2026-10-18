import { useMemo, useState } from 'react';
import { Input } from '../../ui/Field';
import type { VariableCertificado } from '../../../hooks/useCertificados';

const sinTildes = (t: string) => t.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

/** Los datos del sistema que se pueden colocar en el texto, con buscador y agrupados por el módulo de donde salen. Plegado hasta que se necesita. */
export function DatosDelSistema({ variables, onInsertar }: { variables: VariableCertificado[]; onInsertar: (clave: string) => void }) {
  const [busqueda, setBusqueda] = useState('');
  const grupos = useMemo(() => {
    const q = sinTildes(busqueda.trim());
    const visibles = q ? variables.filter((v) => sinTildes(`${v.etiqueta} ${v.origen}`).includes(q)) : variables;
    const porOrigen = new Map<string, VariableCertificado[]>();
    for (const v of visibles) porOrigen.set(v.origen, [...(porOrigen.get(v.origen) ?? []), v]);
    return [...porOrigen.entries()];
  }, [variables, busqueda]);

  return (
    <details className="group rounded-lg border border-border bg-surface">
      <summary className="cursor-pointer list-none px-4 py-3 text-sm font-semibold text-ink">
        Datos del sistema que puedes colocar <span className="font-normal text-muted">({variables.length}) · también con «Insertar dato» o «/» dentro de un párrafo</span>
      </summary>
      <div className="space-y-3 border-t border-border p-4">
        <Input label="Buscar un dato" value={busqueda} onChange={(e) => setBusqueda(e.target.value)} placeholder="Ej. grado, folio, acudiente…" />
        <div className="max-h-64 space-y-2 overflow-y-auto">
          {grupos.map(([origen, lista]) => (
            <div key={origen}>
              <p className="mb-1 text-xs font-semibold text-muted">{origen}</p>
              <div className="flex flex-wrap gap-1.5">
                {lista.map((v) => (
                  <button
                    key={v.clave}
                    type="button"
                    title={`Ejemplo: ${v.ejemplo}`}
                    // El botón no roba el cursor del párrafo.
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => onInsertar(v.clave)}
                    className="rounded-full bg-primary-soft px-3 py-1 text-xs font-medium text-primary hover:bg-primary hover:text-white"
                  >
                    {v.etiqueta}
                  </button>
                ))}
              </div>
            </div>
          ))}
          {grupos.length === 0 && <p className="text-sm text-muted">Ningún dato coincide con la búsqueda.</p>}
        </div>
        <p className="text-xs text-muted">Un clic coloca el dato en el párrafo donde estabas escribiendo.</p>
      </div>
    </details>
  );
}
