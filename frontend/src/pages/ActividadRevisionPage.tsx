import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { ActividadDrawer } from '../components/actividades/ActividadDrawer';
import { AnalisisDeActividad } from '../components/actividades/AnalisisDeActividad';
import { ComentariosActividad } from '../components/actividades/ComentariosActividad';
import { ContenidoDeActividad } from '../components/actividades/ContenidoDeActividad';
import { EntregasRevision } from '../components/actividades/EntregasRevision';
import { Alert, errorMessage } from '../components/ui/Alert';
import { Chip, TipoActividadChip } from '../components/ui/Badge';
import { Button } from '../components/ui/Button';
import { Card, CardHeader } from '../components/ui/Card';
import { PageHeader } from '../components/ui/PageHeader';
import { Spinner } from '../components/ui/Spinner';
import { ArrowLeftIcon } from '../components/ui/icons';
import { useAuth } from '../context/AuthContext';
import { useActualizarActividad, useActividad, useEliminarActividad } from '../hooks/useActividades';
import { useAnioDeTrabajo } from '../hooks/useAniosLectivos';
import { usePlanDeAsignacion } from '../hooks/usePlanesAula';
import { formatoInstante } from '../lib/actividades';

/**
 * Revisión de una actividad: sus instrucciones y materiales, cómo va el grupo (estadísticas), las entregas con su nota y el plazo
 * personal por estudiante, y la conversación pública. El docente titular califica y edita; coordinación y administración consultan.
 */
