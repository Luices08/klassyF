import { useState } from 'react';
import { Link } from 'react-router-dom';
import { ActividadDrawer } from '../components/actividades/ActividadDrawer';
import { EntregasDrawer } from '../components/actividades/EntregasDrawer';
import { Alert, errorMessage } from '../components/ui/Alert';
import { EstadoDesarrolloCurricularBadge, EstadoPeriodoBadge, TipoActividadChip } from '../components/ui/Badge';
import { Button } from '../components/ui/Button';
import { Card } from '../components/ui/Card';
import { Select } from '../components/ui/Field';
import { IconButton } from '../components/ui/IconButton';
import { PageHeader } from '../components/ui/PageHeader';
import { Spinner } from '../components/ui/Spinner';
import { EmptyRow, Table, TableBody, TableHead, Td, Th } from '../components/ui/Table';
import { EyeIcon, PencilIcon, PlusIcon, TrashIcon } from '../components/ui/icons';
import { type ActividadConResumen, useActividades, useEliminarActividad } from '../hooks/useActividades';
import { useAnioDeTrabajo } from '../hooks/useAniosLectivos';
import { useCurricularDevelopment } from '../hooks/useCurricularDevelopments';
import { useMyTeacherLoad } from '../hooks/useTeacherAssignments';
import { formatoInstante, hoyColombia } from '../lib/actividades';
import { aInputFecha } from '../lib/fechas';

/**
 * CU-DOC-02: el docente programa tareas, evaluaciones, trabajos y proyectos de SUS clases (Carga académica, M08), con la
 * planeación curricular APROBADA del periodo (M07) como requisito y el calendario (M05) como guarda contra choques.
 */
