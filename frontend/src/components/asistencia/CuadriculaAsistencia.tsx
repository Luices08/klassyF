import { useRef, useState, type KeyboardEvent } from 'react';
import { Alert, errorMessage } from '../ui/Alert';
import { Chip } from '../ui/Badge';
import { Button } from '../ui/Button';
import { Card } from '../ui/Card';
import { CheckIcon } from '../ui/icons';
import { Table, TableBody, TableHead, Td, Th } from '../ui/Table';
import { useGuardarCuadricula } from '../../hooks/useAsistencia';
import type { CuadriculaAsistencia as Cuadricula, EstadoAsistencia } from '../../types/domain';

const LETRA_DIA = ['D', 'L', 'M', 'X', 'J', 'V', 'S'];

const claveCelda = (studentId: string, fecha: string) => `${studentId}|${fecha}`;

interface CuadriculaProps {
  cuadricula: Cuadricula;
  /** Abre el registro diario de ese día (donde se escriben las novedades y se justifican fallas). */
  onAbrirDia?: (fecha: string) => void;
}

/**
 * La planilla de papel de siempre: estudiantes en filas y los días de clase del mes en columnas. Clic en una celda rota
 * el estado; con una celda enfocada, la letra del estado la marca y baja (como Excel) y las flechas se mueven. Se
 * guardan solo los días tocados, y en ellos los estudiantes sin marcar quedan en el estado predeterminado.
 */
