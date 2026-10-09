import { useState } from 'react';
import { Link } from 'react-router-dom';
import { ExcelNotas } from '../components/notas/ExcelNotas';
import { PlanillaNotas } from '../components/notas/PlanillaNotas';
import { ReabrirPlanillaDrawer } from '../components/notas/ReabrirPlanillaDrawer';
import { Alert, errorMessage } from '../components/ui/Alert';
import { EstadoNotaBadge, EstadoPeriodoBadge } from '../components/ui/Badge';
import { Button } from '../components/ui/Button';
import { Card } from '../components/ui/Card';
import { Select } from '../components/ui/Field';
import { PageHeader } from '../components/ui/PageHeader';
import { Spinner } from '../components/ui/Spinner';
import { useAnioDeTrabajo } from '../hooks/useAniosLectivos';
import { type EstadoNota, useCerrarPlanilla, useGuardarCeldas, usePlanilla, useReabrirPlanilla } from '../hooks/useNotas';
import { useMyTeacherLoad } from '../hooks/useTeacherAssignments';
import { hoyColombia } from '../lib/actividades';
import { aInputFecha } from '../lib/fechas';
import { ApiError } from '../types/api';

const ORDEN_ESTADOS: EstadoNota[] = ['PENDIENTE', 'BORRADOR', 'CERRADO', 'DEFINITIVO'];

interface Pendiente {
  estudiante: string;
  faltan: string[];
}

/** El cierre rechazado por notas pendientes trae en `details` quién y qué le falta. */
function pendientesDe(error: unknown): Pendiente[] {
  const detalles = error instanceof ApiError ? error.details : null;
  return Array.isArray(detalles) ? (detalles as Pendiente[]) : [];
}

/**
 * M12: la planilla de notas del docente. Digita las notas de sus actividades y de los componentes de nota directa, ve en vivo
 * los promedios y la nota de la asignatura, y al terminar CIERRA la planilla: desde ahí es lo que lee el boletín.
 */