export function ActividadesDocentePage() {
  const { anio } = useAnioDeTrabajo();
  const { data: carga = [], isLoading: cargandoCarga } = useMyTeacherLoad(anio?._id);
  const clases = carga.filter((a) => a.tipo_asignacion === 'CLASE');

  const [asignacionElegida, setAsignacionElegida] = useState('');
  const [periodoElegido, setPeriodoElegido] = useState<number | null>(null);
  const [editando, setEditando] = useState<ActividadConResumen | 'nueva' | null>(null);
  const [revisando, setRevisando] = useState<ActividadConResumen | null>(null);
  const [mensaje, setMensaje] = useState<string | null>(null);

  const asignacion = clases.find((c) => c._id === asignacionElegida) ?? clases[0];
  const periodos = anio?.periodos ?? [];
  const hoy = hoyColombia();
  const periodoVigente = periodos.find((p) => aInputFecha(p.fecha_inicio) <= hoy && hoy <= aInputFecha(p.fecha_fin)) ?? periodos[0];
  const periodo = periodos.find((p) => p.numero === periodoElegido) ?? periodoVigente;

  const planeacion = useCurricularDevelopment(asignacion?._id, periodo?.numero);
  const lista = useActividades(
    { academic_year_id: anio?._id, teacher_assignment_id: asignacion?._id, periodo: periodo?.numero },
    Boolean(anio && asignacion && periodo)
  );
  const eliminar = useEliminarActividad();

  const planeacionAprobada = planeacion.data?.estado === 'APROBADO';
  const periodoCerrado = periodo?.estado === 'CERRADO';
  const puedeProgramar = planeacionAprobada && !periodoCerrado && anio?.estado !== 'CERRADO';

  const grupo = typeof asignacion?.group_id === 'object' ? asignacion.group_id : null;
  const asignatura = typeof asignacion?.subject_id === 'object' ? asignacion.subject_id : null;

  async function eliminarActividad(a: ActividadConResumen) {
    if (!window.confirm(`¿Eliminar «${a.titulo}»? Esta acción no se puede deshacer.`)) return;
    setMensaje(null);
    try {
      await eliminar.mutateAsync(a._id);
    } catch (error) {
      setMensaje(errorMessage(error));
    }
  }

  return (
    <div className="space-y-4">
      <PageHeader
        title="Actividades y tareas"
        subtitle="Programa lo que tus estudiantes deben hacer y revisa lo que entregan."
        action={
          <Button type="button" disabled={!puedeProgramar} onClick={() => setEditando('nueva')}>
            <PlusIcon className="h-4 w-4" />
            Nueva actividad
          </Button>
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
            <Select
              label="Periodo"
              value={periodo?.numero ?? ''}
              onChange={(e) => setPeriodoElegido(Number(e.target.value))}
              disabled={periodos.length === 0}
            >
              {periodos.map((p) => (
                <option key={p.numero} value={p.numero}>
                  {p.nombre || `Periodo ${p.numero}`}
                </option>
              ))}
            </Select>
          </div>
          <div className="flex items-center gap-2 pb-1">
            {periodo?.estado && <EstadoPeriodoBadge value={periodo.estado} />}
            {planeacion.data ? <EstadoDesarrolloCurricularBadge value={planeacion.data.estado} /> : null}
          </div>
        </div>
      </Card>

      {!cargandoCarga && clases.length === 0 && (
        <Alert tone="info">No tienes clases asignadas en el año lectivo vigente. Coordinación las asigna en Carga académica.</Alert>
      )}

      {asignacion && periodo && !planeacion.isLoading && !planeacionAprobada && (
        <Alert tone="warning">
          <p>
            {planeacion.data
              ? 'Tu planeación curricular de este periodo todavía no está aprobada por coordinación.'
              : 'Aún no has formulado la planeación curricular de este periodo.'}{' '}
            Para programar actividades necesitas tenerla <strong>aprobada</strong>: cada actividad mide un DBA o una competencia de esa planeación.
          </p>
          <Link to="/docente/planeacion-curricular" className="mt-1 inline-block font-semibold underline">
            Ir a Planeación curricular
          </Link>
        </Alert>
      )}
      {periodoCerrado && <Alert tone="info">El periodo está cerrado: las actividades solo se consultan.</Alert>}
      {mensaje && <Alert tone="error">{mensaje}</Alert>}
      {lista.isError && <Alert tone="error">{errorMessage(lista.error)}</Alert>}

      {lista.isLoading ? (
        <div className="flex justify-center p-8">
          <Spinner />
        </div>
      ) : (
        asignacion && (
          <Table>
            <TableHead>
              <Th>Actividad</Th>
              <Th>Publicación y límite</Th>
              <Th>Entregas</Th>
              <Th className="text-right">Acciones</Th>
            </TableHead>
            <TableBody>
              {(lista.data ?? []).length === 0 && (
                <EmptyRow colSpan={4}>
                  Aún no programas actividades para {asignatura?.nombre ?? 'esta clase'}
                  {grupo ? ` · grupo ${grupo.nomenclatura}` : ''} en este periodo.
                </EmptyRow>
              )}
              {(lista.data ?? []).map((a) => (
                <tr key={a._id}>
                  <Td>
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-semibold text-ink">{a.titulo}</span>
                      <TipoActividadChip value={a.tipo} />
                    </div>
                    <p className="mt-0.5 text-xs text-muted">
                      {a.dba ? `DBA ${a.dba.numero_dba}` : ''}
                      {a.dba && a.competencia_evaluada ? ' · ' : ''}
                      {a.competencia_evaluada ?? ''}
                    </p>
                  </Td>
                  <Td>
                    <p className="text-xs text-muted">Se publica {formatoInstante(a.fecha_apertura)}</p>
                    <p className="font-medium text-ink">{formatoInstante(a.fecha_entrega)}</p>
                  </Td>
                  <Td>
                    {a.requiere_entrega ? (
                      <p>
                        {a.resumen.entregadas}/{a.resumen.estudiantes} entregaron
                        {a.resumen.con_retraso > 0 ? ` (${a.resumen.con_retraso} con retraso)` : ''}
                      </p>
                    ) : (
                      <p className="text-muted">Actividad de aula</p>
                    )}
                    <p className="text-xs text-muted">
                      {a.resumen.calificadas}/{a.resumen.estudiantes} calificadas
                    </p>
                  </Td>
                  <Td className="text-right">
                    <div className="flex justify-end gap-2">
                      <IconButton tone="success" label="Revisar y calificar" icon={<EyeIcon />} onClick={() => setRevisando(a)} />
                      <IconButton tone="edit" label="Editar" icon={<PencilIcon />} disabled={periodoCerrado} onClick={() => setEditando(a)} />
                      <IconButton
                        tone="danger"
                        label={a.resumen.entregadas > 0 || a.resumen.calificadas > 0 ? 'Tiene entregas: no se puede eliminar' : 'Eliminar'}
                        icon={<TrashIcon />}
                        disabled={periodoCerrado || a.resumen.entregadas > 0 || a.resumen.calificadas > 0}
                        onClick={() => void eliminarActividad(a)}
                      />
                    </div>
                  </Td>
                </tr>
              ))}
            </TableBody>
          </Table>
        )
      )}

      {asignacion && periodo && planeacion.data && (
        <ActividadDrawer
          open={editando !== null}
          onClose={() => setEditando(null)}
          teacherAssignmentId={asignacion._id}
          periodoNumero={periodo.numero}
          planeacion={planeacion.data}
          componentes={(anio?.componentes_efectivos ?? []).filter((c) => c.origen === 'ACTIVIDADES')}
          actividad={editando === 'nueva' ? null : editando}
        />
      )}
      <EntregasDrawer actividad={revisando} onClose={() => setRevisando(null)} escala={anio?.escala_evaluacion ?? null} />
    </div>
  );
}
