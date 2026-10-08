import { type FormEvent, useState } from 'react';
import {
  descargarPdfHorario,
  useDetalleHorario,
  useEditarSesion,
  useEliminarHorario,
  useGenerarHorario,
  usePublicarHorario,
  useVersionesHorario,
  type ContextoHorario,
} from '../../hooks/useHorarios';
import { formatoFechaHora } from '../../lib/fechas';
import { NOMBRES_DIA_SEMANA } from '../../types/domain';
import type { EstadoHorario, ResumenHorario, SesionHorario, VistaPdfHorario } from '../../types/horarios';
import { Alert, errorMessage } from '../ui/Alert';
import { Button } from '../ui/Button';
import { Chip, type Tone } from '../ui/Badge';
import { Card, CardHeader } from '../ui/Card';
import { Drawer } from '../ui/Drawer';
import { Input, Select } from '../ui/Field';
import { IconButton } from '../ui/IconButton';
import { Spinner } from '../ui/Spinner';
import { EmptyRow, Table, TableBody, TableHead, Td, Th } from '../ui/Table';
import { CheckCircleIcon, EyeIcon, FileTextIcon, LockIcon, RefreshIcon, TrashIcon } from '../ui/icons';
import { MallaHorario, type VistaHorario } from './MallaHorario';

const ESTADO: Record<EstadoHorario, { texto: string; tono: Tone }> = {
  GENERANDO: { texto: 'Generando…', tono: 'blue' },
  FALLIDO: { texto: 'Falló', tono: 'red' },
  BORRADOR: { texto: 'Borrador', tono: 'neutral' },
  PUBLICADO: { texto: 'Publicado', tono: 'green' },
  ARCHIVADO: { texto: 'Archivado', tono: 'neutral' },
};

const MAX_INCIDENCIAS = 15;
const conHorario = (e: EstadoHorario) => e !== 'GENERANDO' && e !== 'FALLIDO';