export function ActividadRevisionPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();
  const { anio } = useAnioDeTrabajo();
  const detalle = useActividad(id);
  const actualizar = useActualizarActividad();
  const eliminar = useEliminarActividad();
  const [editando, setEditando] = useState(false);
  const [mensaje, setMensaje] = useState<string | null>(null);

  const actividad = detalle.data;
  const esDocente = user?.rol === 'DOCENTE';
  const plan = usePlanDeAsignacion(esDocente ? actividad?.teacher_assignment_id : undefined, actividad?.periodo_numero);
  const volver = esDocente ? `/docente/actividades?clase=${actividad?.teacher_assignment_id ?? ''}&periodo=${actividad?.periodo_numero ?? ''}` : '/admin/actividades';

  if (detalle.isLoading) {
    return (
      <div className="flex justify-center p-12">
        <Spinner label="Cargando actividad..." />
      </div>
    );
  }
  if (detalle.isError || !actividad) {
    return (
      <div className="space-y-4">
        <Alert tone="error">{detalle.isError ? errorMessage(detalle.error) : 'Actividad no encontrada.'}</Alert>
        <Link to={esDocente ? '/docente/actividades' : '/admin/actividades'} className="font-semibold text-primary underline">
          Volver
        </Link>
      </div>
    );
  }

  const asignatura = actividad.asignacion?.asignatura?.nombre ?? 'Clase';
  const grupo = actividad.asignacion?.grupo?.nomenclatura;
  const periodo = anio?.periodos.find((p) => p.numero === actividad.periodo_numero);
  const periodoCerrado = periodo?.estado === 'CERRADO' || anio?.estado === 'CERRADO';
  const hayEntregas = actividad.resumen.entregadas > 0 || actividad.resumen.calificadas > 0;

  async function cambiarCierre() {
    if (!actividad) return;
    setMensaje(null);
    try {
      await actualizar.mutateAsync({ id: actividad._id, cerrada: !actividad.cerrada });
    } catch (error) {
      setMensaje(errorMessage(error));
    }
  }

  async function eliminarActividad() {
    if (!actividad || !window.confirm(`¿Eliminar «${actividad.titulo}»? Esta acción no se puede deshacer.`)) return;
    setMensaje(null);
    try {
      await eliminar.mutateAsync(actividad._id);
      navigate(volver);
    } catch (error) {
      setMensaje(errorMessage(error));
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Button type="button" variant="outline" onClick={() => navigate(volver)} className="inline-flex items-center gap-2">
          <ArrowLeftIcon className="h-4 w-4" />
          Volver a las actividades
        </Button>
        <div className="flex flex-wrap items-center gap-2">
          <TipoActividadChip value={actividad.tipo} />
          {actividad.cerrada && <Chip tone="red">Cerrada</Chip>}
          {actividad.vencida && !actividad.cerrada && <Chip tone="orange">Vencida</Chip>}
          {!actividad.publicada && <Chip tone="neutral">Aún no publicada</Chip>}
        </div>
      </div>

      <PageHeader
        title={actividad.titulo}
        subtitle={[`${asignatura}${grupo ? ` · grupo ${grupo}` : ''}`, `Periodo ${actividad.periodo_numero}`, actividad.componente_nombre].join(' · ')}
        action={
          esDocente ? (
            <div className="flex flex-wrap gap-2">
              <Button type="button" variant="soft-edit" disabled={periodoCerrado} onClick={() => setEditando(true)}>
                Editar
              </Button>
              {actividad.requiere_entrega && (
                <Button type="button" variant="outline" isLoading={actualizar.isPending} disabled={periodoCerrado} onClick={() => void cambiarCierre()}>
                  {actividad.cerrada ? 'Reabrir entregas' : 'Cerrar entregas'}
                </Button>
              )}
              <Button type="button" variant="soft-danger" disabled={periodoCerrado || hayEntregas} onClick={() => void eliminarActividad()}>
                Eliminar
              </Button>
            </div>
          ) : undefined
        }
      />

      {mensaje && <Alert tone="error">{mensaje}</Alert>}
      {periodoCerrado && <Alert tone="info">El periodo está cerrado: la actividad solo se consulta.</Alert>}
      {actividad.cerrada && <Alert tone="warning">Las entregas están cerradas. Solo un estudiante con plazo personal puede entregar.</Alert>}
      {hayEntregas && esDocente && <p className="text-xs text-muted">Tiene entregas o notas, por eso no se puede eliminar.</p>}

      <div className="grid items-start gap-4 lg:grid-cols-2">
        <div className="space-y-4">
          <Card>
            <CardHeader title="La actividad" />
            <dl className="mb-4 grid grid-cols-2 gap-3 text-sm">
              <div>
                <dt className="text-xs text-muted">Se publica</dt>
                <dd className="text-ink">{formatoInstante(actividad.fecha_apertura)}</dd>
              </div>
              <div>
                <dt className="text-xs text-muted">Límite de entrega</dt>
                <dd className="font-semibold text-ink">{formatoInstante(actividad.fecha_entrega)}</dd>
              </div>
              <div>
                <dt className="text-xs text-muted">Entregas</dt>
                <dd className="text-ink">
                  {!actividad.requiere_entrega ? 'Actividad de aula' : actividad.permite_multiples_entregas ? 'Varias (el docente elige la válida)' : 'Una sola'}
                </dd>
              </div>
              <div>
                <dt className="text-xs text-muted">Entrega tardía</dt>
                <dd className="text-ink">{actividad.requiere_entrega ? (actividad.permite_entrega_tardia ? 'Permitida' : 'No permitida') : '—'}</dd>
              </div>
              {actividad.publicada_tambien_en.length > 0 && (
                <div className="col-span-2">
                  <dt className="text-xs text-muted">También publicada en</dt>
                  <dd className="text-ink">{actividad.publicada_tambien_en.map((g) => g.grupo).join(', ')}</dd>
                </div>
              )}
            </dl>
            <ContenidoDeActividad actividad={actividad} />
          </Card>

          <Card>
            <CardHeader title="Análisis" subtitle="Cómo va el grupo en esta actividad." />
            <AnalisisDeActividad actividadId={actividad._id} requiereEntrega={actividad.requiere_entrega} />
          </Card>

          <Card>
            <CardHeader title="Comentarios" subtitle="Dudas y aclaraciones; lo ve todo el grupo." />
            <ComentariosActividad actividadId={actividad._id} />
          </Card>
        </div>

        <Card>
          <CardHeader
            title={actividad.requiere_entrega ? 'Entregas y notas' : 'Notas'}
            subtitle={esDocente ? undefined : 'Consulta: solo el docente titular califica.'}
          />
          <EntregasRevision actividad={actividad} escala={anio?.escala_evaluacion ?? null} puedeGestionar={esDocente && !periodoCerrado} />
        </Card>
      </div>

      {esDocente && (
        <ActividadDrawer
          open={editando}
          onClose={() => setEditando(false)}
          teacherAssignmentId={actividad.teacher_assignment_id}
          periodoNumero={actividad.periodo_numero}
          planAula={plan.data?.aprobado ? (plan.data.plan ?? null) : null}
          actividad={actividad}
        />
      )}
    </div>
  );
}
