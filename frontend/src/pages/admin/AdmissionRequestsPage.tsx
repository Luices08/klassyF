import { type FormEvent, useState } from 'react';
import { Alert, errorMessage } from '../../components/ui/Alert';
import { Chip } from '../../components/ui/Badge';
import { Button } from '../../components/ui/Button';
import { Card, CardHeader } from '../../components/ui/Card';
import { Drawer } from '../../components/ui/Drawer';
import { Input, Select } from '../../components/ui/Field';
import { IconButton } from '../../components/ui/IconButton';
import { PageHeader } from '../../components/ui/PageHeader';
import { Spinner } from '../../components/ui/Spinner';
import { EmptyRow, Table, TableBody, TableHead, Td, Th } from '../../components/ui/Table';
import { CheckCircleIcon, FileTextIcon, PlusIcon, XCircleIcon } from '../../components/ui/icons';
import { Tabs } from '../../components/ui/Tabs';
import { InscripcionDrawer } from '../../components/admisiones/InscripcionDrawer';
import { SolicitudDocumentosDrawer } from '../../components/admisiones/SolicitudDocumentosDrawer';
import { DocumentosPrevistos, type TraeTodos } from '../../components/matriculas/DocumentosPrevistos';
import { useAnioDeTrabajo, useAniosLectivos } from '../../hooks/useAniosLectivos';
import {
  useAdmissionRequestsList,
  useAdmitirSolicitud,
  useAprobarSolicitud,
  useDisponibilidadCupos,
  useRechazarSolicitud,
  type AdmissionRequestsFilter,
} from '../../hooks/useAdmissionRequests';
import { ETIQUETA_JORNADA } from '../../hooks/useCertificados';
import { useGroups } from '../../hooks/useGroups';
import { ESTADOS_SOLICITUD, type AdmissionRequest, type EstadoSolicitud } from '../../types/domain';

const ESTADO_TONE: Record<EstadoSolicitud, 'blue' | 'green' | 'red' | 'orange'> = {
  PENDIENTE: 'orange',
  ADMITIDO: 'blue',
  MATRICULADO: 'green',
  RECHAZADA: 'red',
};

function nombreDe(v: string | { nombre: string }): string {
  return typeof v === 'string' ? v : v.nombre;
}

function sedeYJornadaPedidas(s: AdmissionRequest): string {
  const sede = s.sede_deseada_id ? nombreDe(s.sede_deseada_id) : null;
  const jornada = s.jornada_deseada ? (ETIQUETA_JORNADA[s.jornada_deseada] ?? s.jornada_deseada) : null;
  return [sede, jornada].filter(Boolean).join(' · ') || 'Sin preferencia de sede ni jornada';
}

