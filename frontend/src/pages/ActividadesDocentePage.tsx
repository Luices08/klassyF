import { useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { ActividadDrawer } from '../components/actividades/ActividadDrawer';
import { CatalogoAsignaturasDocente } from '../components/actividades/CatalogoAsignaturasDocente';
import { EntregasDrawer } from '../components/actividades/EntregasDrawer';
import { Alert, errorMessage } from '../components/ui/Alert';
import { EstadoPeriodoBadge, EstadoPlanBadge, TipoActividadChip } from '../components/ui/Badge';
import { Button } from '../components/ui/Button';
import { Card } from '../components/ui/Card';
import { Select } from '../components/ui/Field';
import { IconButton } from '../components/ui/IconButton';
import { PageHeader } from '../components/ui/PageHeader';
import { Spinner } from '../components/ui/Spinner';
import { EmptyRow, Table, TableBody, TableHead, Td, Th } from '../components/ui/Table';
import { ArrowLeftIcon, EyeIcon, PencilIcon, PlusIcon, TrashIcon } from '../components/ui/icons';
import { type ActividadConResumen, useActividades, useEliminarActividad } from '../hooks/useActividades';
import { useAnioDeTrabajo } from '../hooks/useAniosLectivos';
import { usePlanDeAsignacion } from '../hooks/usePlanesAula';
import { useMyTeacherLoad } from '../hooks/useTeacherAssignments';
import { formatoInstante, hoyColombia } from '../lib/actividades';
import { aInputFecha } from '../lib/fechas';

/**
 * CU-DOC-02: Gestión de actividades y tareas para el docente.
 * Flujo en dos vistas para máxima claridad y agilidad de UX:
 * - Vista 1: Filtros de Sede, Jornada y Periodo con Catálogo de Asignaturas y sus cursos visibles de inmediato en cuadritos ordenados por grado.
 * - Vista 2: Gestión de actividades de la clase seleccionada (tabla, creación, edición y revisión de entregas).
 */
export function ActividadesDocentePage() {
  const { anio } = useAnioDeTrabajo();
  const { data: carga = [], isLoading: cargandoCarga } = useMyTeacherLoad(anio?._id);
  const clases = useMemo(() => carga.filter((a) => a.tipo_asignacion === 'CLASE'), [carga]);

  const [searchParams, setSearchParams] = useSearchParams();
  const claseParam = searchParams.get('clase') ?? '';
  const periodoParam = searchParams.get('periodo') ? Number(searchParams.get('periodo')) : null;

  // Sedes disponibles en la carga del docente
  const sedesDisponibles = useMemo(() => {
    const mapa = new Map<string, string>();
    for (const c of clases) {
      const g = typeof c.group_id === 'object' && c.group_id ? c.group_id : null;
      if (g && typeof g.sede_id === 'object' && g.sede_id) {
        mapa.set(g.sede_id._id, g.sede_id.nombre);
      }
    }
    return Array.from(mapa.entries()).map(([_id, nombre]) => ({ _id, nombre }));
  }, [clases]);

  const [sedeElegida, setSedeElegida] = useState('');
  useEffect(() => {
    if (sedesDisponibles.length > 0 && (!sedeElegida || !sedesDisponibles.some((s) => s._id === sedeElegida))) {
      setSedeElegida(sedesDisponibles[0]._id);
    }
  }, [sedesDisponibles, sedeElegida]);

  // Jornadas disponibles para la sede elegida
  const jornadasDisponibles = useMemo(() => {
    const mapa = new Map<string, string>();
    for (const c of clases) {
      const g = typeof c.group_id === 'object' && c.group_id ? c.group_id : null;
      if (!g) continue;
      const sId = typeof g.sede_id === 'object' && g.sede_id ? g.sede_id._id : String(g.sede_id || '');
      if (!sedeElegida || sId === sedeElegida) {
        if (typeof g.jornada_id === 'object' && g.jornada_id) {
          mapa.set(g.jornada_id._id, g.jornada_id.nombre);
        }
      }
    }
    return Array.from(mapa.entries()).map(([_id, nombre]) => ({ _id, nombre }));
  }, [clases, sedeElegida]);

  const [jornadaElegida, setJornadaElegida] = useState('');
  useEffect(() => {
    if (jornadasDisponibles.length > 0 && (!jornadaElegida || !jornadasDisponibles.some((j) => j._id === jornadaElegida))) {
      setJornadaElegida(jornadasDisponibles[0]._id);
    }
  }, [jornadasDisponibles, jornadaElegida]);

  // Periodos lectivos
  const periodos = anio?.periodos ?? [];
  const hoy = hoyColombia();
  const periodoVigente = periodos.find((p) => aInputFecha(p.fecha_inicio) <= hoy && hoy <= aInputFecha(p.fecha_fin)) ?? periodos[0];
  const [periodoLocal, setPeriodoLocal] = useState<number | null>(null);

  const periodoNumero = periodoParam ?? periodoLocal ?? periodoVigente?.numero ?? null;
  const periodo = periodos.find((p) => p.numero === periodoNumero) ?? periodoVigente;

  // Clase seleccionada (si existe, estamos en Vista 2; si no, en Vista 1)
  const asignacion = useMemo(() => {
    if (!claseParam) return null;
    return clases.find((c) => c._id === claseParam) ?? null;
  }, [clases, claseParam]);

  // Si la asignación se deselecciona o no existe, estamos en Vista 1
  const enVistaDetalle = Boolean(asignacion);

  // Al seleccionar un curso desde Vista 1
  function seleccionarClase(id: string) {
    const nuevosParams = new URLSearchParams(searchParams);
    nuevosParams.set('clase', id);
    if (periodo?.numero) {
      nuevosParams.set('periodo', String(periodo.numero));
    }
    setSearchParams(nuevosParams);
  }

  // Al volver de Vista 2 a Vista 1
  function volverACatalogo() {
    const nuevosParams = new URLSearchParams(searchParams);
    nuevosParams.delete('clase');
    setSearchParams(nuevosParams);
  }

  // Al cambiar periodo
  function cambiarPeriodo(num: number) {
    setPeriodoLocal(num);
    const nuevosParams = new URLSearchParams(searchParams);
    nuevosParams.set('periodo', String(num));
    setSearchParams(nuevosParams);
  }

  // Datos para Vista 2
  const plan = usePlanDeAsignacion(asignacion?._id, periodo?.numero);
  const lista = useActividades(
    { academic_year_id: anio?._id, teacher_assignment_id: asignacion?._id, periodo: periodo?.numero },
    Boolean(anio && asignacion && periodo)
  );
  const eliminar = useEliminarActividad();

  const [editando, setEditando] = useState<ActividadConResumen | 'nueva' | null>(null);
  const [revisando, setRevisando] = useState<ActividadConResumen | null>(null);
  const [mensaje, setMensaje] = useState<string | null>(null);

  const planAulaAprobado = plan.data?.aprobado === true;
  const periodoCerrado = periodo?.estado === 'CERRADO';
  const puedeProgramar = planAulaAprobado && !periodoCerrado && anio?.estado !== 'CERRADO';

  const grupo = typeof asignacion?.group_id === 'object' && asignacion?.group_id ? asignacion.group_id : null;
  const asignatura = typeof asignacion?.subject_id === 'object' && asignacion?.subject_id ? asignacion.subject_id : null;
  const sedeNombre = grupo && typeof grupo.sede_id === 'object' && grupo.sede_id ? grupo.sede_id.nombre : '';
  const jornadaNombre = grupo && typeof grupo.jornada_id === 'object' && grupo.jornada_id ? grupo.jornada_id.nombre : '';

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
      {/* VISTA 1: Catálogo de Asignaturas y Cursos */}
      {!enVistaDetalle && (
        <>
          <PageHeader
            title="Actividades y tareas"
            subtitle="Programa lo que tus estudiantes deben hacer y revisa lo que entregan."
          />

          {/* Filtros: Sede, Jornada y Periodo */}
          <Card>
            <div className="flex flex-wrap items-end gap-4 p-4">
              <div className="min-w-[200px] flex-1">
                <Select
                  label="Sede"
                  value={sedeElegida}
                  onChange={(e) => setSedeElegida(e.target.value)}
                  disabled={cargandoCarga || sedesDisponibles.length <= 1}
                >
                  {sedesDisponibles.map((s) => (
                    <option key={s._id} value={s._id}>
                      {s.nombre}
                    </option>
                  ))}
                </Select>
              </div>

              <div className="min-w-[180px] flex-1">
                <Select
                  label="Jornada"
                  value={jornadaElegida}
                  onChange={(e) => setJornadaElegida(e.target.value)}
                  disabled={cargandoCarga || jornadasDisponibles.length <= 1}
                >
                  {jornadasDisponibles.map((j) => (
                    <option key={j._id} value={j._id}>
                      {j.nombre}
                    </option>
                  ))}
                </Select>
              </div>

              <div className="min-w-[160px] flex-1">
                <Select
                  label="Periodo"
                  value={periodo?.numero ?? ''}
                  onChange={(e) => cambiarPeriodo(Number(e.target.value))}
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
              </div>
            </div>
          </Card>

          {cargandoCarga ? (
            <div className="flex justify-center p-12">
              <Spinner label="Cargando tus clases y asignaturas..." />
            </div>
          ) : clases.length === 0 ? (
            <Alert tone="info">No tienes clases asignadas en el año lectivo vigente. Coordinación las asigna en Carga académica.</Alert>
          ) : (
            <CatalogoAsignaturasDocente
              clases={clases}
              sedeId={sedeElegida}
              jornadaId={jornadaElegida}
              onSeleccionarClase={seleccionarClase}
            />
          )}
        </>
      )}

      {/* VISTA 2: Gestión de Actividades del Curso Seleccionado */}
      {enVistaDetalle && asignacion && (
        <>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <Button type="button" variant="outline" onClick={volverACatalogo} className="inline-flex items-center gap-2">
              <ArrowLeftIcon className="h-4 w-4" />
              Volver a mis asignaturas
            </Button>

            <div className="flex items-center gap-2">
              {periodo?.estado && <EstadoPeriodoBadge value={periodo.estado} />}
              {plan.data ? <EstadoPlanBadge value={plan.data.estado} /> : null}
            </div>
          </div>

          <PageHeader
            title={`${asignatura?.nombre ?? 'Clase'} · Grupo ${grupo?.nomenclatura ?? '—'}`}
            subtitle={[sedeNombre, jornadaNombre, periodo?.nombre || `Periodo ${periodo?.numero ?? ''}`]
              .filter(Boolean)
              .join(' · ')}
            action={
              <Button type="button" disabled={!puedeProgramar} onClick={() => setEditando('nueva')}>
                <PlusIcon className="h-4 w-4" />
                Nueva actividad
              </Button>
            }
          />

          {/* Selector de periodo rápido en la vista de detalle */}
          <Card>
            <div className="flex flex-wrap items-center justify-between gap-4 p-4">
              <div className="flex flex-wrap items-end gap-3">
                <div className="min-w-[180px]">
                  <Select
                    label="Periodo a consultar"
                    value={periodo?.numero ?? ''}
                    onChange={(e) => cambiarPeriodo(Number(e.target.value))}
                    disabled={periodos.length === 0}
                  >
                    {periodos.map((p) => (
                      <option key={p.numero} value={p.numero}>
                        {p.nombre || `Periodo ${p.numero}`}
                      </option>
                    ))}
                  </Select>
                </div>
              </div>

              <div className="text-xs text-muted">
                {puedeProgramar ? (
                  <span className="text-success font-medium">✓ Plan de aula aprobado para programar</span>
                ) : (
                  <span>Plan de aula pendiente o periodo cerrado</span>
                )}
              </div>
            </div>
          </Card>

          {asignacion && periodo && !plan.isLoading && !planAulaAprobado && (
            <Alert tone="warning">
              <p>
                {plan.data?.estado === 'EN_REVISION'
                  ? 'Tu plan de aula de este periodo está en revisión de coordinación.'
                  : plan.data?.estado === 'DEVUELTO'
                    ? 'Coordinación devolvió tu plan de aula de este periodo con comentarios: respóndelos para poder programar.'
                    : 'Aún no has radicado tu plan de aula de este periodo.'}{' '}
                Para programar actividades necesitas tenerlo <strong>aprobado</strong>.
              </p>
              <Link to="/docente/planeacion" className="mt-1 inline-block font-semibold underline">
                Ir a Planeación
              </Link>
            </Alert>
          )}

          {periodoCerrado && <Alert tone="info">El periodo está cerrado: las actividades solo se consultan.</Alert>}
          {mensaje && <Alert tone="error">{mensaje}</Alert>}
          {lista.isError && <Alert tone="error">{errorMessage(lista.error)}</Alert>}

          {lista.isLoading ? (
            <div className="flex justify-center p-8">
              <Spinner label="Cargando actividades..." />
            </div>
          ) : (
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
                      <p className="mt-0.5 text-xs text-muted">{a.componente_nombre}</p>
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
          )}

          {asignacion && periodo && (
            <ActividadDrawer
              open={editando !== null}
              onClose={() => setEditando(null)}
              teacherAssignmentId={asignacion._id}
              periodoNumero={periodo.numero}
              planAula={planAulaAprobado ? (plan.data?.plan ?? null) : null}
              actividad={editando === 'nueva' ? null : editando}
            />
          )}

          <EntregasDrawer actividad={revisando} onClose={() => setRevisando(null)} escala={anio?.escala_evaluacion ?? null} />
        </>
      )}
    </div>
  );
}

