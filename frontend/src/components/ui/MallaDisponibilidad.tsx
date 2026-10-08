import { NOMBRES_DIA_SEMANA } from '../../types/domain';
import type { CeldaDisponibilidad, EstructuraSemana, ValorDisponibilidad } from '../../types/horarios';
import { CheckIcon, XIcon } from './icons';

interface MallaDisponibilidadProps {
  estructura: EstructuraSemana;
  /** Solo las celdas marcadas; lo demás se entiende disponible. */
  celdas: CeldaDisponibilidad[];
  onChange?: (celdas: CeldaDisponibilidad[]) => void;
}

type Estado = ValorDisponibilidad | 'DISPONIBLE';
const SIGUIENTE: Record<Estado, Estado> = { DISPONIBLE: 'NO_DISPONIBLE', NO_DISPONIBLE: 'CONDICIONAL', CONDICIONAL: 'DISPONIBLE' };
const NOMBRE: Record<Estado, string> = { DISPONIBLE: 'Disponible', NO_DISPONIBLE: 'No disponible', CONDICIONAL: 'Condicional' };

function Marca({ estado }: { estado: Estado }) {
  if (estado === 'NO_DISPONIBLE') return <XIcon className="h-4 w-4 text-danger" />;
  if (estado === 'CONDICIONAL') return <span className="text-sm font-bold text-warning">?</span>;
  return <CheckIcon className="h-4 w-4 text-success" />;
}

/**
 * Malla de tiempo libre (M09): días hábiles × periodos de clase de una jornada. Cada clic alterna disponible → no
 * disponible → condicional. El encabezado de un día alterna la columna completa. Sin `onChange` es de solo lectura.
 */
export function MallaDisponibilidad({ estructura, celdas, onChange }: MallaDisponibilidadProps) {
  const valor = new Map(celdas.map((c) => [`${c.dia}-${c.periodo}`, c.valor]));
  const estadoDe = (dia: number, periodo: number): Estado => valor.get(`${dia}-${periodo}`) ?? 'DISPONIBLE';
  const editable = Boolean(onChange);

  function aplicar(cambios: Array<{ dia: number; periodo: number; estado: Estado }>) {
    const nuevo = new Map(valor);
    for (const { dia, periodo, estado } of cambios) {
      if (estado === 'DISPONIBLE') nuevo.delete(`${dia}-${periodo}`);
      else nuevo.set(`${dia}-${periodo}`, estado);
    }
    onChange?.(
      [...nuevo].map(([clave, v]) => {
        const [dia, periodo] = clave.split('-').map(Number);
        return { dia: dia ?? 0, periodo: periodo ?? 0, valor: v };
      })
    );
  }

  function alternarDia(dia: number) {
    const siguiente = SIGUIENTE[estadoDe(dia, 0)];
    aplicar(estructura.periodos.map((_, periodo) => ({ dia, periodo, estado: siguiente })));
  }

  return (
    <div className="space-y-3">
      <div className="overflow-x-auto rounded-xl border border-border bg-surface">
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr className="bg-primary-soft">
              <th className="px-3 py-2 text-left text-label text-body">Periodo</th>
              {estructura.dias.map((d) => (
                <th key={d} className="px-2 py-2 text-center text-label text-body">
                  {editable ? (
                    <button type="button" onClick={() => alternarDia(d)} className="rounded px-1 hover:text-primary focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary" title="Alternar todo el día">
                      {NOMBRES_DIA_SEMANA[d]}
                    </button>
                  ) : (
                    NOMBRES_DIA_SEMANA[d]
                  )}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {estructura.periodos.map((p, periodo) => (
              <tr key={periodo} className={p.descanso_antes ? 'border-t-4 border-soft' : 'border-t border-border'}>
                <td className="whitespace-nowrap px-3 py-1.5">
                  <span className="font-medium text-ink">{p.nombre}</span>
                  <span className="ml-2 font-mono text-xs text-muted">{p.hora_inicio}</span>
                </td>
                {estructura.dias.map((d) => {
                  const estado = estadoDe(d, periodo);
                  const fondo = estado === 'NO_DISPONIBLE' ? 'bg-danger-soft' : estado === 'CONDICIONAL' ? 'bg-warning-soft' : '';
                  return (
                    <td key={d} className={`p-1 text-center ${fondo}`}>
                      <button
                        type="button"
                        disabled={!editable}
                        aria-label={`${NOMBRES_DIA_SEMANA[d]}, ${p.nombre}: ${NOMBRE[estado]}`}
                        onClick={() => aplicar([{ dia: d, periodo, estado: SIGUIENTE[estado] }])}
                        className="inline-flex h-8 w-full items-center justify-center rounded-md enabled:hover:ring-1 enabled:hover:ring-border focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary disabled:cursor-default"
                      >
                        <Marca estado={estado} />
                      </button>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="flex flex-wrap items-center gap-4 text-xs text-muted">
        <span className="inline-flex items-center gap-1"><Marca estado="DISPONIBLE" /> Disponible</span>
        <span className="inline-flex items-center gap-1"><Marca estado="CONDICIONAL" /> Condicional: se evita si se puede</span>
        <span className="inline-flex items-center gap-1"><Marca estado="NO_DISPONIBLE" /> No disponible</span>
        {editable && <span>Clic en una celda para cambiarla; en el nombre del día, para todo el día.</span>}
      </p>
    </div>
  );
}
