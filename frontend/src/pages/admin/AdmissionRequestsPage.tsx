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
import { FileTextIcon, PlusIcon, XCircleIcon } from '../../components/ui/icons';
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
import { useGrades } from '../../hooks/useCatalogs';
import { ETIQUETA_JORNADA } from '../../hooks/useCertificados';
import { useGroups } from '../../hooks/useGroups';
import { ESTADOS_SOLICITUD, type AdmissionRequest, type EstadoSolicitud } from '../../types/domain';

const ESTADO_TONE: Record<EstadoSolicitud, 'blue' | 'green' | 'red' | 'orange'> = {
  PENDIENTE: 'orange',
  ADMITIDO: 'green',
  MATRICULADO: 'green',
  RECHAZADA: 'red',
};

function nombreDe(v: string | { nombre: string }): string {
  return typeof v === 'string' ? v : v.nombre;
}

function sedeYJornadaPedidas(s: AdmissionRequest): string {
  const sede = s.sede_deseada_id ? nombreDe(s.sede_deseada_id) : null;
  const jornada = s.jornada_deseada ? (ETIQUETA_JORNADA[s.jornada_deseada] ?? s.jornada_deseada) : null;
  return [sede, jornada].filter(Boolean).join(' · ') || 'Sin preferencia';
}

