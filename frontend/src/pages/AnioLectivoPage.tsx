import { type FormEvent, type ReactNode, useState } from 'react';
import { AnioLectivoFormDrawer } from '../components/anioLectivo/AnioLectivoFormDrawer';
import { CalendarioSedeDrawer } from '../components/anioLectivo/CalendarioSedeDrawer';
import { CierreAnioDrawer } from '../components/anioLectivo/CierreAnioDrawer';
import { EscalaEvaluacionDrawer } from '../components/anioLectivo/EscalaEvaluacionDrawer';
import { EventoDrawer } from '../components/anioLectivo/EventoDrawer';
import { PeriodoCard } from '../components/anioLectivo/PeriodoCard';
import { PonderacionComponentesDrawer } from '../components/anioLectivo/PonderacionComponentesDrawer';
import { ProrrogaDrawer } from '../components/anioLectivo/ProrrogaDrawer';
import { Alert, errorMessage } from '../components/ui/Alert';
import { Chip, EstadoAnioLectivoBadge, type Tone } from '../components/ui/Badge';
import { Button } from '../components/ui/Button';
import { Card, CardHeader } from '../components/ui/Card';
import { Drawer } from '../components/ui/Drawer';
import { Input, Select } from '../components/ui/Field';
import { IconButton } from '../components/ui/IconButton';
import { PageHeader } from '../components/ui/PageHeader';
import { ProgressBar } from '../components/ui/ProgressBar';
import { Spinner } from '../components/ui/Spinner';
import { EmptyRow, Table, TableBody, TableHead, Td, Th } from '../components/ui/Table';
import { BanIcon, CalendarIcon, LockIcon, PencilIcon, PlusIcon, RefreshIcon, TrashIcon } from '../components/ui/icons';
import { useAuth } from '../context/AuthContext';
import {
  useActivarAnio,
  useAniosLectivos,
  useCambiarEstadoPeriodo,
  useEliminarEvento,
  useProrrogas,
  useQuitarCalendarioSede,
  useRevocarProrroga,
} from '../hooks/useAniosLectivos';
import { useCampuses } from '../hooks/useCatalogs';
import { useInstitution } from '../hooks/useInstitution';
import { formatoFechaCalendario, formatoFechaHora, formatoRangoCalendario } from '../lib/fechas';
import {
  NOMBRES_TIPO_EVENTO,
  type AcademicYear,
  type Campus,
  type EstadoPeriodoAcademico,
  type EventoCalendario,
  type Periodo,
  type TipoEventoCalendario,
} from '../types/domain';

const TONO_EVENTO: Record<TipoEventoCalendario, Tone> = {
  RECESO: 'neutral',
  VACACIONES: 'neutral',
  DESARROLLO_INSTITUCIONAL: 'blue',
  RECUPERACION_PERIODO: 'orange',
  RECUPERACION_FINAL: 'orange',
};

interface AccionPeriodo {
  estado: EstadoPeriodoAcademico;
  etiqueta: string;
  variante: 'outline' | 'soft-edit' | 'soft-danger' | 'secondary';
  soloAdmin?: boolean;
  aviso: string;
}

// Transiciones del semáforo que ofrece la UI; el backend valida la misma tabla.
const ACCIONES_PERIODO: Record<EstadoPeriodoAcademico, AccionPeriodo[]> = {
  PROGRAMADO: [
    {
      estado: 'ABIERTO',
      etiqueta: 'Abrir periodo',
      variante: 'outline',
      aviso: 'El periodo pasa a "En curso": los docentes pueden registrar actividades y notas.',
    },
  ],
  ABIERTO: [
    {
      estado: 'EN_DIGITACION',
      etiqueta: 'Pasar a digitación',
      variante: 'soft-edit',
      aviso: 'Terminan las clases del periodo: queda la ventana final para que los docentes completen sus planillas.',
    },
    {
      estado: 'CERRADO',
      etiqueta: 'Cerrar periodo',
      variante: 'soft-danger',
      aviso: 'Se bloquean las planillas: ningún docente podrá alterar notas de este periodo (salvo una prórroga).',
    },
  ],
  EN_DIGITACION: [
    {
      estado: 'CERRADO',
      etiqueta: 'Cerrar periodo',
      variante: 'soft-danger',
      aviso: 'Se bloquean las planillas: ningún docente podrá alterar notas de este periodo (salvo una prórroga).',
    },
  ],
  CERRADO: [
    {
      estado: 'EN_DIGITACION',
      etiqueta: 'Reabrir',
      variante: 'secondary',
      soloAdmin: true,
      aviso: 'Reabrir un periodo cerrado invalida planillas ya consolidadas. Queda registrado en auditoría con tu motivo.',
    },
  ],
};

