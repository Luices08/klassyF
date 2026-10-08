import { useState } from 'react';
import {
  useActualizarVariableHorario,
  useCrearVariableHorario,
  useEliminarVariableHorario,
  type ContextoHorario,
} from '../../hooks/useHorarios';
import type { Grade } from '../../types/domain';
import type { CatalogoHorario, CeldaDisponibilidad, EstructuraSemana, VariableHorario } from '../../types/horarios';
import { Alert, errorMessage } from '../ui/Alert';
import { Button } from '../ui/Button';
import { Card, CardHeader } from '../ui/Card';
import { Select } from '../ui/Field';
import { MallaDisponibilidad } from '../ui/MallaDisponibilidad';
import { MultiSelect } from '../ui/MultiSelect';

interface PanelTiempoLibreProps {
  contexto: ContextoHorario;
  estructura: EstructuraSemana;
  grados: Grade[];
  catalogo: CatalogoHorario;
  variables: VariableHorario[];
}

type Para = 'DOCENTE' | 'GRADOS';

const mismoConjunto = (a: string[], b: string[]) => a.length === b.length && a.every((x) => b.includes(x));

/** La variable DISPONIBILIDAD que corresponde exactamente a la selección (un docente, o un conjunto de grados). */
function buscarExistente(variables: VariableHorario[], para: Para, docenteId: string, gradeIds: string[]) {
  return variables.find((v) => {
    if (v.tipo !== 'DISPONIBILIDAD' || v.asignatura_ids.length > 0 || v.es_excepcion) return false;
    if (para === 'DOCENTE') return v.alcance.tipo === 'GLOBAL' && v.docente_ids.length === 1 && v.docente_ids[0] === docenteId;
    return v.docente_ids.length === 0 && v.alcance.tipo === 'GRADOS' && mismoConjunto(v.alcance.grade_ids, gradeIds);
  });
}

/**
 * Tiempo libre de un docente (ej. no disponible lunes a última hora) o de unos grados (ej. 6° y 7° salen antes los
 * viernes). Se guarda como una variable DISPONIBILIDAD obligatoria; dejar la malla vacía la elimina.
 */
export function PanelTiempoLibre({ contexto, estructura, grados, catalogo, variables }: PanelTiempoLibreProps) {
  const [para, setPara] = useState<Para>('DOCENTE');
  const [docenteId, setDocenteId] = useState(catalogo.docentes[0]?._id ?? '');
  const [gradeIds, setGradeIds] = useState<string[]>([]);

  if (estructura.periodos.length === 0) {
    return <Alert tone="warning">Define primero las franjas de clase de la jornada en Sedes y jornadas.</Alert>;
  }

  const seleccion = para === 'DOCENTE' ? docenteId : [...gradeIds].sort().join(',');
  const existente = seleccion ? buscarExistente(variables, para, docenteId, gradeIds) : undefined;
  const nombreDocente = new Map(catalogo.docentes.map((d) => [d._id, d.nombre]));
  const nombreGrado = new Map(grados.map((g) => [g._id, g.nombre]));
  const registradas = variables.filter((v) => v.tipo === 'DISPONIBILIDAD');

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader title="Tiempo libre" subtitle="Marca las franjas en que un docente o unos grados no pueden tener clase." />
        <div className="mb-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Select label="Para" value={para} onChange={(e) => setPara(e.target.value as Para)}>
            <option value="DOCENTE">Un docente</option>
            <option value="GRADOS">Uno o varios grados</option>
          </Select>
          {para === 'DOCENTE' ? (
            <Select label="Docente" value={docenteId} onChange={(e) => setDocenteId(e.target.value)}>
              {catalogo.docentes.length === 0 && <option value="">Sin docentes con carga</option>}
              {catalogo.docentes.map((d) => (
                <option key={d._id} value={d._id}>
                  {d.nombre}
                </option>
              ))}
            </Select>
          ) : (
            <MultiSelect label="Grados" options={grados.map((g) => ({ value: g._id, label: g.nombre }))} selected={gradeIds} onChange={setGradeIds} emptyLabel="Elige los grados" />
          )}
        </div>
        {seleccion ? (
          <EditorMalla
            key={`${para}:${seleccion}:${existente?._id ?? 'nueva'}`}
            contexto={contexto}
            estructura={estructura}
            para={para}
            docenteId={docenteId}
            gradeIds={gradeIds}
            existente={existente}
          />
        ) : (
          <p className="text-sm text-muted">Elige a quién aplica para ver su malla.</p>
        )}
      </Card>

      {registradas.length > 0 && (
        <Card>
          <CardHeader title="Registrado" subtitle="Tiempo libre ya guardado en esta jornada." />
          <ul className="divide-y divide-border text-sm">
            {registradas.map((v) => (
              <li key={v._id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                <span className="font-medium text-ink">
                  {v.docente_ids.length > 0
                    ? v.docente_ids.map((d) => nombreDocente.get(d) ?? 'Docente').join(', ')
                    : v.alcance.tipo === 'GRADOS'
                      ? v.alcance.grade_ids.map((g) => nombreGrado.get(g) ?? 'Grado').join(', ')
                      : 'Todos los grados'}
                </span>
                <span className="text-muted">{(v.parametros.celdas as CeldaDisponibilidad[]).length} franja(s) marcada(s)</span>
              </li>
            ))}
          </ul>
        </Card>
      )}
    </div>
  );
}

function EditorMalla({
  contexto,
  estructura,
  para,
  docenteId,
  gradeIds,
  existente,
}: {
  contexto: ContextoHorario;
  estructura: EstructuraSemana;
  para: Para;
  docenteId: string;
  gradeIds: string[];
  existente: VariableHorario | undefined;
}) {
  const [celdas, setCeldas] = useState<CeldaDisponibilidad[]>((existente?.parametros.celdas as CeldaDisponibilidad[]) ?? []);
  const [guardado, setGuardado] = useState(false);
  const crear = useCrearVariableHorario();
  const actualizar = useActualizarVariableHorario();
  const eliminar = useEliminarVariableHorario();
  const error = crear.error ?? actualizar.error ?? eliminar.error;
  const pendiente = crear.isPending || actualizar.isPending || eliminar.isPending;

  async function guardar() {
    setGuardado(false);
    if (existente && celdas.length === 0) await eliminar.mutateAsync(existente._id);
    else if (existente) await actualizar.mutateAsync({ id: existente._id, tipo: 'DISPONIBILIDAD', parametros: { celdas } });
    else if (celdas.length > 0) {
      await crear.mutateAsync({
        ...contexto,
        tipo: 'DISPONIBILIDAD',
        descripcion: '',
        severidad: 'DURA',
        peso: 5,
        alcance: para === 'GRADOS' ? { tipo: 'GRADOS', grade_ids: gradeIds } : { tipo: 'GLOBAL', grade_ids: [] },
        asignatura_ids: [],
        docente_ids: para === 'DOCENTE' ? [docenteId] : [],
        es_excepcion: false,
        parametros: { celdas },
      });
    }
    setGuardado(true);
  }

  return (
    <div className="space-y-3">
      {error && <Alert tone="error">{errorMessage(error)}</Alert>}
      {guardado && <Alert tone="success">Tiempo libre guardado.</Alert>}
      <MallaDisponibilidad
        estructura={estructura}
        celdas={celdas}
        onChange={(c) => {
          setCeldas(c);
          setGuardado(false);
        }}
      />
      <div className="flex justify-end">
        <Button onClick={guardar} isLoading={pendiente} disabled={pendiente || (!existente && celdas.length === 0)}>
          Guardar tiempo libre
        </Button>
      </div>
    </div>
  );
}
