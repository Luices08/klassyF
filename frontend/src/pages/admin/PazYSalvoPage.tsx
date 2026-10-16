import { type ChangeEvent, useEffect, useState } from 'react';
import { Alert, errorMessage } from '../../components/ui/Alert';
import { Chip } from '../../components/ui/Badge';
import type { Tone } from '../../components/ui/Badge';
import { Button } from '../../components/ui/Button';
import { Card } from '../../components/ui/Card';
import { Drawer } from '../../components/ui/Drawer';
import { Input, Select } from '../../components/ui/Field';
import { IconButton } from '../../components/ui/IconButton';
import { PageHeader } from '../../components/ui/PageHeader';
import { Spinner } from '../../components/ui/Spinner';
import { EmptyRow, Table, TableBody, TableHead, Td, Th } from '../../components/ui/Table';
import { CheckCircleIcon, FileTextIcon, UploadIcon, XCircleIcon } from '../../components/ui/icons';
import { useAnioDeTrabajo } from '../../hooks/useAniosLectivos';
import { useGroups } from '../../hooks/useGroups';
import {
  abrirArchivoPazYSalvo,
  type FilaPazYSalvo,
  type FiltroEstadoPazYSalvo,
  NOMBRES_ESTADO_PAZ_Y_SALVO,
  useCargarPazYSalvo,
  usePazYSalvo,
  useRevisarPazYSalvo,
} from '../../hooks/usePazYSalvo';
import { formatoFechaHora } from '../../lib/fechas';

const PAGE_SIZE = 25;

const TONO_ESTADO: Record<FiltroEstadoPazYSalvo, Tone> = {
  SIN_CARGAR: 'neutral',
  CARGADO: 'blue',
  CONFIRMADO: 'green',
  RECHAZADO: 'red',
};

const NOMBRES_ROL: Record<string, string> = {
  ADMIN: 'Administración',
  COORDINADOR: 'Coordinación',
  SECRETARIA: 'Secretaría',
  DOCENTE: 'Docente',
};

function QuienYCuando({ nombre, rol, fecha }: { nombre: string | null; rol: string | null; fecha: string | null }) {
  if (!fecha) return <span className="text-muted">—</span>;
  return (
    <>
      <span className="block text-body">{nombre ?? '—'}{rol ? ` (${NOMBRES_ROL[rol] ?? rol})` : ''}</span>
      <span className="block text-xs text-muted">{formatoFechaHora(fecha)}</span>
    </>
  );
}

/**
 * Paz y salvo de fin de año (M04): se confirma por estudiante cuando termina el periodo final y lo lee la matrícula del año
 * siguiente, que aprueba sola ese documento. Quién lo gestiona (solo secretaría, o también los docentes) lo decide la
 * institución en Configuración institucional.
 */