interface ConfirmacionDrawerProps {
  open: boolean;
  title: string;
  subtitle?: string;
  confirmLabel: string;
  variant?: 'primary' | 'soft-danger';
  isPending: boolean;
  error: unknown;
  tone?: 'info' | 'warning';
  mensaje: ReactNode;
  onConfirm: () => Promise<unknown>;
  onClose: () => void;
  submitDisabled?: boolean;
  children?: ReactNode;
}

/** Drawer de confirmación para acciones de un clic que cambian estado (activar, cerrar periodo, eliminar...). */
function ConfirmacionDrawer({
  open,
  title,
  subtitle,
  confirmLabel,
  variant = 'primary',
  isPending,
  error,
  tone = 'warning',
  mensaje,
  onConfirm,
  onClose,
  submitDisabled,
  children,
}: ConfirmacionDrawerProps) {
  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    await onConfirm();
    onClose();
  }

  return (
    <Drawer
      open={open}
      title={title}
      subtitle={subtitle}
      onClose={onClose}
      onSubmit={handleSubmit}
      submitLabel={confirmLabel}
      submitVariant={variant}
      isSubmitting={isPending}
      submitDisabled={submitDisabled}
    >
      {error != null && <Alert tone="error">{errorMessage(error)}</Alert>}
      <Alert tone={tone}>{mensaje}</Alert>
      {children}
    </Drawer>
  );
}