export function AdmissionRequestsPage() {
  const { anio } = useAnioDeTrabajo();
  const anioId = anio?._id;
  const anioActualYear = anio?.year ?? new Date().getFullYear();

  const [pestana, setPestana] = useState<'solicitudes' | 'cupos'>('solicitudes');
  const [filterEstado, setFilterEstado] = useState<EstadoSolicitud | ''>('');
  const [filterAnio, setFilterAnio] = useState('');
  const [page, setPage] = useState(1);

  const aniosQuery = useAniosLectivos();
  const aniosAbiertos = [...(aniosQuery.data ?? [])].filter((a) => a.estado !== 'CERRADO').sort((a, b) => b.year - a.year);

  const filter: AdmissionRequestsFilter = {
    estado: filterEstado || undefined,
    academic_year_id: filterAnio || undefined,
    page,
    limit: 20,
  };
  const listQuery = useAdmissionRequestsList(filter);

  const [inscribiendo, setInscribiendo] = useState(false);
  const [documentosDe, setDocumentosDe] = useState<AdmissionRequest | null>(null);

  // Formalización / Matrícula
  const [matriculando, setMatriculando] = useState<AdmissionRequest | null>(null);
  const [groupId, setGroupId] = useState('');
  const [traeTodos, setTraeTodos] = useState<TraeTodos>('');
  const [fechaLimiteCompromiso, setFechaLimiteCompromiso] = useState('');

  const anioDeMatricula = (typeof matriculando?.academic_year_id === 'object' && matriculando?.academic_year_id
    ? (matriculando.academic_year_id as { _id?: string })._id
    : (matriculando?.academic_year_id as string)) || anioId;

  const groupsQuery = useGroups({
    academic_year_id: anioDeMatricula,
    grade_id: matriculando ? (typeof matriculando.grado_deseado_id === 'string' ? matriculando.grado_deseado_id : matriculando.grado_deseado_id._id) : undefined,
    estado: 'ACTIVE',
  });

  const admitir = useAdmitirSolicitud();
  const matricular = useAprobarSolicitud();
  const rechazar = useRechazarSolicitud();

  const [rechazando, setRechazando] = useState<AdmissionRequest | null>(null);
  const [motivo, setMotivo] = useState('');

  const sedePedida = matriculando?.sede_deseada_id ? (typeof matriculando.sede_deseada_id === 'string' ? matriculando.sede_deseada_id : matriculando.sede_deseada_id._id) : null;
  const gruposParaMatricular = (groupsQuery.data ?? [])
    .map((g) => ({
      g,
      loPedido:
        (!sedePedida || (typeof g.sede_id === 'string' ? g.sede_id : g.sede_id._id) === sedePedida) &&
        (!matriculando?.jornada_deseada || (typeof g.jornada_id === 'object' && g.jornada_id.nombre === matriculando.jornada_deseada)),
    }))
    .sort((a, b) => Number(b.loPedido) - Number(a.loPedido));

  async function handleMatricular(e: FormEvent) {
    e.preventDefault();
    if (!matriculando || !anioDeMatricula || !groupId || !traeTodos) return;
    matricular.reset();
    await matricular.mutateAsync({
      id: matriculando._id,
      group_id: groupId,
      academic_year_id: anioDeMatricula,
      trae_todos: traeTodos,
      fecha_limite_compromiso: traeTodos === 'NO' ? fechaLimiteCompromiso : undefined,
    });
    setMatriculando(null);
    setGroupId('');
    setTraeTodos('');
    setFechaLimiteCompromiso('');
  }

  async function handleAdmitir(solicitud: AdmissionRequest) {
    await admitir.mutateAsync(solicitud._id);
  }

  async function handleRechazar(e: FormEvent) {
    e.preventDefault();
    if (!rechazando) return;
    rechazar.reset();
    await rechazar.mutateAsync({ id: rechazando._id, motivo });
    setRechazando(null);
    setMotivo('');
  }

  // Pestaña Cupos
  const [anioCuposId, setAnioCuposId] = useState('');
  const anioCuposSeleccionado = anioCuposId || aniosAbiertos[0]?._id || anioId || '';
  const disponibilidadQuery = useDisponibilidadCupos(anioCuposSeleccionado);

  const paginaInfo = listQuery.data;

  return (
    <div className="space-y-4">
      <PageHeader
        title="Admisiones"
        subtitle="Solicitudes de cupo radicadas por familias o registradas en el mostrador. Para el año en curso matricula directamente; para el año siguiente admite antes del cierre escolar."
        action={
          <Button onClick={() => setInscribiendo(true)}>
            <PlusIcon className="h-4 w-4" />
            Registrar inscripción
          </Button>
        }
      />

      <Tabs
        items={[
          { key: 'solicitudes', label: 'Solicitudes' },
          { key: 'cupos', label: 'Disponibilidad de cupos' },
        ]}
        value={pestana}
        onChange={(k) => setPestana(k as typeof pestana)}
      />

      {pestana === 'solicitudes' && (
        <Card>
          <CardHeader
            title="Solicitudes"
            action={
              <div className="flex flex-wrap items-end gap-3">
                <Select
                  label="Año"
                  value={filterAnio}
                  onChange={(e) => {
                    setFilterAnio(e.target.value);
                    setPage(1);
                  }}
                  className="w-40"
                >
                  <option value="">Todos</option>
                  {aniosAbiertos.map((a) => (
                    <option key={a._id} value={a._id}>
                      {a.year} {a.estado === 'PLANIFICACION' ? '(próximo)' : ''}
                    </option>
                  ))}
                </Select>
                <Select
                  label="Estado"
                  value={filterEstado}
                  onChange={(e) => {
                    setFilterEstado(e.target.value as EstadoSolicitud | '');
                    setPage(1);
                  }}
                  className="w-44"
                >
                  <option value="">Todos</option>
                  {ESTADOS_SOLICITUD.map((e) => (
                    <option key={e} value={e}>
                      {e}
                    </option>
                  ))}
                </Select>
              </div>
            }
          />

          {listQuery.isLoading && <Spinner />}
          {listQuery.isError && <Alert tone="error">{errorMessage(listQuery.error)}</Alert>}

          {paginaInfo && (
            <>
              <Table>
                <TableHead>
                  <Th>Aspirante</Th>
                  <Th>Documento</Th>
                  <Th>Cupo que pidió</Th>
                  <Th>Acudiente</Th>
                  <Th>Documentos</Th>
                  <Th>Fecha</Th>
                  <Th>Estado</Th>
                  <Th />
                </TableHead>
                <TableBody>
                  {paginaInfo.data.map((s) => {
                    const solAnioYear = typeof s.academic_year_id === 'object' && s.academic_year_id
                      ? (s.academic_year_id as { year?: number }).year
                      : undefined;
                    const esAnioSiguiente = solAnioYear !== undefined && solAnioYear > anioActualYear;

                    return (
                      <tr key={s._id}>
                        <Td className="font-medium text-ink">
                          {s.nombre_aspirante} {s.apellido_aspirante}
                        </Td>
                        <Td>
                          {s.tipo_documento} {s.numero_documento}
                        </Td>
                        <Td>
                          <span className="font-medium text-ink">{nombreDe(s.grado_deseado_id)}</span>
                          <span className="block text-xs text-muted">
                            {solAnioYear ? `Año ${solAnioYear} · ` : ''}{sedeYJornadaPedidas(s)}
                          </span>
                        </Td>
                        <Td>
                          {s.acudiente_nombre} {s.acudiente_apellido} · {s.acudiente_telefono}
                        </Td>
                        <Td>{s.documentos?.length ? `${s.documentos.length} recibido${s.documentos.length === 1 ? '' : 's'}` : '—'}</Td>
                        <Td>{new Date(s.createdAt).toLocaleDateString()}</Td>
                        <Td>
                          <div className="flex flex-wrap items-center gap-1.5">
                            <Chip tone={ESTADO_TONE[s.estado]}>{s.estado}</Chip>
                            {s.origen === 'SECRETARIA' && <Chip tone="neutral">Mostrador</Chip>}
                          </div>
                        </Td>
                        <Td>
                          <div className="flex justify-end gap-2">
                            <IconButton
                              tone="neutral"
                              label="Documentos de la solicitud"
                              icon={<FileTextIcon />}
                              onClick={() => setDocumentosDe(s)}
                            />

                            {/* Solicitud del año en curso: aprobar y matricular de inmediato */}
                            {!esAnioSiguiente && s.estado === 'PENDIENTE' && (
                              <>
                                <IconButton
                                  tone="success"
                                  label="Aprobar y matricular"
                                  icon={<CheckCircleIcon />}
                                  onClick={() => {
                                    setGroupId('');
                                    setTraeTodos('');
                                    setFechaLimiteCompromiso('');
                                    setMatriculando(s);
                                  }}
                                />
                                <IconButton
                                  tone="danger"
                                  label="Rechazar solicitud"
                                  icon={<XCircleIcon />}
                                  onClick={() => setRechazando(s)}
                                />
                              </>
                            )}

                            {/* Solicitud del año siguiente: admitir o rechazar */}
                            {esAnioSiguiente && s.estado === 'PENDIENTE' && (
                              <>
                                <IconButton
                                  tone="edit"
                                  label="Admitir aspirante para el año entrante"
                                  icon={<CheckCircleIcon />}
                                  disabled={admitir.isPending}
                                  onClick={() => void handleAdmitir(s)}
                                />
                                <IconButton
                                  tone="danger"
                                  label="Rechazar solicitud"
                                  icon={<XCircleIcon />}
                                  onClick={() => setRechazando(s)}
                                />
                              </>
                            )}

                            {/* Solicitud ya admitida del año entrante: formalizar en ventanilla */}
                            {s.estado === 'ADMITIDO' && (
                              <IconButton
                                tone="success"
                                label="Formalizar matrícula en ventanilla"
                                icon={<CheckCircleIcon />}
                                onClick={() => {
                                  setGroupId('');
                                  setTraeTodos('');
                                  setFechaLimiteCompromiso('');
                                  setMatriculando(s);
                                }}
                              />
                            )}
                          </div>
                        </Td>
                      </tr>
                    );
                  })}
                  {paginaInfo.data.length === 0 && <EmptyRow colSpan={8}>Sin solicitudes con los filtros seleccionados.</EmptyRow>}
                </TableBody>
              </Table>

              {paginaInfo.pages > 1 && (
                <div className="mt-3 flex items-center justify-between text-sm text-muted">
                  <span>
                    Página {paginaInfo.page} de {paginaInfo.pages} ({paginaInfo.total} solicitudes)
                  </span>
                  <div className="flex gap-2">
                    <Button variant="secondary" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
                      Anterior
                    </Button>
                    <Button variant="secondary" disabled={page >= paginaInfo.pages} onClick={() => setPage((p) => p + 1)}>
                      Siguiente
                    </Button>
                  </div>
                </div>
              )}
            </>
          )}
        </Card>
      )}

      {/* Pestaña: Disponibilidad de cupos (4 columnas reglamentarias) */}
      {pestana === 'cupos' && (
        <Card>
          <CardHeader
            title="Disponibilidad de cupos"
            action={
              <div className="flex items-center gap-2">
                <span className="text-xs font-semibold text-muted">Vigencia:</span>
                <select
                  value={anioCuposSeleccionado}
                  onChange={(e) => setAnioCuposId(e.target.value)}
                  className="rounded-md border border-border bg-surface px-3 py-1.5 text-xs font-semibold text-ink shadow-sm"
                >
                  {aniosAbiertos.map((a) => (
                    <option key={a._id} value={a._id}>
                      Año {a.year} ({a.estado})
                    </option>
                  ))}
                </select>
              </div>
            }
          />

          <div className="overflow-x-auto p-4">
            {disponibilidadQuery.isLoading && (
              <div className="flex justify-center p-8">
                <Spinner label="Calculando aforo y cupos..." />
              </div>
            )}
            {disponibilidadQuery.isError && (
              <Alert tone="error">{errorMessage(disponibilidadQuery.error)}</Alert>
            )}

            {disponibilidadQuery.data && (
              <Table>
                <TableHead>
                  <Th>Grado / Sede / Jornada</Th>
                  <Th className="text-center font-bold">Capacidad Total</Th>
                  <Th className="text-center font-bold">Matriculados Reales</Th>
                  <Th className="text-center font-bold">Solicitudes en Espera</Th>
                  <Th className="text-center font-bold">Cupos Libres</Th>
                </TableHead>
                <TableBody>
                  {disponibilidadQuery.data.filas.length === 0 ? (
                    <EmptyRow colSpan={5}>No hay grupos configurados para este año lectivo.</EmptyRow>
                  ) : (
                    disponibilidadQuery.data.filas.map((f, i) => (
                      <tr key={i}>
                        <Td>
                          <div className="font-semibold text-ink">{f.grado.nombre}</div>
                          <div className="text-xs text-muted">{f.sede.nombre} · {f.jornada.nombre}</div>
                        </Td>
                        <Td className="text-center text-sm font-semibold">{f.capacidad_total}</Td>
                        <Td className="text-center text-sm">{f.matriculados_reales}</Td>
                        <Td className="text-center text-sm text-orange-600 font-medium">{f.solicitudes_espera}</Td>
                        <Td className="text-center text-sm font-bold text-ink">{f.cupos_libres}</Td>
                      </tr>
                    ))
                  )}
                </TableBody>
              </Table>
            )}
          </div>
        </Card>
      )}

      {/* Drawer: Formalizar Matrícula / Aprobar */}
      {matriculando && (
        <Drawer
          open
          title={`Formalizar Matrícula — ${matriculando.nombre_aspirante} ${matriculando.apellido_aspirante}`}
          size="lg"
          onClose={() => setMatriculando(null)}
          onSubmit={handleMatricular}
          submitLabel={traeTodos === 'SI' ? 'Asentar Matrícula Definitiva' : traeTodos === 'NO' ? 'Asentar Matrícula Condicional' : 'Selecciona entrega de documentos'}
          submitDisabled={!groupId || !traeTodos || (traeTodos === 'NO' && !fechaLimiteCompromiso)}
          isSubmitting={matricular.isPending}
        >
          {matricular.isError && <Alert tone="error">{errorMessage(matricular.error)}</Alert>}

          <div className="space-y-4">
            <div className="rounded-lg border border-border p-3 text-sm space-y-1 bg-surface-subtle">
              <div><strong>Aspirante:</strong> {matriculando.nombre_aspirante} {matriculando.apellido_aspirante} ({matriculando.tipo_documento} {matriculando.numero_documento})</div>
              <div><strong>Grado deseado:</strong> {nombreDe(matriculando.grado_deseado_id)}</div>
              <div><strong>Preferencia:</strong> {sedeYJornadaPedidas(matriculando)}</div>
            </div>

            <Select
              label="Grupo asignado"
              required
              value={groupId}
              onChange={(e) => setGroupId(e.target.value)}
              hint={groupsQuery.isLoading ? 'Cargando grupos...' : !groupsQuery.data?.length ? 'No hay grupos activos en este grado.' : undefined}
            >
              <option value="">Selecciona el grupo...</option>
              {gruposParaMatricular.map(({ g, loPedido }) => (
                <option key={g._id} value={g._id}>
                  {g.nomenclatura} · {typeof g.sede_id === 'object' ? g.sede_id.nombre : 'Sede'} · {typeof g.jornada_id === 'object' ? g.jornada_id.nombre : 'Jornada'} ({g.cupos_ocupados}/{g.max_capacity} cupos) {loPedido ? '★ Preferido' : ''}
                </option>
              ))}
            </Select>

            <DocumentosPrevistos
              groupId={groupId}
              tipoIngreso="NUEVO"
              traeTodos={traeTodos}
              onChange={setTraeTodos}
            />
            {traeTodos === 'NO' && (
              <Input
                label="Fecha límite del compromiso"
                type="date"
                required
                value={fechaLimiteCompromiso}
                onChange={(e) => setFechaLimiteCompromiso(e.target.value)}
                hint="Plazo otorgado al acudiente para entregar los documentos pendientes."
              />
            )}

            <Alert tone="info">
              Al formalizar la matrícula, el sistema asignará correlativamente el <strong>Libro</strong> y <strong>Folio</strong> correspondiente y creará la cuenta institucional del estudiante y acudiente.
            </Alert>
          </div>
        </Drawer>
      )}

      {/* Drawer: Rechazar */}
      {rechazando && (
        <Drawer
          open
          title={`Rechazar Solicitud — ${rechazando.nombre_aspirante} ${rechazando.apellido_aspirante}`}
          onClose={() => setRechazando(null)}
          onSubmit={handleRechazar}
          submitLabel="Confirmar Rechazo"
          isSubmitting={rechazar.isPending}
        >
          {rechazar.isError && <Alert tone="error">{errorMessage(rechazar.error)}</Alert>}
          <Input
            label="Motivo del rechazo"
            required
            value={motivo}
            onChange={(e) => setMotivo(e.target.value)}
            placeholder="Ej: No disponibilidad de cupo en la sede solicitada..."
          />
        </Drawer>
      )}

      <InscripcionDrawer open={inscribiendo} onClose={() => setInscribiendo(false)} />
      <SolicitudDocumentosDrawer solicitud={documentosDe} onClose={() => setDocumentosDe(null)} />
    </div>
  );
}
