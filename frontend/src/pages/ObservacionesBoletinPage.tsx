import { useState } from 'react';
import { Alert, errorMessage } from '../components/ui/Alert';
import { Button } from '../components/ui/Button';
import { Card } from '../components/ui/Card';
import { Select, Textarea } from '../components/ui/Field';
import { PageHeader } from '../components/ui/PageHeader';
import { Spinner } from '../components/ui/Spinner';
import { useAnioDeTrabajo } from '../hooks/useAniosLectivos';
import { useGuardarObservacionesBoletin, useObservacionesBoletin } from '../hooks/useBoletin';
import { useMyTeacherLoad } from '../hooks/useTeacherAssignments';

const MAX_OBSERVACION = 500;

/**
 * M17: lo que el docente escribe de cada estudiante en su asignatura y que sale en el boletín del periodo. Es texto del informe: no
 * toca la nota ni la planilla. Se puede editar mientras el periodo admita notas (mismas ventanas de M05).
 */
export function ObservacionesBoletinPage() {
  const { anio } = useAnioDeTrabajo();
  const { data: carga = [], isLoading: cargandoCarga } = useMyTeacherLoad(anio?._id);
  const clases = carga.filter((a) => a.tipo_asignacion === 'CLASE');

  const [asignacionElegida, setAsignacionElegida] = useState('');
  const [periodoElegido, setPeriodoElegido] = useState<number | null>(null);
  const asignacion = clases.find((c) => c._id === asignacionElegida) ?? clases[0];
  const periodos = anio?.periodos ?? [];
  const periodo = periodos.find((p) => p.numero === periodoElegido) ?? periodos[0];

  const grupo = typeof asignacion?.group_id === 'object' ? asignacion.group_id : null;
  const asignatura = typeof asignacion?.subject_id === 'object' ? asignacion.subject_id : null;

  const consulta = useObservacionesBoletin({ teacherAssignmentId: asignacion?._id, periodoNumero: periodo?.numero });
  const guardar = useGuardarObservacionesBoletin();
  // Solo lo que el docente tocó: lo demás sigue como lo guardó el servidor.
  const [borradores, setBorradores] = useState<Record<string, string>>({});
  const [guardado, setGuardado] = useState(false);

  const cambiadas = (consulta.data ?? []).filter((o) => borradores[o.student_id] !== undefined && borradores[o.student_id] !== o.texto);

  function reiniciar() {
    setBorradores({});
    setGuardado(false);
    guardar.reset();
  }

  async function guardarCambios() {
    if (!asignacion || !periodo) return;
    setGuardado(false);
    await guardar.mutateAsync({
      teacherAssignmentId: asignacion._id,
      periodoNumero: periodo.numero,
      observaciones: cambiadas.map((o) => ({ student_id: o.student_id, texto: borradores[o.student_id] ?? '' })),
    });
    setBorradores({});
    setGuardado(true);
  }

  return (
    <div className="space-y-4">
      <PageHeader
        title="Observaciones del boletín"
        subtitle="Escribe un comentario por estudiante para tu asignatura. Aparece en su boletín del periodo, junto a la descripción del desempeño."
      />

      <Card>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Select
            label="Clase"
            value={asignacion?._id ?? ''}
            onChange={(e) => {
              setAsignacionElegida(e.target.value);
              reiniciar();
            }}
            disabled={cargandoCarga || clases.length === 0}
          >
            {clases.length === 0 && <option value="">Sin clases asignadas</option>}
            {clases.map((c) => {
              const g = typeof c.group_id === 'object' ? c.group_id : null;
              const s = typeof c.subject_id === 'object' ? c.subject_id : null;
              return (
                <option key={c._id} value={c._id}>
                  {s?.nombre ?? 'Asignatura'} · {g?.nomenclatura ?? ''}
                </option>
              );
            })}
          </Select>
          <Select
            label="Periodo"
            value={periodo?.numero ?? ''}
            onChange={(e) => {
              setPeriodoElegido(Number(e.target.value));
              reiniciar();
            }}
            disabled={periodos.length === 0}
          >
            {periodos.map((p) => (
              <option key={p.numero} value={p.numero}>
                {p.nombre || `Periodo ${p.numero}`}
              </option>
            ))}
          </Select>
        </div>
      </Card>

      {consulta.isFetching && <Spinner label="Cargando estudiantes..." />}
      {consulta.isError && <Alert tone="error">{errorMessage(consulta.error)}</Alert>}

      {consulta.data && (
        <Card>
          <p className="mb-4 text-sm text-muted">
            {asignatura?.nombre} · grupo {grupo?.nomenclatura} · {consulta.data.length} estudiante(s)
          </p>
          {consulta.data.length === 0 ? (
            <p className="text-sm text-muted">Este grupo no tiene estudiantes con matrícula activa.</p>
          ) : (
            <div className="space-y-4">
              {consulta.data.map((o) => {
                const texto = borradores[o.student_id] ?? o.texto;
                return (
                  <Textarea
                    key={o.student_id}
                    label={`${o.nombre_completo} · ${o.documento}`}
                    rows={2}
                    value={texto}
                    maxLength={MAX_OBSERVACION}
                    onChange={(e) => {
                      setGuardado(false);
                      setBorradores((b) => ({ ...b, [o.student_id]: e.target.value }));
                    }}
                    hint={`${texto.length}/${MAX_OBSERVACION}`}
                  />
                );
              })}
            </div>
          )}
        </Card>
      )}

      {guardar.isError && <Alert tone="error">{errorMessage(guardar.error)}</Alert>}
      {guardado && <Alert tone="success">Observaciones guardadas.</Alert>}
      {consulta.data && consulta.data.length > 0 && (
        <div className="flex justify-end">
          <Button type="button" disabled={cambiadas.length === 0} isLoading={guardar.isPending} onClick={() => void guardarCambios()}>
            Guardar{cambiadas.length > 0 ? ` (${cambiadas.length})` : ''}
          </Button>
        </div>
      )}
    </div>
  );
}
