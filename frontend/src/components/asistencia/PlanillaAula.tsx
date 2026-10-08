import { useState, type KeyboardEvent } from 'react';
import { Alert, errorMessage } from '../ui/Alert';
import { Chip, EstadoAsistenciaChip, EstadoJustificacionBadge } from '../ui/Badge';
import { Button } from '../ui/Button';
import { Card } from '../ui/Card';
import { Input } from '../ui/Field';
import { EmptyRow, Table, TableBody, TableHead, Td, Th } from '../ui/Table';
import { useAnioDeTrabajo } from '../../hooks/useAniosLectivos';
import { useGuardarPlanilla } from '../../hooks/useAsistencia';
import { formatoFechaCalendario } from '../../lib/fechas';
import type { EstadoAsistencia, FilaPlanilla, PlanillaAsistencia } from '../../types/domain';
import { JustificacionDrawer, type InasistenciaInicial } from './JustificacionDrawer';

interface Edicion {
  state_id?: string;
  novedad?: string;
}

/**
 * Planilla rápida: una fila por estudiante de la lista oficial (M04), un botón por estado y la novedad en línea.
 * Con la fila enfocada, la letra del estado la marca y baja a la siguiente (como llenar una hoja de Excel).
 */
export function PlanillaAula({ planilla }: { planilla: PlanillaAsistencia }) {
  const guardar = useGuardarPlanilla();
  const [ediciones, setEdiciones] = useState<Record<string, Edicion>>({});
  const [guardada, setGuardada] = useState(false);
  const [justificando, setJustificando] = useState<InasistenciaInicial | null>(null);
  const { anio } = useAnioDeTrabajo();

  const activos = planilla.estados.filter((e) => e.estado === 'activo');
  const predeterminado = activos.find((e) => e.es_predeterminado);
  const estadoPorId = new Map(planilla.estados.map((e) => [e._id, e]));
  const bloqueada = planilla.bloqueo !== null;

  const estadoDe = (studentId: string, guardado: string | null): string | undefined =>
    ediciones[studentId]?.state_id ?? guardado ?? predeterminado?._id;
  const novedadDe = (studentId: string, guardado: string): string => ediciones[studentId]?.novedad ?? guardado;

  const editar = (studentId: string, cambio: Edicion) => {
    setGuardada(false);
    setEdiciones((prev) => ({ ...prev, [studentId]: { ...prev[studentId], ...cambio } }));
  };

  const marcarTodos = (estado: EstadoAsistencia) => {
    setGuardada(false);
    setEdiciones((prev) => {
      const siguiente = { ...prev };
      planilla.estudiantes.forEach((e) => {
        siguiente[e.student_id] = { ...siguiente[e.student_id], state_id: estado._id };
      });
      return siguiente;
    });
  };

  const alTeclear = (e: KeyboardEvent<HTMLTableRowElement>, studentId: string) => {
    if (bloqueada || e.target !== e.currentTarget) return;
    const fila = e.currentTarget;
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      const destino = e.key === 'ArrowDown' ? fila.nextElementSibling : fila.previousElementSibling;
      (destino as HTMLElement | null)?.focus();
      return;
    }
    const estado = activos.find((a) => a.abreviatura.toLowerCase() === e.key.toLowerCase());
    if (!estado) return;
    e.preventDefault();
    editar(studentId, { state_id: estado._id });
    (fila.nextElementSibling as HTMLElement | null)?.focus();
  };

  const resumen = activos.map((estado) => ({
    estado,
    total: planilla.estudiantes.filter((e) => estadoDe(e.student_id, e.state_id) === estado._id).length,
  }));

  const hayCambios = Object.keys(ediciones).length > 0;

  // Solo una falla ya guardada se puede justificar: la excusa se ancla al registro de la planilla.
  const justificable = (fila: FilaPlanilla): boolean =>
    Boolean(
      planilla.attendance_id &&
        fila.registro_id &&
        !fila.justificacion &&
        !ediciones[fila.student_id]?.state_id &&
        fila.state_id &&
        estadoPorId.get(fila.state_id)?.cuenta_como_falla
    );

  async function handleGuardar() {
    guardar.reset();
    try {
      await guardar.mutateAsync({
        group_id: planilla.grupo._id,
        subject_id: planilla.asignatura._id,
        fecha: planilla.fecha,
        registros: planilla.estudiantes.map((e) => ({
          student_id: e.student_id,
          state_id: estadoDe(e.student_id, e.state_id) as string,
          novedad: novedadDe(e.student_id, e.novedad),
        })),
      });
    } catch {
      return; // el mensaje lo muestra la mutación y las ediciones se conservan para reintentar
    }
    setEdiciones({});
    setGuardada(true);
  }

  return (
    <div className="space-y-4">
      {bloqueada && <Alert tone="warning">{planilla.bloqueo}</Alert>}
      {!predeterminado && (
        <Alert tone="error">
          La institución no tiene un estado de asistencia predeterminado activo; pide al administrador que lo configure.
        </Alert>
      )}
      {guardar.isError && <Alert tone="error">{errorMessage(guardar.error)}</Alert>}
      {guardada && <Alert tone="success">Asistencia guardada.</Alert>}

      <Card>
        <div className="flex flex-wrap items-center justify-between gap-3 p-4">
          <div className="flex flex-wrap items-center gap-2">
            {resumen.map(({ estado, total }) => (
              <span key={estado._id} className="inline-flex items-center gap-1.5">
                <EstadoAsistenciaChip nombre={estado.nombre} tono={estado.tono} />
                <span className="text-sm font-semibold text-ink">{total}</span>
              </span>
            ))}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {predeterminado && (
              <Button type="button" variant="secondary" disabled={bloqueada} onClick={() => marcarTodos(predeterminado)}>
                Marcar todos: {predeterminado.nombre}
              </Button>
            )}
            <Button
              type="button"
              isLoading={guardar.isPending}
              disabled={bloqueada || !predeterminado || (planilla.planilla_guardada && !hayCambios)}
              onClick={() => void handleGuardar()}
            >
              Guardar asistencia
            </Button>
          </div>
        </div>
      </Card>

      <Table>
        <TableHead>
          <Th className="w-10">#</Th>
          <Th>Estudiante</Th>
          <Th>Estado</Th>
          <Th>Novedad</Th>
          <Th>Justificación</Th>
        </TableHead>
        <TableBody>
          {planilla.estudiantes.length === 0 ? (
            <EmptyRow colSpan={5}>Este grupo no tiene estudiantes con matrícula activa.</EmptyRow>
          ) : (
            planilla.estudiantes.map((fila, indice) => {
              const actual = estadoDe(fila.student_id, fila.state_id);
              const opciones = activos.some((a) => a._id === actual)
                ? activos
                : [...activos, ...(actual && estadoPorId.get(actual) ? [estadoPorId.get(actual) as EstadoAsistencia] : [])];
              return (
                <tr
                  key={fila.student_id}
                  tabIndex={0}
                  onKeyDown={(e) => alTeclear(e, fila.student_id)}
                  className="outline-none hover:bg-soft/40 focus:bg-primary-soft/50"
                >
                  <Td className="text-muted">{indice + 1}</Td>
                  <Td>
                    <p className="font-medium text-ink">
                      {fila.apellido} {fila.nombre}
                    </p>
                    <p className="text-xs text-muted">{fila.numero_documento}</p>
                  </Td>
                  <Td>
                    <div className="flex flex-wrap gap-1.5" role="group" aria-label={`Estado de ${fila.nombre} ${fila.apellido}`}>
                      {opciones.map((estado) => {
                        const seleccionado = estado._id === actual;
                        return (
                          <button
                            key={estado._id}
                            type="button"
                            title={estado.nombre}
                            aria-pressed={seleccionado}
                            disabled={bloqueada}
                            onClick={() => editar(fila.student_id, { state_id: estado._id })}
                            className="rounded-full disabled:cursor-not-allowed disabled:opacity-60"
                          >
                            <Chip tone={seleccionado ? estado.tono : 'neutral'}>{estado.abreviatura}</Chip>
                          </button>
                        );
                      })}
                    </div>
                  </Td>
                  <Td className="min-w-64">
                    <Input
                      label={`Novedad de ${fila.nombre} ${fila.apellido}`}
                      hideLabel
                      value={novedadDe(fila.student_id, fila.novedad)}
                      maxLength={500}
                      disabled={bloqueada}
                      placeholder="Novedad (opcional)"
                      onChange={(e) => editar(fila.student_id, { novedad: e.target.value })}
                    />
                  </Td>
                  <Td>
                    {fila.justificacion ? (
                      <EstadoJustificacionBadge value={fila.justificacion} />
                    ) : justificable(fila) ? (
                      <Button
                        type="button"
                        variant="soft-edit"
                        onClick={() =>
                          setJustificando({
                            attendance_id: planilla.attendance_id as string,
                            registro_id: fila.registro_id as string,
                            student_id: fila.student_id,
                            descripcion: `${fila.apellido} ${fila.nombre} · ${formatoFechaCalendario(planilla.fecha)} · ${planilla.asignatura.nombre}`,
                          })
                        }
                      >
                        Justificar
                      </Button>
                    ) : (
                      <span className="text-muted">—</span>
                    )}
                  </Td>
                </tr>
              );
            })
          )}
        </TableBody>
      </Table>

      <p className="text-xs text-muted">
        Atajos: con una fila enfocada, escribe la letra del estado (
        {activos.map((e) => `${e.abreviatura} = ${e.nombre}`).join(', ')}) para marcarla y pasar a la siguiente; usa ↑ ↓ para moverte.
      </p>
      {justificando && anio && (
        <JustificacionDrawer academicYearId={anio._id} inicial={justificando} onClose={() => setJustificando(null)} />
      )}
    </div>
  );
}