export function PazYSalvoPage() {
  const { anio, query: aniosQuery } = useAnioDeTrabajo();
  const [grupo, setGrupo] = useState('');
  const [estado, setEstado] = useState<FiltroEstadoPazYSalvo | ''>('');
  const [busquedaInput, setBusquedaInput] = useState('');
  const [busqueda, setBusqueda] = useState('');
  const [page, setPage] = useState(1);

  useEffect(() => {
    const espera = setTimeout(() => {
      setBusqueda(busquedaInput);
      setPage(1);
    }, 300);
    return () => clearTimeout(espera);
  }, [busquedaInput]);

  const anioId = anio?._id;
  const lista = usePazYSalvo({
    academic_year_id: anioId,
    group_id: grupo || undefined,
    estado: estado || undefined,
    search: busqueda || undefined,
    page,
    limit: PAGE_SIZE,
  });
  const grupos = useGroups({ academic_year_id: anioId });
  const cargar = useCargarPazYSalvo();
  const revisar = useRevisarPazYSalvo();

  const [rechazando, setRechazando] = useState<FilaPazYSalvo | null>(null);
  const [motivo, setMotivo] = useState('');

  const puede = lista.data?.puede;
  const resumen = lista.data?.resumen;

  function handleArchivo(fila: FilaPazYSalvo, e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file || !anioId) return;
    cargar.reset();
    cargar.mutate({ studentId: fila.student_id, anioId, file });
  }

  function cerrarRechazo() {
    setRechazando(null);
    setMotivo('');
  }

  if (aniosQuery.isLoading) return <Spinner />;

  const error = cargar.isError ? cargar.error : revisar.isError ? revisar.error : null;

  return (
    <div className="space-y-4">
      <PageHeader
        title="Paz y salvo de fin de año"
        subtitle={anio ? `Estudiantes matriculados en ${anio.year}. Al confirmarlo, su matrícula del año siguiente aprueba sola ese documento.` : undefined}
      />

      <Alert tone="warning">
        Este módulo se usa al terminar el periodo final del año lectivo, cuando ya se sabe quién queda a paz y salvo con la institución. Antes de eso no hay nada que confirmar.
      </Alert>

      {!anio && <Alert tone="warning">Aún no hay un año lectivo. Crea uno en «Año lectivo».</Alert>}
      {puede && !puede.ver && <Alert tone="info">{puede.motivo ?? 'No tienes acceso a este módulo.'}</Alert>}
      {error && <Alert tone="error">{errorMessage(error)}</Alert>}

      {anio && puede?.ver && (
        <>
          {resumen && (
            <div className="flex flex-wrap gap-2 text-sm">
              <Chip tone="neutral">{`${resumen.total} estudiantes`}</Chip>
              <Chip tone="green">{`${resumen.confirmado} confirmados`}</Chip>
              <Chip tone="blue">{`${resumen.cargado} por confirmar`}</Chip>
              <Chip tone="red">{`${resumen.rechazado} no confirmados`}</Chip>
              <Chip tone="neutral">{`${resumen.sin_cargar} sin cargar`}</Chip>
            </div>
          )}

          <Card>
            <div className="mb-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
              <Input label="Buscar" placeholder="Nombre o documento" value={busquedaInput} onChange={(e) => setBusquedaInput(e.target.value)} />
              <Select
                label="Grupo"
                value={grupo}
                onChange={(e) => {
                  setGrupo(e.target.value);
                  setPage(1);
                }}
              >
                <option value="">Todos</option>
                {(grupos.data ?? []).map((g) => (
                  <option key={g._id} value={g._id}>
                    {g.nomenclatura}
                  </option>
                ))}
              </Select>
              <Select
                label="Estado"
                value={estado}
                onChange={(e) => {
                  setEstado(e.target.value as FiltroEstadoPazYSalvo | '');
                  setPage(1);
                }}
              >
                <option value="">Todos</option>
                {(Object.keys(NOMBRES_ESTADO_PAZ_Y_SALVO) as FiltroEstadoPazYSalvo[]).map((k) => (
                  <option key={k} value={k}>
                    {NOMBRES_ESTADO_PAZ_Y_SALVO[k]}
                  </option>
                ))}
              </Select>
            </div>

            {lista.isLoading && <Spinner />}
            {lista.isError && <Alert tone="error">{errorMessage(lista.error)}</Alert>}
            {lista.data && (
              <>
                <Table>
                  <TableHead>
                    <tr>
                      <Th>Estudiante</Th>
                      <Th>Grupo</Th>
                      <Th>Estado</Th>
                      <Th>Cargado por</Th>
                      <Th>Revisado por</Th>
                      <Th className="text-right">Acciones</Th>
                    </tr>
                  </TableHead>
                  <TableBody>
                    {lista.data.data.map((f) => (
                      <tr key={f.student_id}>
                        <Td>
                          <span className="font-medium text-ink">
                            {f.nombre} {f.apellido}
                          </span>
                          <span className="block text-xs text-muted">{f.numero_documento}</span>
                        </Td>
                        <Td>{f.grupo ?? '—'}</Td>
                        <Td>
                          <Chip tone={TONO_ESTADO[f.estado]}>{NOMBRES_ESTADO_PAZ_Y_SALVO[f.estado]}</Chip>
                          {f.observacion && <span className="mt-1 block max-w-xs text-xs text-muted">{f.observacion}</span>}
                        </Td>
                        <Td>
                          <QuienYCuando nombre={f.cargado_por} rol={f.cargado_por_rol} fecha={f.fecha_carga} />
                        </Td>
                        <Td>
                          <QuienYCuando nombre={f.revisado_por} rol={f.revisado_por_rol} fecha={f.fecha_revision} />
                        </Td>
                        <Td>
                          <div className="flex justify-end gap-2">
                            {puede.cargar && f.estado !== 'CONFIRMADO' && (
                              <label
                                className="inline-flex h-8 w-8 cursor-pointer items-center justify-center rounded-full bg-soft text-body hover:bg-border/60"
                                title={f.tiene_archivo ? 'Reemplazar archivo' : 'Cargar archivo'}
                              >
                                <input type="file" accept=".pdf,.jpg,.jpeg,.png,.webp" className="hidden" onChange={(e) => handleArchivo(f, e)} />
                                <UploadIcon className="h-4 w-4" />
                              </label>
                            )}
                            {f.tiene_archivo && f.paz_y_salvo_id && (
                              <IconButton tone="neutral" label="Ver archivo" icon={<FileTextIcon />} onClick={() => void abrirArchivoPazYSalvo(f.paz_y_salvo_id!)} />
                            )}
                            {puede.confirmar && f.estado !== 'CONFIRMADO' && (
                              <IconButton
                                tone="success"
                                label="Confirmar paz y salvo"
                                icon={<CheckCircleIcon />}
                                disabled={revisar.isPending}
                                onClick={() => {
                                  revisar.reset();
                                  if (anioId) revisar.mutate({ studentId: f.student_id, anioId, estado: 'CONFIRMADO' });
                                }}
                              />
                            )}
                            {puede.confirmar && f.estado !== 'RECHAZADO' && (f.estado !== 'CONFIRMADO' || puede.revocar) && (
                              <IconButton
                                tone="danger"
                                label={f.estado === 'CONFIRMADO' ? 'Quitar la confirmación' : 'No confirmar (queda debiendo)'}
                                icon={<XCircleIcon />}
                                onClick={() => setRechazando(f)}
                              />
                            )}
                          </div>
                        </Td>
                      </tr>
                    ))}
                    {lista.data.data.length === 0 && <EmptyRow colSpan={6}>No hay estudiantes para mostrar.</EmptyRow>}
                  </TableBody>
                </Table>

                {lista.data.pages > 1 && (
                  <div className="mt-3 flex items-center justify-between text-sm text-muted">
                    <span>
                      Página {lista.data.page} de {lista.data.pages} ({lista.data.total} estudiantes)
                    </span>
                    <div className="flex gap-2">
                      <Button variant="secondary" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
                        Anterior
                      </Button>
                      <Button variant="secondary" disabled={page >= lista.data.pages} onClick={() => setPage((p) => p + 1)}>
                        Siguiente
                      </Button>
                    </div>
                  </div>
                )}
              </>
            )}
          </Card>
        </>
      )}

      <Drawer
        open={rechazando !== null}
        title={rechazando?.estado === 'CONFIRMADO' ? 'Quitar la confirmación' : 'No confirmar el paz y salvo'}
        subtitle={rechazando ? `${rechazando.nombre} ${rechazando.apellido}` : undefined}
        onClose={cerrarRechazo}
        onSubmit={(e) => {
          e.preventDefault();
          if (!rechazando || !anioId) return;
          revisar.reset();
          revisar.mutate({ studentId: rechazando.student_id, anioId, estado: 'RECHAZADO', observacion: motivo }, { onSuccess: cerrarRechazo });
        }}
        submitLabel="Guardar"
        submitVariant="soft-danger"
        isSubmitting={revisar.isPending}
        submitDisabled={!motivo.trim()}
      >
        <Input label="Motivo (qué debe o por qué se quita)" required value={motivo} onChange={(e) => setMotivo(e.target.value)} />
        {rechazando?.estado === 'CONFIRMADO' && (
          <Alert tone="warning">Si ya tiene matrícula del año siguiente, el documento que se aprobó solo vuelve a quedar pendiente.</Alert>
        )}
      </Drawer>
    </div>
  );
}