export function AdmissionRequestsPage() {
  const { anio: anioTrabajo } = useAnioDeTrabajo();
  const anioId = anioTrabajo?._id;

  const [pestana, setPestana] = useState<'solicitudes' | 'cupos'>('solicitudes');
  const [filterEstado, setFilterEstado] = useState<EstadoSolicitud | ''>('');
  const [filterAnio, setFilterAnio] = useState('');
  const [filterGrado, setFilterGrado] = useState('');
  const [busqueda, setBusqueda] = useState('');
  const [page, setPage] = useState(1);

  const aniosQuery = useAniosLectivos();
  const aniosAbiertos = [...(aniosQuery.data ?? [])].filter((a) => a.estado !== 'CERRADO').sort((a, b) => b.year - a.year);
  const anioActualYear = anioTrabajo?.year ?? new Date().getFullYear();

  const gradosQuery = useGrades('activo');

  const filter: AdmissionRequestsFilter = {
    estado: filterEstado || undefined,
    academic_year_id: filterAnio || undefined,
    grade_id: filterGrado || undefined,
    page,
    limit: 20,
    search: busqueda.trim() || undefined,
  };
  const listQuery = useAdmissionRequestsList(filter);

  const [inscribiendo, setInscribiendo] = useState(false);
  const [solicitudDocumentos, setSolicitudDocumentos] = useState<AdmissionRequest | null>(null);

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

  // Sede y jornada preferida para ordenar grupos
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

  // Pestaña Cupos: selector de año
  const [anioCuposId, setAnioCuposId] = useState('');
  const anioCuposSeleccionado = anioCuposId || aniosAbiertos[0]?._id || anioId;
  const disponibilidadQuery = useDisponibilidadCupos(anioCuposSeleccionado);

  return (
    <div className="space-y-4">
      <PageHeader
        title="Admisiones y Solicitudes de Cupo"
        subtitle="Gestión de solicitudes radicadas, asignación reglamentaria de vacantes y control de aforo por salones."
      />

      <Tabs
        items={[
          { key: 'solicitudes', label: 'Solicitudes' },
          { key: 'cupos', label: 'Disponibilidad de cupos' },
        ]}
        value={pestana}
        onChange={(v) => setPestana(v as 'solicitudes' | 'cupos')}
      />

      {pestana === 'solicitudes' && (
        <>
          <Card>
            <CardHeader
              title="Solicitudes de admisión"
              subtitle="Revisa y gestiona los aspirantes. Para el año en curso puedes matricular directamente; para el año lectivo siguiente puedes admitir antes de formalizar en ventanilla."
              action={
                <Button  onClick={() => setInscribiendo(true)}>
                  <PlusIcon className="mr-1 h-4 w-4" />
                  Nueva inscripción en mostrador
                </Button>
              }
            />

            {/* Filtros */}
            <div className="grid grid-cols-1 gap-3 p-4 border-b border-border sm:grid-cols-4">
              <Select label="Año lectivo" value={filterAnio} onChange={(e) => { setFilterAnio(e.target.value); setPage(1); }}>
                <option value="">Todos los años</option>
                {aniosAbiertos.map((a) => (
                  <option key={a._id} value={a._id}>
                    Año {a.year} ({a.estado})
                  </option>
                ))}
              </Select>

              <Select label="Grado deseado" value={filterGrado} onChange={(e) => { setFilterGrado(e.target.value); setPage(1); }}>
                <option value="">Todos los grados</option>
                {(gradosQuery.data ?? []).map((g) => (
                  <option key={g._id} value={g._id}>
                    {g.nombre}
                  </option>
                ))}
              </Select>

              <Select label="Estado" value={filterEstado} onChange={(e) => { setFilterEstado(e.target.value as EstadoSolicitud); setPage(1); }}>
                <option value="">Todos los estados</option>
                {ESTADOS_SOLICITUD.map((est) => (
                  <option key={est} value={est}>
                    {est}
                  </option>
                ))}
              </Select>

              <Input
                label="Buscar por nombre o documento"
                placeholder="Nombre, apellido o documento..."
                value={busqueda}
                onChange={(e) => { setBusqueda(e.target.value); setPage(1); }}
              />
            </div>

            {/* Tabla de solicitudes */}
            <div className="overflow-x-auto">
              <Table>
                <TableHead>
                  <Th>Aspirante</Th>
                  <Th>Grado y Año</Th>
                  <Th>Sede y Jornada</Th>
                  <Th>Acudiente</Th>
                  <Th>Documentos</Th>
                  <Th>Estado</Th>
                  <Th className="text-right">Acciones</Th>
                </TableHead>
                <TableBody>
                  {listQuery.isLoading && (
                    <tr>
                      <Td colSpan={7}>
                        <div className="flex justify-center p-4">
                          <Spinner />
                        </div>
                      </Td>
                    </tr>
                  )}
                  {listQuery.isError && (
                    <tr>
                      <Td colSpan={7}>
                        <Alert tone="error">{errorMessage(listQuery.error)}</Alert>
                      </Td>
                    </tr>
                  )}
                  {listQuery.data?.data.length === 0 && <EmptyRow colSpan={7}>No hay solicitudes con los filtros elegidos.</EmptyRow>}
                  {listQuery.data?.data.map((sol) => {
                    const solAnioYear = typeof sol.academic_year_id === 'object' && sol.academic_year_id
                      ? (sol.academic_year_id as { year?: number }).year
                      : undefined;
                    const esAnioSiguiente = solAnioYear !== undefined && solAnioYear > anioActualYear;

                    return (
                      <tr key={sol._id} className="hover:bg-surface-hover">
                        <Td>
                          <div className="font-semibold text-ink">
                            {sol.nombre_aspirante} {sol.apellido_aspirante}
                          </div>
                          <div className="text-xs text-muted">
                            {sol.tipo_documento} {sol.numero_documento}
                          </div>
                        </Td>
                        <Td>
                          <div className="text-sm font-medium text-ink">{nombreDe(sol.grado_deseado_id)}</div>
                          <div className="text-xs text-muted">
                            {solAnioYear ? `Año ${solAnioYear}` : 'Vigencia actual'}
                          </div>
                        </Td>
                        <Td>
                          <span className="text-xs text-muted">{sedeYJornadaPedidas(sol)}</span>
                        </Td>
                        <Td>
                          <div className="text-sm text-ink">{sol.acudiente_nombre} {sol.acudiente_apellido}</div>
                          <div className="text-xs text-muted">{sol.acudiente_telefono}</div>
                        </Td>
                        <Td>
                          <button
                            type="button"
                            onClick={() => setSolicitudDocumentos(sol)}
                            className="inline-flex items-center gap-1.5 text-xs font-semibold text-primary hover:underline"
                          >
                            <FileTextIcon className="h-4 w-4" />
                            <span>{sol.documentos?.length ?? 0} archivo(s)</span>
                          </button>
                        </Td>
                        <Td>
                          <Chip tone={ESTADO_TONE[sol.estado] ?? 'neutral'}>{sol.estado}</Chip>
                        </Td>
                        <Td className="text-right">
                          <div className="flex items-center justify-end gap-1.5">
                            {/* Solicitudes del año en curso */}
                            {!esAnioSiguiente && sol.estado === 'PENDIENTE' && (
                              <>
                                <Button
                                  
                                  onClick={() => {
                                    setMatriculando(sol);
                                    setGroupId('');
                                    setTraeTodos('');
                                    setFechaLimiteCompromiso('');
                                  }}
                                >
                                  Aprobar y Matricular
                                </Button>
                                <IconButton
                                  label="Rechazar solicitud"
                                  tone="danger"
                                  icon={<XCircleIcon />}
                                  onClick={() => setRechazando(sol)}
                                />
                              </>
                            )}

                            {/* Solicitudes del año siguiente */}
                            {esAnioSiguiente && sol.estado === 'PENDIENTE' && (
                              <>
                                <Button
                                  
                                  variant="secondary"
                                  disabled={admitir.isPending}
                                  onClick={() => handleAdmitir(sol)}
                                >
                                  Admitir
                                </Button>
                                <IconButton
                                  label="Rechazar solicitud"
                                  tone="danger"
                                  icon={<XCircleIcon />}
                                  onClick={() => setRechazando(sol)}
                                />
                              </>
                            )}

                            {/* Solicitudes ya admitidas (del año siguiente) para formalizar cuando asisten a ventanilla */}
                            {sol.estado === 'ADMITIDO' && (
                              <Button
                                
                                onClick={() => {
                                  setMatriculando(sol);
                                  setGroupId('');
                                  setTraeTodos('');
                                  setFechaLimiteCompromiso('');
                                }}
                              >
                                Formalizar y Matricular
                              </Button>
                            )}

                            {sol.estado === 'MATRICULADO' && (
                              <span className="text-xs text-success font-medium">Matrícula formalizada</span>
                            )}
                            {sol.estado === 'RECHAZADA' && (
                              <span className="text-xs text-error font-medium truncate max-w-[120px]" title={sol.motivo_rechazo ?? ''}>
                                {sol.motivo_rechazo ?? 'Rechazada'}
                              </span>
                            )}
                          </div>
                        </Td>
                      </tr>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          </Card>

          {/* Drawer: Formalizar Matrícula / Aprobar y Matricular */}
          <Drawer
            open={matriculando !== null}
            title={matriculando?.estado === 'ADMITIDO' ? 'Formalizar matrícula en ventanilla' : 'Aprobar y matricular aspirante'}
            subtitle={matriculando ? `${matriculando.nombre_aspirante} ${matriculando.apellido_aspirante} · ${matriculando.tipo_documento} ${matriculando.numero_documento}` : undefined}
            size="md"
            onClose={() => setMatriculando(null)}
            onSubmit={handleMatricular}
            submitLabel="Asentar matrícula y folio"
            isSubmitting={matricular.isPending}
            submitDisabled={!groupId || !traeTodos || (traeTodos === 'NO' && !fechaLimiteCompromiso)}
          >
            {matricular.isError && <Alert tone="error">{errorMessage(matricular.error)}</Alert>}

            {matriculando && (
              <div className="space-y-4">
                <div className="rounded-lg border border-border p-3 space-y-1 bg-surface-subtle text-xs">
                  <p><strong>Grado:</strong> {nombreDe(matriculando.grado_deseado_id)}</p>
                  <p><strong>Preferencia:</strong> {sedeYJornadaPedidas(matriculando)}</p>
                  <p><strong>Acudiente:</strong> {matriculando.acudiente_nombre} {matriculando.acudiente_apellido} ({matriculando.acudiente_telefono})</p>
                </div>

                <Select
                  label="Salón / Grupo asignado"
                  required
                  value={groupId}
                  onChange={(e) => setGroupId(e.target.value)}
                >
                  <option value="">Selecciona un grupo con cupo disponible...</option>
                  {gruposParaMatricular.map(({ g, loPedido }) => {
                    const cuposLibres = Math.max(0, g.max_capacity - g.cupos_ocupados);
                    return (
                      <option key={g._id} value={g._id} disabled={cuposLibres <= 0}>
                        {g.nomenclatura} — {cuposLibres} cupo(s) libre(s)
                        {loPedido ? ' (coincide con sede y jornada pedidas)' : ''}
                      </option>
                    );
                  })}
                </Select>

                {/* Documentos previstos según grado */}
                <DocumentosPrevistos
                  groupId={groupId}
                  tipoIngreso="NUEVO"
                  traeTodos={traeTodos}
                  onChange={(v) => setTraeTodos(v)}
                />

                {traeTodos === 'NO' && (
                  <Input
                    label="Fecha límite del acta de compromiso"
                    type="date"
                    required
                    min={new Date().toISOString().slice(0, 10)}
                    value={fechaLimiteCompromiso}
                    onChange={(e) => setFechaLimiteCompromiso(e.target.value)}
                    hint="La matrícula nace condicional. Plazo máximo legal para que el acudiente radique los documentos adeudados."
                  />
                )}

                {traeTodos === 'SI' && (
                  <Alert tone="success">
                    La matrícula quedará asentada como <strong>DEFINITIVA</strong> en el sistema, generando Libro y Folio reglamentario.
                  </Alert>
                )}
              </div>
            )}
          </Drawer>

          {/* Drawer: Rechazar solicitud */}
          <Drawer
            open={rechazando !== null}
            title="Rechazar solicitud"
            onClose={() => setRechazando(null)}
            onSubmit={handleRechazar}
            submitLabel="Confirmar rechazo"
            isSubmitting={rechazar.isPending}
            submitDisabled={!motivo.trim()}
          >
            {rechazar.isError && <Alert tone="error">{errorMessage(rechazar.error)}</Alert>}
            <p className="text-sm text-ink mb-3">
              Indica el motivo por el cual no se concede el cupo a {rechazando?.nombre_aspirante} {rechazando?.apellido_aspirante}.
              La familia podrá visualizar este mensaje en la consulta pública.
            </p>
            <Input
              label="Motivo del rechazo"
              required
              value={motivo}
              onChange={(e) => setMotivo(e.target.value)}
              placeholder="Ej: No disponibilidad de cupo en la sede solicitada..."
            />
          </Drawer>

          <InscripcionDrawer open={inscribiendo} onClose={() => setInscribiendo(false)} />
          <SolicitudDocumentosDrawer solicitud={solicitudDocumentos} onClose={() => setSolicitudDocumentos(null)} />
        </>
      )}

      {/* Pestaña: Disponibilidad de cupos (Tabla limpia de 4 columnas) */}
      {pestana === 'cupos' && (
        <Card>
          <CardHeader
            title="Disponibilidad de cupos"
            subtitle="Cálculo directo de capacidad y vacantes reales. Capacidad Total − Matriculados Reales = Cupos Libres."
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
                      <tr key={i} className="hover:bg-surface-hover">
                        <Td>
                          <div className="font-semibold text-ink">{f.grado.nombre}</div>
                          <div className="text-xs text-muted">{f.sede.nombre} · {f.jornada.nombre}</div>
                        </Td>
                        <Td className="text-center text-sm font-semibold">{f.capacidad_total}</Td>
                        <Td className="text-center text-sm">{f.matriculados_reales}</Td>
                        <Td className="text-center text-sm text-orange-600 font-medium">{f.solicitudes_espera}</Td>
                        <Td className="text-center text-sm font-bold text-ink">
                          <span className={f.cupos_libres > 0 ? 'text-success font-bold' : 'text-error font-bold'}>
                            {f.cupos_libres}
                          </span>
                        </Td>
                      </tr>
                    ))
                  )}
                  {/* Totales */}
                  {disponibilidadQuery.data.filas.length > 0 && (
                    <tr className="bg-surface-subtle font-bold border-t-2 border-border">
                      <Td className="text-ink font-bold">TOTALES INSTITUCIONALES</Td>
                      <Td className="text-center text-sm font-bold text-ink">{disponibilidadQuery.data.totales.capacidad_total}</Td>
                      <Td className="text-center text-sm font-bold text-ink">{disponibilidadQuery.data.totales.matriculados_reales}</Td>
                      <Td className="text-center text-sm font-bold text-orange-600">{disponibilidadQuery.data.totales.solicitudes_espera}</Td>
                      <Td className="text-center text-sm font-bold text-success">{disponibilidadQuery.data.totales.cupos_libres}</Td>
                    </tr>
                  )}
                </TableBody>
              </Table>
            )}
          </div>
        </Card>
      )}
    </div>
  );
}