export function CuadriculaAsistencia({ cuadricula, onAbrirDia }: CuadriculaProps) {
  const guardar = useGuardarCuadricula();
  const tabla = useRef<HTMLDivElement>(null);
  const [ediciones, setEdiciones] = useState<Record<string, string>>({});
  const [guardada, setGuardada] = useState(false);

  const activos = cuadricula.estados.filter((e) => e.estado === 'activo').sort((a, b) => a.orden - b.orden);
  const predeterminado = activos.find((e) => e.es_predeterminado);
  const estadoPorId = new Map(cuadricula.estados.map((e) => [e._id, e]));
  // El predeterminado va primero: un clic en una celda vacía marca la primera excepción (típicamente Ausencia).
  const ciclo = predeterminado ? [predeterminado, ...activos.filter((e) => e._id !== predeterminado._id)] : activos;

  const editable = (fecha: string) => cuadricula.editable && !cuadricula.dias.find((d) => d.fecha === fecha)?.bloqueo;
  const diaTocado = (fecha: string) =>
    Boolean(cuadricula.dias.find((d) => d.fecha === fecha)?.attendance_id) ||
    Object.keys(ediciones).some((clave) => clave.endsWith(`|${fecha}`));

  /** Lo que se ve en la celda: lo editado, lo guardado, o (en un día ya tocado) el predeterminado como valor implícito. */
  const efectivo = (studentId: string, fecha: string): { estado: EstadoAsistencia; implicito: boolean } | null => {
    const clave = claveCelda(studentId, fecha);
    const id = ediciones[clave] ?? cuadricula.celdas[studentId]?.[fecha]?.state_id;
    if (id) {
      const estado = estadoPorId.get(id);
      return estado ? { estado, implicito: false } : null;
    }
    return predeterminado && diaTocado(fecha) ? { estado: predeterminado, implicito: true } : null;
  };

  const marcar = (studentId: string, fecha: string, estadoId: string) => {
    setGuardada(false);
    setEdiciones((prev) => ({ ...prev, [claveCelda(studentId, fecha)]: estadoId }));
  };

  const rotar = (studentId: string, fecha: string) => {
    if (ciclo.length === 0) return;
    const actual = efectivo(studentId, fecha)?.estado;
    const indice = actual ? ciclo.findIndex((e) => e._id === actual._id) : 0;
    marcar(studentId, fecha, (ciclo[(indice + 1) % ciclo.length] as EstadoAsistencia)._id);
  };

  const marcarDiaPresente = (fecha: string) => {
    if (!predeterminado) return;
    setGuardada(false);
    setEdiciones((prev) => {
      const siguiente = { ...prev };
      for (const e of cuadricula.estudiantes) {
        const clave = claveCelda(e.student_id, fecha);
        if (!siguiente[clave] && !cuadricula.celdas[e.student_id]?.[fecha]) siguiente[clave] = predeterminado._id;
      }
      return siguiente;
    });
  };

  const mover = (origen: HTMLElement, df: number, dc: number) => {
    const fila = Number(origen.dataset.fila) + df;
    const col = Number(origen.dataset.col) + dc;
    tabla.current?.querySelector<HTMLButtonElement>(`[data-fila="${fila}"][data-col="${col}"]:not(:disabled)`)?.focus();
  };

  const alTeclear = (e: KeyboardEvent<HTMLButtonElement>, studentId: string, fecha: string) => {
    const movimientos: Record<string, [number, number]> = { ArrowDown: [1, 0], ArrowUp: [-1, 0], ArrowRight: [0, 1], ArrowLeft: [0, -1] };
    const movimiento = movimientos[e.key];
    if (movimiento) {
      e.preventDefault();
      mover(e.currentTarget, movimiento[0], movimiento[1]);
      return;
    }
    if (e.key === 'Backspace' || e.key === 'Delete') {
      e.preventDefault();
      setEdiciones((prev) => {
        const { [claveCelda(studentId, fecha)]: _quitada, ...resto } = prev;
        return resto;
      });
      return;
    }
    const estado = activos.find((a) => a.abreviatura.toLowerCase() === e.key.toLowerCase());
    if (!estado || e.ctrlKey || e.metaKey || e.altKey) return;
    e.preventDefault();
    marcar(studentId, fecha, estado._id);
    mover(e.currentTarget, 1, 0);
  };

  // Totales en vivo (con lo que se está editando), con la misma regla del servidor: una falla es justificada si su
  // estado ya lo es o tiene una excusa aprobada.
  const totales = (studentId: string) => {
    let fallas = 0;
    let justificadas = 0;
    let retardos = 0;
    for (const dia of cuadricula.dias) {
      const actual = efectivo(studentId, dia.fecha)?.estado;
      if (!actual) continue;
      if (actual.cuenta_como_falla) {
        fallas += 1;
        if (actual.es_justificada || cuadricula.celdas[studentId]?.[dia.fecha]?.justificacion === 'APROBADA') justificadas += 1;
      } else if (actual.es_retardo) {
        retardos += 1;
      }
    }
    return { fallas, justificadas, retardos };
  };

  const diasEditados = [...new Set(Object.keys(ediciones).map((clave) => clave.split('|')[1] as string))];

  async function handleGuardar() {
    if (!predeterminado) return;
    guardar.reset();
    try {
      await guardar.mutateAsync({
        group_id: cuadricula.grupo._id,
        subject_id: cuadricula.asignatura._id,
        dias: diasEditados.map((fecha) => ({
          fecha,
          registros: cuadricula.estudiantes.map((e) => ({
            student_id: e.student_id,
            state_id: ediciones[claveCelda(e.student_id, fecha)] ?? cuadricula.celdas[e.student_id]?.[fecha]?.state_id ?? predeterminado._id,
            novedad: cuadricula.celdas[e.student_id]?.[fecha]?.novedad ?? '',
          })),
        })),
      });
    } catch {
      return; // el mensaje lo muestra la mutación y las ediciones se conservan para reintentar
    }
    setEdiciones({});
    setGuardada(true);
  }

  if (cuadricula.dias.length === 0) {
    return <Alert tone="info">Este mes no tiene días de clase para la jornada del grupo (o queda fuera de los periodos del año lectivo).</Alert>;
  }

  return (
    <div className="space-y-4">
      {!cuadricula.editable && (
        <Alert tone="info">Solo consulta: esta clase la dicta {cuadricula.docente ?? 'otro docente'}. Puedes ver y descargar su planilla.</Alert>
      )}
      {!predeterminado && cuadricula.editable && (
        <Alert tone="error">La institución no tiene un estado de asistencia predeterminado activo; pide al administrador que lo configure.</Alert>
      )}
      {guardar.isError && <Alert tone="error">{errorMessage(guardar.error)}</Alert>}
      {guardada && <Alert tone="success">Cambios guardados.</Alert>}

      {cuadricula.editable && (
        <Card>
          <div className="flex flex-wrap items-center justify-between gap-3 p-4">
            <p className="max-w-2xl text-sm text-muted">
              Clic en una celda para cambiar su estado, o escribe la letra ({activos.map((e) => `${e.abreviatura} = ${e.nombre}`).join(', ')}) y usa
              las flechas para moverte. Al guardar un día, los estudiantes sin marcar quedan como {predeterminado?.nombre ?? 'predeterminado'}.
            </p>
            <div className="flex flex-wrap items-center gap-2">
              {diasEditados.length > 0 && (
                <Button type="button" variant="secondary" onClick={() => setEdiciones({})}>
                  Descartar cambios
                </Button>
              )}
              <Button type="button" isLoading={guardar.isPending} disabled={diasEditados.length === 0 || !predeterminado} onClick={() => void handleGuardar()}>
                Guardar cambios{diasEditados.length > 0 ? ` (${diasEditados.length} ${diasEditados.length === 1 ? 'día' : 'días'})` : ''}
              </Button>
            </div>
          </div>
        </Card>
      )}

      <div ref={tabla}>
        <Table>
          <TableHead>
            <Th className="sticky left-0 z-10 w-8 bg-primary-soft px-2!">#</Th>
            <Th className="sticky left-8 z-10 min-w-48 bg-primary-soft">Estudiante</Th>
            {cuadricula.dias.map((dia) => {
              const fecha = new Date(`${dia.fecha}T00:00:00Z`);
              return (
                <Th key={dia.fecha} className="px-0.5! text-center" title={dia.bloqueo ?? undefined}>
                  <div className="flex min-w-9 flex-col items-center gap-0.5">
                    <span className="font-normal text-muted">{LETRA_DIA[fecha.getUTCDay()]}</span>
                    <button
                      type="button"
                      className="rounded px-1 hover:bg-primary/10 disabled:cursor-default disabled:hover:bg-transparent"
                      title={onAbrirDia ? 'Abrir el registro de este día (novedades y justificaciones)' : undefined}
                      disabled={!onAbrirDia}
                      onClick={() => onAbrirDia?.(dia.fecha)}
                    >
                      {fecha.getUTCDate()}
                    </button>
                    {editable(dia.fecha) && (
                      <button
                        type="button"
                        aria-label={`Marcar a todos como ${predeterminado?.nombre ?? 'presente'} el ${dia.fecha}`}
                        title={`Marcar a todos como ${predeterminado?.nombre ?? 'presente'}`}
                        className="rounded-full p-0.5 text-success hover:bg-success-soft"
                        onClick={() => marcarDiaPresente(dia.fecha)}
                      >
                        <CheckIcon className="h-3 w-3" />
                      </button>
                    )}
                  </div>
                </Th>
              );
            })}
            <Th className="px-1! text-center" title="Fallas">F</Th>
            <Th className="px-1! text-center" title="Fallas justificadas">J</Th>
            <Th className="px-1! text-center" title="Retardos">R</Th>
          </TableHead>
          <TableBody>
            {cuadricula.estudiantes.map((estudiante, fila) => {
              const total = totales(estudiante.student_id);
              return (
                <tr key={estudiante.student_id} className="hover:bg-soft/40">
                  <Td className="sticky left-0 z-10 bg-surface px-2! text-muted">{fila + 1}</Td>
                  <Td className="sticky left-8 z-10 bg-surface">
                    <p className="whitespace-nowrap font-medium text-ink">
                      {estudiante.apellido} {estudiante.nombre}
                    </p>
                  </Td>
                  {cuadricula.dias.map((dia, col) => {
                    const actual = efectivo(estudiante.student_id, dia.fecha);
                    const puedeEditar = editable(dia.fecha);
                    const editada = claveCelda(estudiante.student_id, dia.fecha) in ediciones;
                    return (
                      <Td key={dia.fecha} className={`px-0.5! py-1! text-center ${dia.bloqueo && !actual ? 'bg-soft' : ''}`}>
                        <button
                          type="button"
                          data-fila={fila}
                          data-col={col}
                          disabled={!puedeEditar}
                          title={dia.bloqueo ?? actual?.estado.nombre}
                          aria-label={`${estudiante.apellido} ${estudiante.nombre}, ${dia.fecha}: ${actual?.estado.nombre ?? 'sin registrar'}`}
                          onClick={() => rotar(estudiante.student_id, dia.fecha)}
                          onKeyDown={(e) => alTeclear(e, estudiante.student_id, dia.fecha)}
                          className={`mx-auto flex h-7 min-w-8 items-center justify-center rounded-full disabled:cursor-default ${
                            editada ? 'ring-2 ring-primary' : ''
                          } ${actual?.implicito ? 'opacity-50' : ''}`}
                        >
                          {actual ? <Chip tone={actual.estado.tono}>{actual.estado.abreviatura}</Chip> : <span className="text-muted">·</span>}
                        </button>
                      </Td>
                    );
                  })}
                  <Td className="px-1! text-center font-semibold text-ink">{total.fallas}</Td>
                  <Td className="px-1! text-center text-body">{total.justificadas}</Td>
                  <Td className="px-1! text-center text-body">{total.retardos}</Td>
                </tr>
              );
            })}
          </TableBody>
        </Table>
      </div>

      <p className="text-xs text-muted">
        F = fallas · J = fallas justificadas (estado ya justificado o excusa aprobada) · R = retardos. Los días sin recesos ni vacaciones salen del calendario
        del año lectivo y de la jornada del grupo.
      </p>
    </div>
  );
}