export function NotasPlanillaPage() {
  const { anio } = useAnioDeTrabajo();
  const { data: carga = [], isLoading: cargandoCarga } = useMyTeacherLoad(anio?._id);
  const clases = carga.filter((a) => a.tipo_asignacion === 'CLASE');

  const [asignacionElegida, setAsignacionElegida] = useState('');
  const [periodoElegido, setPeriodoElegido] = useState<number | null>(null);
  const [reabriendo, setReabriendo] = useState(false);

  const asignacion = clases.find((c) => c._id === asignacionElegida) ?? clases[0];
  const periodos = anio?.periodos ?? [];
  const hoy = hoyColombia();
  const periodoVigente = periodos.find((p) => aInputFecha(p.fecha_inicio) <= hoy && hoy <= aInputFecha(p.fecha_fin)) ?? periodos[0];
  const periodo = periodos.find((p) => p.numero === periodoElegido) ?? periodoVigente;

  const consulta = usePlanilla({ teacherAssignmentId: asignacion?._id, periodoNumero: periodo?.numero });
  const planilla = consulta.data;
  const guardar = useGuardarCeldas();
  const cerrar = useCerrarPlanilla();
  const reabrir = useReabrirPlanilla();

  const grupo = typeof asignacion?.group_id === 'object' ? asignacion.group_id : null;
  const asignatura = typeof asignacion?.subject_id === 'object' ? asignacion.subject_id : null;
  const pendientes = pendientesDe(cerrar.error);

  async function confirmarCierre() {
    if (!asignacion || !periodo) return;
    if (!window.confirm('¿Cerrar la planilla? Las notas quedan fijas y pasan al boletín. Para corregir algo tendrás que reabrirla indicando el motivo.')) return;
    cerrar.reset();
    try {
      await cerrar.mutateAsync({ teacherAssignmentId: asignacion._id, periodoNumero: periodo.numero });
    } catch {
      // el detalle lo muestra `cerrar.error`
    }
  }

  return (
    <div className="space-y-4">
      <PageHeader
        title="Planilla de notas"
        subtitle="Digita las notas de tus actividades, revisa los promedios y cierra la planilla del periodo."
        action={
          planilla && (
            <div className="flex flex-wrap gap-2">
              {planilla.edicion.puede_reabrir && (
                <Button type="button" variant="outline" onClick={() => setReabriendo(true)}>
                  Reabrir planilla
                </Button>
              )}
              <Button type="button" disabled={!planilla.edicion.puede_cerrar} isLoading={cerrar.isPending} onClick={() => void confirmarCierre()}>
                Cerrar planilla
              </Button>
            </div>
          )
        }
      />

      <Card>
        <div className="flex flex-wrap items-end gap-4 p-4">
          <div className="min-w-[260px]">
            <Select label="Clase" value={asignacion?._id ?? ''} onChange={(e) => setAsignacionElegida(e.target.value)} disabled={cargandoCarga}>
              {clases.map((c) => {
                const g = typeof c.group_id === 'object' ? c.group_id : null;
                const s = typeof c.subject_id === 'object' ? c.subject_id : null;
                return (
                  <option key={c._id} value={c._id}>
                    {s?.nombre ?? 'Clase'} · Grupo {g?.nomenclatura ?? '—'}
                  </option>
                );
              })}
            </Select>
          </div>
          <div className="min-w-[180px]">
            <Select label="Periodo" value={periodo?.numero ?? ''} onChange={(e) => setPeriodoElegido(Number(e.target.value))} disabled={periodos.length === 0}>
              {periodos.map((p) => (
                <option key={p.numero} value={p.numero}>
                  {p.nombre || `Periodo ${p.numero}`}
                </option>
              ))}
            </Select>
          </div>
          <div className="flex flex-wrap items-center gap-2 pb-1">
            {periodo?.estado && <EstadoPeriodoBadge value={periodo.estado} />}
            {planilla &&
              ORDEN_ESTADOS.filter((e) => planilla.resumen[e] > 0).map((e) => (
                <span key={e} className="inline-flex items-center gap-1 text-xs text-muted">
                  <EstadoNotaBadge value={e} /> {planilla.resumen[e]}
                </span>
              ))}
          </div>
        </div>
      </Card>

      {!cargandoCarga && clases.length === 0 && (
        <Alert tone="info">No tienes clases asignadas en el año lectivo vigente. Coordinación las asigna en Carga académica.</Alert>
      )}
      {consulta.isError && <Alert tone="error">{errorMessage(consulta.error)}</Alert>}
      {consulta.isLoading && (
        <div className="flex justify-center p-8">
          <Spinner />
        </div>
      )}

      {planilla && asignacion && periodo && (
        <>
          {!planilla.edicion.puede_editar && planilla.edicion.motivo && <Alert tone="info">{planilla.edicion.motivo}</Alert>}
          {planilla.componentes.every((c) => c.origen === 'ACTIVIDADES' && c.actividades.length === 0) && (
            <Alert tone="info">
              Esta clase aún no tiene actividades en el periodo. Prográmalas en{' '}
              <Link to="/docente/actividades" className="font-semibold underline">
                Actividades y tareas
              </Link>
              : cada una aparece aquí como una columna.
            </Alert>
          )}
          {cerrar.isError && (
            <Alert tone="error">
              <p>{errorMessage(cerrar.error)}</p>
              {pendientes.length > 0 && (
                <ul className="mt-2 list-disc space-y-0.5 pl-5">
                  {pendientes.slice(0, 12).map((p) => (
                    <li key={p.estudiante}>
                      {p.estudiante}: falta {p.faltan.join(', ')}
                    </li>
                  ))}
                  {pendientes.length > 12 && <li>… y {pendientes.length - 12} más.</li>}
                </ul>
              )}
            </Alert>
          )}
          {cerrar.isSuccess && <Alert tone="success">Planilla cerrada. Las notas ya son la fuente del boletín; coordinación las declarará definitivas.</Alert>}

          <PlanillaNotas
            key={`${asignacion._id}-${periodo.numero}`}
            planilla={planilla}
            guardando={guardar.isPending}
            onGuardar={(celdas) => guardar.mutateAsync({ teacherAssignmentId: asignacion._id, periodoNumero: periodo.numero, celdas })}
          />

          <ExcelNotas
            teacherAssignmentId={asignacion._id}
            periodoNumero={periodo.numero}
            nombreArchivo={`notas-${asignatura?.nombre ?? 'clase'}-${grupo?.nomenclatura ?? ''}-periodo-${periodo.numero}.xlsx`}
            puedeSubir={planilla.edicion.puede_editar}
            puedeDescargar
          />

          <ReabrirPlanillaDrawer
            open={reabriendo}
            subtitulo={`${asignatura?.nombre ?? 'Clase'} · Grupo ${grupo?.nomenclatura ?? '—'} · ${periodo.nombre || `Periodo ${periodo.numero}`}`}
            onClose={() => setReabriendo(false)}
            onConfirmar={(motivo) => reabrir.mutateAsync({ teacherAssignmentId: asignacion._id, periodoNumero: periodo.numero, motivo })}
          />
        </>
      )}
    </div>
  );
}