export function PanelVersiones({ contexto, puedeGenerar }: { contexto: ContextoHorario; puedeGenerar: boolean }) {
  const versionesQuery = useVersionesHorario(contexto);
  const generar = useGenerarHorario();
  const eliminar = useEliminarHorario();
  const [verId, setVerId] = useState<string | null>(null);
  const [publicando, setPublicando] = useState<ResumenHorario | null>(null);
  const versiones = versionesQuery.data ?? [];
  const generando = versiones.some((v) => v.estado === 'GENERANDO');
  const vista = versiones.find((v) => v._id === verId);

  async function handleGenerar(baseId?: string) {
    generar.reset();
    const nueva = await generar.mutateAsync({ ...contexto, base_horario_id: baseId });
    setVerId(nueva._id);
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader
          title="Versiones del horario"
          subtitle="Cada generación crea un borrador que puedes ajustar a mano. Publica el que quieras usar: el publicado anterior queda archivado."
          action={
            <Button onClick={() => handleGenerar()} isLoading={generar.isPending || generando} disabled={!puedeGenerar || generar.isPending || generando}>
              {generando ? 'Generando…' : 'Generar horario'}
            </Button>
          }
        />
        {generando && <Alert tone="info">El horario se está generando en segundo plano (hasta 10 segundos). Puedes seguir trabajando.</Alert>}
        {generar.isError && <Alert tone="error">{errorMessage(generar.error)}</Alert>}
        {eliminar.isError && <Alert tone="error">{errorMessage(eliminar.error)}</Alert>}
        {versionesQuery.isLoading && <Spinner />}

        <Table>
          <TableHead>
            <Th>Versión</Th>
            <Th>Estado</Th>
            <Th>Conflictos</Th>
            <Th>Preferencias</Th>
            <Th />
          </TableHead>
          <TableBody>
            {versiones.length === 0 && !versionesQuery.isLoading && (
              <EmptyRow colSpan={5}>Aún no hay versiones. Revisa los insumos y las variables, y genera el primer horario.</EmptyRow>
            )}
            {versiones.map((v) => (
              <tr key={v._id} className={verId === v._id ? 'bg-primary-soft/40' : ''}>
                <Td>
                  <p className="font-medium text-ink">{v.nombre}</p>
                  <p className="text-xs text-muted">{formatoFechaHora(v.createdAt)}</p>
                </Td>
                <Td>
                  <Chip tone={ESTADO[v.estado].tono}>{ESTADO[v.estado].texto}</Chip>
                </Td>
                <Td>
                  {v.estado === 'FALLIDO' ? (
                    <span className="text-xs text-danger">{v.error_generacion}</span>
                  ) : v.estado === 'GENERANDO' ? (
                    <span className="text-muted">—</span>
                  ) : v.conflictos_duros === 0 ? (
                    <Chip tone="green">Sin conflictos</Chip>
                  ) : (
                    <Chip tone="red">{v.conflictos_duros} conflicto(s)</Chip>
                  )}
                </Td>
                <Td>
                  {!conHorario(v.estado) ? (
                    <span className="text-muted">—</span>
                  ) : v.penalizacion_blanda === 0 ? (
                    <span className="text-muted">Todas cumplidas</span>
                  ) : (
                    <Chip tone="orange">Penalización {v.penalizacion_blanda}</Chip>
                  )}
                </Td>
                <Td>
                  <div className="flex justify-end gap-2">
                    <IconButton tone="edit" label="Ver horario" icon={<EyeIcon />} onClick={() => setVerId(v._id)} />
                    {(v.estado === 'BORRADOR' || v.estado === 'ARCHIVADO') && (
                      <IconButton
                        tone="success"
                        label={v.conflictos_duros > 0 ? 'Tiene conflictos: no se puede publicar' : 'Publicar'}
                        icon={<CheckCircleIcon />}
                        disabled={v.conflictos_duros > 0}
                        onClick={() => setPublicando(v)}
                      />
                    )}
                    {v.estado !== 'PUBLICADO' && v.estado !== 'GENERANDO' && (
                      <IconButton
                        tone="danger"
                        label="Eliminar versión"
                        icon={<TrashIcon />}
                        disabled={eliminar.isPending}
                        onClick={() => {
                          if (verId === v._id) setVerId(null);
                          eliminar.mutate(v._id);
                        }}
                      />
                    )}
                  </div>
                </Td>
              </tr>
            ))}
          </TableBody>
        </Table>
      </Card>

      {verId && vista && (
        <DetalleVersion
          id={verId}
          estado={vista.estado}
          generando={generando || generar.isPending}
          onRegenerar={() => void handleGenerar(verId)}
        />
      )}
      <PublicarDrawer version={publicando} onClose={() => setPublicando(null)} />
    </div>
  );
}