export function AnioLectivoPage() {
  const { user } = useAuth();
  const esAdmin = user?.rol === 'ADMIN';
  const puedeControlarPeriodos = user?.rol === 'ADMIN' || user?.rol === 'COORDINADOR';

  const aniosQuery = useAniosLectivos();
  const anios = aniosQuery.data ?? [];
  const vigente = anios.find((a) => a.estado === 'EN_CURSO');

  // Sin selección explícita se muestra la vigencia activa (o, si no hay, la más reciente).
  const [seleccionadoId, setSeleccionadoId] = useState('');
  const anio: AcademicYear | undefined = anios.find((a) => a._id === seleccionadoId) ?? vigente ?? anios[0];
  const soloLectura = anio?.estado === 'CERRADO';
  const enCurso = anio?.estado === 'EN_CURSO';

  const institutionQuery = useInstitution();
  const campusesQuery = useCampuses(esAdmin ? institutionQuery.data?._id : undefined);
  const sedes = campusesQuery.data ?? [];
  const prorrogasQuery = useProrrogas(anio?._id, puedeControlarPeriodos && anio !== undefined);

  const [formAbierto, setFormAbierto] = useState<'crear' | 'editar' | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [cierreAbierto, setCierreAbierto] = useState(false);
  const [activando, setActivando] = useState(false);
  const activar = useActivarAnio();

  const [cambio, setCambio] = useState<{ periodo: Periodo; accion: AccionPeriodo } | null>(null);
  const [motivo, setMotivo] = useState('');
  const cambiarEstado = useCambiarEstadoPeriodo();

  const [prorrogaDrawer, setProrrogaDrawer] = useState<{ periodo?: number } | null>(null);
  const revocar = useRevocarProrroga();
  const [revocando, setRevocando] = useState<string | null>(null);

  const [eventoDrawer, setEventoDrawer] = useState<{ evento: EventoCalendario | null } | null>(null);
  const [eventoEliminando, setEventoEliminando] = useState<EventoCalendario | null>(null);
  const eliminarEvento = useEliminarEvento();

  const [sedeCalendario, setSedeCalendario] = useState<Campus | null>(null);
  const [sedeHeredando, setSedeHeredando] = useState<Campus | null>(null);
  const quitarCalendarioSede = useQuitarCalendarioSede();

  const [escalaAbierta, setEscalaAbierta] = useState(false);
  const [ponderacionAbierta, setPonderacionAbierta] = useState(false);

  async function handleActivar() {
    if (!anio) return;
    activar.reset();
    const activado = await activar.mutateAsync(anio._id);
    setSeleccionadoId(activado._id);
  }

  function abrirCambio(periodo: Periodo, accion: AccionPeriodo) {
    cambiarEstado.reset();
    setMotivo('');
    setCambio({ periodo, accion });
  }

  function accionesDe(periodo: Periodo): ReactNode {
    if (!anio || !enCurso) return null;
    const estado = periodo.estado ?? 'PROGRAMADO';
    const transiciones = puedeControlarPeriodos
      ? ACCIONES_PERIODO[estado].filter((a) => !a.soloAdmin || esAdmin)
      : [];

    return (
      <>
        {transiciones.map((a) => (
          <Button key={a.estado} type="button" variant={a.variante} onClick={() => abrirCambio(periodo, a)}>
            {a.etiqueta}
          </Button>
        ))}
        {puedeControlarPeriodos && estado !== 'PROGRAMADO' && (
          <Button type="button" variant="secondary" onClick={() => setProrrogaDrawer({ periodo: periodo.numero })}>
            Prórroga
          </Button>
        )}
      </>
    );
  }

  const resumen = anio?.resumen_semanas;
  const totalPesos = anio ? Math.round(anio.periodos.reduce((sum, p) => sum + p.porcentaje, 0) * 100) / 100 : 0;
  const sedesConCalendarioPropio = new Set(anio?.calendarios_sede.map((c) => c.sede_id));

  return (
    <div className="space-y-4">
      <PageHeader
        title="Año lectivo"
        subtitle="Vigencia académica, periodos, ventanas de calificación y calendario. Cada grupo pertenece a un año lectivo."
        action={
          esAdmin && (
            <Button onClick={() => setFormAbierto('crear')}>
              <PlusIcon className="h-4 w-4" />
              Nuevo año lectivo
            </Button>
          )
        }
      />

      {aniosQuery.isLoading && <Spinner label="Cargando años lectivos..." />}
      {aniosQuery.isError && <Alert tone="error">{errorMessage(aniosQuery.error)}</Alert>}
      {aviso && <Alert tone="success">{aviso}</Alert>}
      {!aniosQuery.isLoading && !aniosQuery.isError && !vigente && (
        <Alert tone="warning">
          No hay un año lectivo vigente: los docentes no pueden registrar notas hasta que se active uno.
        </Alert>
      )}

      {!aniosQuery.isLoading && anios.length === 0 && (
        <Alert tone="info">
          Aún no hay años lectivos. {esAdmin ? 'Crea el primero con "Nuevo año lectivo".' : 'Consulta con un administrador.'}
        </Alert>
      )}

      {anio && (
        <>
          <Card>
            <CardHeader
              title={anio.nombre}
              subtitle={`Calendario ${anio.calendario} · ${formatoRangoCalendario(anio.fecha_inicio, anio.fecha_fin)}`}
              action={
                <div className="flex flex-wrap items-center justify-end gap-2">
                  <EstadoAnioLectivoBadge value={anio.estado} />
                  {esAdmin && !soloLectura && (
                    <Button type="button" variant="outline" onClick={() => setFormAbierto('editar')}>
                      <PencilIcon className="h-4 w-4" />
                      Editar
                    </Button>
                  )}
                  {esAdmin && anio.estado === 'PLANIFICACION' && (
                    <Button
                      type="button"
                      variant="soft-success"
                      onClick={() => {
                        activar.reset();
                        setActivando(true);
                      }}
                    >
                      <RefreshIcon className="h-4 w-4" />
                      Activar como vigente
                    </Button>
                  )}
                  {esAdmin && enCurso && (
                    <Button type="button" variant="soft-danger" onClick={() => setCierreAbierto(true)}>
                      <LockIcon className="h-4 w-4" />
                      Cerrar año lectivo
                    </Button>
                  )}
                </div>
              }
            />
            <div className="max-w-xs">
              <Select label="Consultar año" value={anio._id} onChange={(e) => setSeleccionadoId(e.target.value)}>
                {anios.map((a) => (
                  <option key={a._id} value={a._id}>
                    {a.nombre}
                    {a.estado === 'EN_CURSO' ? ' (vigente)' : a.estado === 'CERRADO' ? ' (histórico)' : ''}
                  </option>
                ))}
              </Select>
            </div>
          </Card>

          {soloLectura && (
            <Alert tone="info">
              Estás consultando un año cerrado
              {anio.cerrado_at ? ` el ${formatoFechaCalendario(anio.cerrado_at)}` : ''}: es un histórico de solo lectura.
            </Alert>
          )}

          {resumen && (
            <Card>
              <CardHeader
                title="Semanas de trabajo académico"
                subtitle="Se cuentan los días de lunes a viernes dentro de los periodos, sin recesos, vacaciones ni jornadas de desarrollo institucional."
              />
              <div className="flex flex-wrap items-end gap-x-3 gap-y-1">
                <span className="text-h2 text-ink">{resumen.semanas_lectivas}</span>
                <span className="pb-0.5 text-sm text-muted">de {resumen.semanas_minimas} semanas mínimas</span>
                <Chip tone={resumen.cumple_minimo ? 'green' : 'orange'}>
                  {resumen.cumple_minimo ? 'Cumple el mínimo' : `Faltan ${resumen.semanas_faltantes} semanas`}
                </Chip>
              </div>
              <div className="my-3">
                <ProgressBar
                  value={resumen.semanas_lectivas}
                  max={resumen.semanas_minimas}
                  tone={resumen.cumple_minimo ? 'green' : 'orange'}
                  label="Semanas lectivas frente al mínimo"
                />
              </div>
              <div className="flex flex-wrap gap-2">
                {resumen.semanas_por_periodo.map((s) => (
                  <Chip key={s.numero} tone="blue">
                    Periodo {s.numero}: {s.semanas} sem.
                  </Chip>
                ))}
              </div>
            </Card>
          )}

          <Card>
            <CardHeader
              title="Línea de tiempo de periodos"
              subtitle="Semáforo de cada periodo: programado, en curso, en digitación o cerrado."
              action={
                <div className="flex flex-wrap items-center justify-end gap-2">
                  <Chip tone={totalPesos === 100 ? 'green' : 'red'}>Suma de pesos: {totalPesos}%</Chip>
                  {puedeControlarPeriodos && enCurso && (
                    <Button type="button" variant="outline" onClick={() => setProrrogaDrawer({})}>
                      <CalendarIcon className="h-4 w-4" />
                      Conceder prórroga
                    </Button>
                  )}
                </div>
              }
            />
            {cambiarEstado.isError && cambio === null && <Alert tone="error">{errorMessage(cambiarEstado.error)}</Alert>}
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
              {anio.periodos.map((p) => (
                <PeriodoCard
                  key={p.numero}
                  periodo={p}
                  semanas={resumen?.semanas_por_periodo.find((s) => s.numero === p.numero)?.semanas}
                  acciones={accionesDe(p)}
                />
              ))}
            </div>
          </Card>

          <Card>
            <CardHeader
              title="Recesos, jornadas institucionales y recuperaciones"
              subtitle="Los recesos y vacaciones son días no hábiles: no se exige asistencia ni se cuentan inasistencias."
              action={
                esAdmin &&
                !soloLectura && (
                  <Button type="button" variant="outline" onClick={() => setEventoDrawer({ evento: null })}>
                    <PlusIcon className="h-4 w-4" />
                    Nuevo evento
                  </Button>
                )
              }
            />
            {eliminarEvento.isError && eventoEliminando === null && (
              <Alert tone="error">{errorMessage(eliminarEvento.error)}</Alert>
            )}
            <Table>
              <TableHead>
                <Th>Tipo</Th>
                <Th>Nombre</Th>
                <Th>Fechas</Th>
                <Th>Detalle</Th>
                {esAdmin && !soloLectura && <Th />}
              </TableHead>
              <TableBody>
                {anio.eventos.map((e) => (
                  <tr key={e._id}>
                    <Td>
                      <Chip tone={TONO_EVENTO[e.tipo]}>{NOMBRES_TIPO_EVENTO[e.tipo]}</Chip>
                    </Td>
                    <Td className="font-medium text-ink">{e.nombre}</Td>
                    <Td>{formatoRangoCalendario(e.fecha_inicio, e.fecha_fin)}</Td>
                    <Td>
                      {e.periodo_numero ? `Periodo ${e.periodo_numero}` : ''}
                      {e.fecha_limite_resultados
                        ? `${e.periodo_numero ? ' · ' : ''}Resultados hasta ${formatoFechaCalendario(e.fecha_limite_resultados)}`
                        : ''}
                      {!e.periodo_numero && !e.fecha_limite_resultados && '—'}
                    </Td>
                    {esAdmin && !soloLectura && (
                      <Td>
                        <div className="flex justify-end gap-2">
                          <IconButton
                            tone="edit"
                            label="Editar evento"
                            icon={<PencilIcon />}
                            onClick={() => setEventoDrawer({ evento: e })}
                          />
                          <IconButton
                            tone="danger"
                            label="Eliminar evento"
                            icon={<TrashIcon />}
                            onClick={() => {
                              eliminarEvento.reset();
                              setEventoEliminando(e);
                            }}
                          />
                        </div>
                      </Td>
                    )}
                  </tr>
                ))}
                {anio.eventos.length === 0 && (
                  <EmptyRow colSpan={esAdmin && !soloLectura ? 5 : 4}>Sin recesos ni recuperaciones registrados.</EmptyRow>
                )}
              </TableBody>
            </Table>
          </Card>

          {esAdmin && sedes.length > 1 && (
            <Card>
              <CardHeader
                title="Calendario por sede"
                subtitle="Por defecto cada sede hereda el calendario institucional. Una sede rural o de calendario especial puede tener fechas propias por periodo."
              />
              {quitarCalendarioSede.isError && sedeHeredando === null && (
                <Alert tone="error">{errorMessage(quitarCalendarioSede.error)}</Alert>
              )}
              <Table>
                <TableHead>
                  <Th>Sede</Th>
                  <Th>Calendario</Th>
                  {!soloLectura && <Th />}
                </TableHead>
                <TableBody>
                  {sedes.map((s) => {
                    const propio = sedesConCalendarioPropio.has(s._id);
                    return (
                      <tr key={s._id}>
                        <Td className="font-medium text-ink">{s.nombre}</Td>
                        <Td>
                          <Chip tone={propio ? 'orange' : 'neutral'}>{propio ? 'Calendario propio' : 'Hereda el institucional'}</Chip>
                        </Td>
                        {!soloLectura && (
                          <Td>
                            <div className="flex justify-end gap-2">
                              <IconButton
                                tone="edit"
                                label="Configurar calendario de la sede"
                                icon={<PencilIcon />}
                                onClick={() => setSedeCalendario(s)}
                              />
                              {propio && (
                                <IconButton
                                  tone="neutral"
                                  label="Volver a heredar el calendario institucional"
                                  icon={<BanIcon />}
                                  onClick={() => {
                                    quitarCalendarioSede.reset();
                                    setSedeHeredando(s);
                                  }}
                                />
                              )}
                            </div>
                          </Td>
                        )}
                      </tr>
                    );
                  })}
                </TableBody>
              </Table>
            </Card>
          )}

          {puedeControlarPeriodos && (
            <Card>
              <CardHeader
                title="Prórrogas de planillas"
                subtitle="Habilitaciones temporales para digitar notas fuera de la ventana. Cada una queda en auditoría."
              />
              {prorrogasQuery.isLoading && <Spinner />}
              {prorrogasQuery.isError && <Alert tone="error">{errorMessage(prorrogasQuery.error)}</Alert>}
              {revocar.isError && revocando === null && <Alert tone="error">{errorMessage(revocar.error)}</Alert>}
              {prorrogasQuery.data && (
                <Table>
                  <TableHead>
                    <Th>Periodo</Th>
                    <Th>Docente</Th>
                    <Th>Grupo</Th>
                    <Th>Vence</Th>
                    <Th>Justificación</Th>
                    <Th>Estado</Th>
                    <Th />
                  </TableHead>
                  <TableBody>
                    {prorrogasQuery.data.map((p) => (
                      <tr key={p._id}>
                        <Td className="font-medium text-ink">
                          {anio.periodos.find((x) => x.numero === p.periodo_numero)?.nombre ?? `Periodo ${p.periodo_numero}`}
                        </Td>
                        <Td>{p.docente_id ? `${p.docente_id.nombre} ${p.docente_id.apellido}` : 'Cualquiera'}</Td>
                        <Td>{p.group_id ? p.group_id.nomenclatura : 'Todos'}</Td>
                        <Td>{formatoFechaHora(p.hasta)}</Td>
                        <Td className="max-w-xs truncate" title={p.justificacion}>
                          {p.justificacion}
                        </Td>
                        <Td>
                          <Chip tone={p.vigente ? 'green' : p.revocada ? 'red' : 'neutral'}>
                            {p.vigente ? 'Vigente' : p.revocada ? 'Revocada' : 'Vencida'}
                          </Chip>
                        </Td>
                        <Td>
                          {p.vigente && (
                            <div className="flex justify-end">
                              <IconButton
                                tone="danger"
                                label="Revocar prórroga"
                                icon={<BanIcon />}
                                onClick={() => {
                                  revocar.reset();
                                  setRevocando(p._id);
                                }}
                              />
                            </div>
                          )}
                        </Td>
                      </tr>
                    ))}
                    {prorrogasQuery.data.length === 0 && <EmptyRow colSpan={7}>Sin prórrogas en este año.</EmptyRow>}
                  </TableBody>
                </Table>
              )}
            </Card>
          )}

          {esAdmin && (
            <Card>
              <CardHeader
                title="Escala de evaluación institucional (SIEE)"
                subtitle="Decreto 1290 de 2009: escala numérica, nota aprobatoria y cortes de los 4 niveles cualitativos (CU-ADM-04)."
                action={
                  anio.estado === 'PLANIFICACION' ? (
                    <Button type="button" variant="outline" onClick={() => setEscalaAbierta(true)}>
                      <PencilIcon className="h-4 w-4" />
                      {anio.escala_evaluacion ? 'Editar' : 'Configurar'}
                    </Button>
                  ) : undefined
                }
              />
              {!anio.escala_evaluacion && anio.estado === 'PLANIFICACION' && (
                <Alert tone="warning">
                  Aún no se ha configurado la escala de evaluación de este año. Una vez actives el año quedará
                  congelada para no alterar boletines ya emitidos.
                </Alert>
              )}
              {anio.estado !== 'PLANIFICACION' && (
                <Alert tone="info">
                  El año ya fue activado: la escala de evaluación queda congelada y solo se puede consultar.
                </Alert>
              )}
              {anio.escala_evaluacion && (
                <div className="space-y-3">
                  <div className="flex flex-wrap gap-2">
                    <Chip tone="blue">
                      Escala {anio.escala_evaluacion.nota_minima}–{anio.escala_evaluacion.nota_maxima}
                    </Chip>
                    <Chip tone="green">Aprueba desde {anio.escala_evaluacion.nota_aprobatoria}</Chip>
                    <Chip tone="neutral">{anio.escala_evaluacion.precision_decimales} decimal(es)</Chip>
                  </div>
                  <Table>
                    <TableHead>
                      <Th>Nivel</Th>
                      <Th>Rango</Th>
                      <Th>Aprueba</Th>
                    </TableHead>
                    <TableBody>
                      {anio.escala_evaluacion.rangos.map((r) => (
                        <tr key={r.nivel}>
                          <Td className="font-medium text-ink">{r.etiqueta}</Td>
                          <Td>
                            {r.valor_minimo}–{r.valor_maximo}
                          </Td>
                          <Td>
                            <Chip tone={r.es_aprobatorio ? 'green' : 'red'}>{r.es_aprobatorio ? 'Sí' : 'No'}</Chip>
                          </Td>
                        </tr>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </Card>
          )}

          {esAdmin && (
            <Card>
              <CardHeader
                title="Ponderación de componentes del SIEE"
                subtitle="Decreto 1290 de 2009: peso de Saber, Hacer y Ser en la nota de asignatura (CU-ADM-04)."
                action={
                  anio.estado === 'PLANIFICACION' ? (
                    <Button type="button" variant="outline" onClick={() => setPonderacionAbierta(true)}>
                      <PencilIcon className="h-4 w-4" />
                      {anio.ponderacion_componentes ? 'Editar' : 'Configurar'}
                    </Button>
                  ) : undefined
                }
              />
              {anio.estado !== 'PLANIFICACION' && (
                <Alert tone="info">
                  El año ya fue activado: la ponderación de componentes queda congelada y solo se puede consultar.
                </Alert>
              )}
              <div className="flex flex-wrap gap-2">
                <Chip tone="blue">
                  Saber {(anio.ponderacion_componentes?.COGNITIVO_SABER ?? 0.4) * 100}%
                </Chip>
                <Chip tone="blue">
                  Hacer {(anio.ponderacion_componentes?.PROCEDIMENTAL_HACER ?? 0.4) * 100}%
                </Chip>
                <Chip tone="blue">
                  Ser {(anio.ponderacion_componentes?.ACTITUDINAL_SER ?? 0.2) * 100}%
                </Chip>
                {!anio.ponderacion_componentes && <Chip tone="neutral">Respaldo por defecto (sin personalizar)</Chip>}
              </div>
            </Card>
          )}
        </>
      )}

      <AnioLectivoFormDrawer
        open={formAbierto !== null}
        anio={formAbierto === 'editar' ? (anio ?? null) : null}
        anios={anios}
        onClose={() => setFormAbierto(null)}
        onGuardado={(guardado, gruposCopiados) => {
          setSeleccionadoId(guardado._id);
          setAviso(
            formAbierto === 'crear'
              ? `${guardado.nombre} creado en planificación${gruposCopiados ? ` con ${gruposCopiados} grupo(s) copiado(s)` : ''}. Actívalo cuando sea la vigencia actual.`
              : `${guardado.nombre} actualizado.`
          );
        }}
      />

      {anio && (
        <>
          <CierreAnioDrawer open={cierreAbierto} anio={anio} onClose={() => setCierreAbierto(false)} />
          <ProrrogaDrawer
            open={prorrogaDrawer !== null}
            anio={anio}
            periodoInicial={prorrogaDrawer?.periodo}
            onClose={() => setProrrogaDrawer(null)}
          />
          <EventoDrawer
            open={eventoDrawer !== null}
            anio={anio}
            evento={eventoDrawer?.evento ?? null}
            onClose={() => setEventoDrawer(null)}
          />
          <CalendarioSedeDrawer open={sedeCalendario !== null} anio={anio} sede={sedeCalendario} onClose={() => setSedeCalendario(null)} />
          <EscalaEvaluacionDrawer open={escalaAbierta} anio={anio} onClose={() => setEscalaAbierta(false)} />
          <PonderacionComponentesDrawer
            open={ponderacionAbierta}
            anio={anio}
            onClose={() => setPonderacionAbierta(false)}
          />

          <ConfirmacionDrawer
            open={activando}
            title="Activar año lectivo"
            subtitle={anio.nombre}
            confirmLabel="Activar como vigente"
            isPending={activar.isPending}
            error={activar.error}
            tone="info"
            mensaje={`Este pasa a ser la vigencia actual: solo puede haber un año vigente a la vez y los docentes calificarán en él. Si ya hay otro vigente, primero debes cerrarlo.`}
            onConfirm={handleActivar}
            onClose={() => setActivando(false)}
          />

          <ConfirmacionDrawer
            open={cambio !== null}
            title={cambio?.accion.etiqueta ?? ''}
            subtitle={cambio ? `${cambio.periodo.nombre} · ${anio.nombre}` : undefined}
            confirmLabel={cambio?.accion.etiqueta ?? 'Confirmar'}
            variant={cambio?.accion.estado === 'CERRADO' ? 'soft-danger' : 'primary'}
            isPending={cambiarEstado.isPending}
            error={cambiarEstado.error}
            tone={cambio?.accion.estado === 'CERRADO' || cambio?.periodo.estado === 'CERRADO' ? 'warning' : 'info'}
            mensaje={cambio?.accion.aviso ?? ''}
            submitDisabled={cambio?.periodo.estado === 'CERRADO' && motivo.trim().length < 10}
            onConfirm={() =>
              cambio
                ? cambiarEstado.mutateAsync({
                    anioId: anio._id,
                    numero: cambio.periodo.numero,
                    estado: cambio.accion.estado,
                    motivo: motivo.trim() || undefined,
                  })
                : Promise.resolve()
            }
            onClose={() => setCambio(null)}
          >
            {cambio?.periodo.estado === 'CERRADO' && (
              <Input
                label="Motivo de la reapertura"
                required
                minLength={10}
                value={motivo}
                onChange={(e) => setMotivo(e.target.value)}
                hint="Mínimo 10 caracteres. Queda en auditoría."
              />
            )}
          </ConfirmacionDrawer>

          <ConfirmacionDrawer
            open={eventoEliminando !== null}
            title="Eliminar evento"
            confirmLabel="Sí, eliminar"
            variant="soft-danger"
            isPending={eliminarEvento.isPending}
            error={eliminarEvento.error}
            mensaje={`¿Eliminar "${eventoEliminando?.nombre ?? ''}" del calendario? Las semanas lectivas se recalculan.`}
            onConfirm={() =>
              eventoEliminando
                ? eliminarEvento.mutateAsync({ anioId: anio._id, eventoId: eventoEliminando._id })
                : Promise.resolve()
            }
            onClose={() => setEventoEliminando(null)}
          />

          <ConfirmacionDrawer
            open={sedeHeredando !== null}
            title="Volver al calendario institucional"
            subtitle={sedeHeredando?.nombre}
            confirmLabel="Sí, heredar"
            isPending={quitarCalendarioSede.isPending}
            error={quitarCalendarioSede.error}
            tone="info"
            mensaje="La sede dejará sus fechas propias y usará el calendario institucional en todos los periodos."
            onConfirm={() =>
              sedeHeredando
                ? quitarCalendarioSede.mutateAsync({ anioId: anio._id, sedeId: sedeHeredando._id })
                : Promise.resolve()
            }
            onClose={() => setSedeHeredando(null)}
          />

          <ConfirmacionDrawer
            open={revocando !== null}
            title="Revocar prórroga"
            confirmLabel="Sí, revocar"
            variant="soft-danger"
            isPending={revocar.isPending}
            error={revocar.error}
            mensaje="El docente o grupo vuelve a quedar sujeto al estado y la ventana del periodo."
            onConfirm={() => (revocando ? revocar.mutateAsync({ anioId: anio._id, prorrogaId: revocando }) : Promise.resolve())}
            onClose={() => setRevocando(null)}
          />
        </>
      )}
    </div>
  );
}