function DetalleVersion({ id, estado, generando, onRegenerar }: { id: string; estado: EstadoHorario; generando: boolean; onRegenerar: () => void }) {
  const detalleQuery = useDetalleHorario(id, estado);
  const editar = useEditarSesion();
  const [vista, setVista] = useState<VistaHorario>('GRUPO');
  const [entidadId, setEntidadId] = useState('');
  const [seleccion, setSeleccion] = useState<SesionHorario | null>(null);
  const [descargando, setDescargando] = useState(false);
  const [errorPdf, setErrorPdf] = useState<string | null>(null);

  if (estado === 'GENERANDO') {
    return (
      <Card>
        <Spinner label="Generando el horario…" />
      </Card>
    );
  }
  if (detalleQuery.isLoading) return <Spinner />;
  if (detalleQuery.isError) return <Alert tone="error">{errorMessage(detalleQuery.error)}</Alert>;
  const detalle = detalleQuery.data;
  if (!detalle) return null;
  if (estado === 'FALLIDO') return <Alert tone="error">{detalle.horario.error_generacion ?? 'La generación falló.'} Genera una versión nueva.</Alert>;

  const { horario, estructura, catalogo } = detalle;
  const duras = horario.incidencias.filter((i) => i.dura);
  const blandas = horario.incidencias.filter((i) => !i.dura);
  const enConflicto = new Set(duras.flatMap((i) => i.claves_sesion));
  const fijas = horario.sesiones.filter((s) => s.fija).length;
  const editable = horario.estado === 'BORRADOR' && vista !== 'GENERAL' && !detalle.franjas_cambiaron;
  const opciones = vista === 'GRUPO' ? catalogo.grupos.map((g) => ({ id: g._id, nombre: g.etiqueta })) : catalogo.docentes.map((d) => ({ id: d._id, nombre: d.nombre }));
  const elegido = opciones.find((o) => o.id === entidadId) ?? opciones[0];
  const nombreSesion = (s: SesionHorario) =>
    catalogo.asignaturas.find((a) => a._id === s.subject_id)?.nombre ?? catalogo.reuniones.find((r) => r._id === s.reunion_variable_id)?.nombre ?? 'Reunión';
  const enEdicion = seleccion ? horario.sesiones.find((s) => s._id === seleccion._id) : undefined;

  function mover(dia: number, periodo: number) {
    if (!seleccion) return;
    editar.mutate({ horarioId: id, sesionId: seleccion._id, dia, periodo }, { onSuccess: () => setSeleccion(null) });
  }

  function intercambiar(otra: SesionHorario) {
    if (!seleccion) return;
    editar.mutate({ horarioId: id, sesionId: seleccion._id, intercambiar_con: otra._id }, { onSuccess: () => setSeleccion(null) });
  }

  async function descargar(vistaPdf: VistaPdfHorario, entidad?: string) {
    setErrorPdf(null);
    setDescargando(true);
    try {
      const sufijo = entidad ? (opciones.find((o) => o.id === entidad)?.nombre ?? '') : vistaPdf === 'GENERAL' ? 'general' : vistaPdf === 'GRUPO' ? 'grupos' : 'docentes';
      await descargarPdfHorario(id, vistaPdf, entidad, `${horario.nombre} - ${sufijo}.pdf`);
    } catch (err) {
      setErrorPdf(errorMessage(err));
    } finally {
      setDescargando(false);
    }
  }

  return (
    <Card>
      <CardHeader
        title={horario.nombre}
        subtitle={horario.generacion ? `Generado en ${(horario.generacion.duracion_ms / 1000).toFixed(1)} s · ${horario.sesiones.length} sesiones` : undefined}
        action={
          <div className="flex flex-wrap justify-end gap-2">
            <Button variant="outline" isLoading={descargando} disabled={descargando} onClick={() => void descargar(vista === 'GENERAL' ? 'GENERAL' : vista, vista === 'GENERAL' ? undefined : elegido?.id)}>
              <FileTextIcon className="h-4 w-4" />
              Descargar PDF
            </Button>
            {vista !== 'GENERAL' && (
              <Button variant="secondary" disabled={descargando} onClick={() => void descargar(vista)}>
                {vista === 'GRUPO' ? 'PDF de todos los grupos' : 'PDF de todos los docentes'}
              </Button>
            )}
          </div>
        }
      />
      <div className="space-y-4">
        {errorPdf && <Alert tone="error">{errorPdf}</Alert>}
        {detalle.franjas_cambiaron && (
          <Alert tone="warning">Las franjas de la jornada cambiaron después de generar esta versión. Genera una nueva antes de editar o publicar.</Alert>
        )}
        {horario.avisos.length > 0 && (
          <Alert tone="warning">
            <ul className="list-disc space-y-1 pl-4">
              {horario.avisos.map((a, i) => (
                <li key={i}>{a.mensaje}</li>
              ))}
            </ul>
          </Alert>
        )}
        {duras.length > 0 && (
          <Alert tone="error">
            <p className="font-semibold">Conflictos que impiden publicar (resaltados en rojo):</p>
            <ul className="mt-1 list-disc space-y-1 pl-4">
              {duras.slice(0, MAX_INCIDENCIAS).map((i, k) => (
                <li key={k}>{i.mensaje}</li>
              ))}
            </ul>
            {duras.length > MAX_INCIDENCIAS && <p className="mt-1">Y {duras.length - MAX_INCIDENCIAS} más.</p>}
          </Alert>
        )}
        {blandas.length > 0 && (
          <details className="rounded-lg bg-soft p-3 text-sm text-body">
            <summary className="cursor-pointer font-medium">{blandas.length} preferencia(s) sin cumplir del todo</summary>
            <ul className="mt-2 list-disc space-y-1 pl-4">
              {blandas.slice(0, MAX_INCIDENCIAS).map((i, k) => (
                <li key={k}>{i.mensaje}</li>
              ))}
            </ul>
          </details>
        )}

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <Select
            label="Ver"
            value={vista}
            onChange={(e) => {
              setVista(e.target.value as VistaHorario);
              setSeleccion(null);
            }}
          >
            <option value="GRUPO">Por grupo</option>
            <option value="DOCENTE">Por docente</option>
            <option value="GENERAL">General (todos los docentes)</option>
          </Select>
          {vista !== 'GENERAL' && (
            <Select
              label={vista === 'GRUPO' ? 'Grupo' : 'Docente'}
              value={elegido?.id ?? ''}
              onChange={(e) => {
                setEntidadId(e.target.value);
                setSeleccion(null);
              }}
            >
              {opciones.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.nombre}
                </option>
              ))}
            </Select>
          )}
        </div>

        {editable && (
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border bg-soft/60 p-3 text-sm text-body">
            {enEdicion ? (
              <>
                <span>
                  <span className="font-semibold text-ink">{nombreSesion(enEdicion)}</span> · {NOMBRES_DIA_SEMANA[enEdicion.dia]}, {estructura.periodos[enEdicion.periodo]?.nombre}.
                  Elige otra sesión de igual duración (borde punteado) para intercambiarlas, o una franja libre para moverla.
                </span>
                <span className="flex gap-2">
                  <Button
                    variant="soft-edit"
                    disabled={editar.isPending}
                    onClick={() => editar.mutate({ horarioId: id, sesionId: enEdicion._id, fija: !enEdicion.fija })}
                  >
                    <LockIcon className="h-4 w-4" />
                    {enEdicion.fija ? 'Soltar' : 'Fijar'}
                  </Button>
                  <Button variant="secondary" onClick={() => setSeleccion(null)}>
                    Cancelar
                  </Button>
                </span>
              </>
            ) : (
              <>
                <span>Haz clic en una sesión para intercambiarla, moverla o fijarla. Lo que cambies a mano queda fijado y se respeta al regenerar.</span>
                {fijas > 0 && (
                  <Button variant="outline" disabled={generando} onClick={onRegenerar}>
                    <RefreshIcon className="h-4 w-4" />
                    Regenerar respetando {fijas} fija(s)
                  </Button>
                )}
              </>
            )}
          </div>
        )}
        {editar.isError && <Alert tone="error">{errorMessage(editar.error)}</Alert>}

        <MallaHorario
          estructura={estructura}
          sesiones={horario.sesiones}
          catalogo={catalogo}
          vista={vista}
          entidadId={elegido?.id ?? ''}
          enConflicto={enConflicto}
          edicion={editable ? { seleccionadaId: seleccion?._id ?? null, onSeleccionar: setSeleccion, onDestino: mover, onIntercambiar: intercambiar, ocupado: editar.isPending } : undefined}
        />
      </div>
    </Card>
  );
}

function PublicarDrawer({ version, onClose }: { version: ResumenHorario | null; onClose: () => void }) {
  const publicar = usePublicarHorario();
  const [password, setPassword] = useState('');

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!version) return;
    await publicar.mutateAsync({ id: version._id, confirm_password: password });
    setPassword('');
    onClose();
  }

  return (
    <Drawer
      open={version !== null}
      title="Publicar horario"
      subtitle={version?.nombre}
      onClose={() => {
        publicar.reset();
        setPassword('');
        onClose();
      }}
      onSubmit={handleSubmit}
      submitLabel="Publicar"
      isSubmitting={publicar.isPending}
      submitDisabled={!password}
    >
      <div className="space-y-4 text-sm text-body">
        {publicar.isError && <Alert tone="error">{errorMessage(publicar.error)}</Alert>}
        <p>
          Antes de publicar se revisa de nuevo contra la carga académica, las franjas y las variables actuales. Si algo cambió y genera
          conflictos, no se publica. La versión publicada anterior queda archivada, y docentes, estudiantes y acudientes verán esta en
          «Mi horario».
        </p>
        <Input id="publicar-password" label="Tu contraseña" type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} required />
      </div>
    </Drawer>
  );
}
