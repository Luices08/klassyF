import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { ComentariosActividad } from '../components/actividades/ComentariosActividad';
import { ContenidoDeActividad } from '../components/actividades/ContenidoDeActividad';
import { Alert, errorMessage } from '../components/ui/Alert';
import { ArchivoDepuradoChip, Chip, EstadoEntregaBadge, TipoActividadChip } from '../components/ui/Badge';
import { Button } from '../components/ui/Button';
import { Card, CardHeader } from '../components/ui/Card';
import { ContenidoRico } from '../components/ui/ContenidoRico';
import { Dropzone } from '../components/ui/Dropzone';
import { DropzoneMultiple } from '../components/ui/DropzoneMultiple';
import { EditorRico } from '../components/ui/EditorRico';
import { Textarea } from '../components/ui/Field';
import { PageHeader } from '../components/ui/PageHeader';
import { Spinner } from '../components/ui/Spinner';
import { ArrowLeftIcon, PaperclipIcon, XIcon } from '../components/ui/icons';
import { type ActividadEstudiante, descargarEntrega, useEnviarEntrega, useMiActividad } from '../hooks/useActividades';
import { MAX_ARCHIVOS_POR_ENTREGA, MAX_BYTES_ENTREGA, etiquetaDeFormato, extensionesDe, formatoInstante, formatoTamano, htmlTieneContenido } from '../lib/actividades';

/** CU-EST-03: el estudiante lee la actividad completa, entrega su evidencia (o escribe su respuesta), ve su nota y conversa con su docente. */
export function ActividadEstudiantePage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const detalle = useMiActividad(id);

  if (detalle.isLoading) {
    return (
      <div className="flex justify-center p-12">
        <Spinner label="Cargando actividad..." />
      </div>
    );
  }
  if (detalle.isError || !detalle.data) {
    return (
      <div className="space-y-4">
        <Alert tone="error">{detalle.isError ? errorMessage(detalle.error) : 'Actividad no encontrada.'}</Alert>
        <Link to="/mis-actividades" className="font-semibold text-primary underline">
          Volver a mis actividades
        </Link>
      </div>
    );
  }

  const actividad = detalle.data;
  const asignaturaId = actividad.asignacion?.asignatura?._id;
  const volver = asignaturaId ? `/mis-actividades?asignatura=${asignaturaId}` : '/mis-actividades';

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Button type="button" variant="outline" onClick={() => navigate(volver)} className="inline-flex items-center gap-2">
          <ArrowLeftIcon className="h-4 w-4" />
          Volver a mis actividades
        </Button>
        <div className="flex flex-wrap items-center gap-2">
          <TipoActividadChip value={actividad.tipo} />
          <EstadoEntregaBadge value={actividad.estado} />
        </div>
      </div>

      <PageHeader
        title={actividad.titulo}
        subtitle={[
          actividad.asignacion?.asignatura?.nombre ?? 'Asignatura',
          actividad.asignacion?.docente ? `${actividad.asignacion.docente.nombre} ${actividad.asignacion.docente.apellido}` : '',
          actividad.componente_nombre,
        ]
          .filter(Boolean)
          .join(' · ')}
      />

      <div className="grid items-start gap-4 lg:grid-cols-[3fr_2fr]">
        <div className="space-y-4">
          <Card>
            <dl className="mb-4 grid grid-cols-1 gap-3 rounded-lg bg-soft p-3 text-sm sm:grid-cols-2">
              <div>
                <dt className="text-xs text-muted">Límite de entrega</dt>
                <dd className="font-semibold text-ink">{formatoInstante(actividad.fecha_entrega)}</dd>
              </div>
              <div>
                <dt className="text-xs text-muted">Entregas tardías</dt>
                <dd className="font-semibold text-ink">{actividad.permite_entrega_tardia ? 'Se aceptan, marcadas con retraso' : 'No se aceptan'}</dd>
              </div>
              {actividad.requiere_entrega && (
                <>
                  <div>
                    <dt className="text-xs text-muted">Cuántas veces puedes entregar</dt>
                    <dd className="font-semibold text-ink">{actividad.permite_multiples_entregas ? 'Varias; tu docente elige la válida' : 'Una sola vez'}</dd>
                  </div>
                  <div>
                    <dt className="text-xs text-muted">Cómo entregar</dt>
                    <dd className="font-semibold text-ink">
                      {actividad.formatos_permitidos.length > 0
                        ? `${actividad.permite_varios_archivos ? `Hasta ${MAX_ARCHIVOS_POR_ENTREGA} archivos` : 'Un archivo'}: ${actividad.formatos_permitidos.map(etiquetaDeFormato).join(', ')}${actividad.permite_editor_texto ? ' o escribir tu respuesta' : ''}`
                        : 'Escribe tu respuesta en la plataforma'}
                    </dd>
                  </div>
                </>
              )}
            </dl>
            {actividad.comentarios_docente && (
              <p className="mb-4 whitespace-pre-wrap rounded-lg bg-primary-soft p-3 text-sm text-body">{actividad.comentarios_docente}</p>
            )}
            <ContenidoDeActividad actividad={actividad} />
          </Card>

          <Card>
            <CardHeader title="Comentarios" subtitle="Pregunta aquí tus dudas; lo ven tu docente y tu grupo." />
            <ComentariosActividad actividadId={actividad._id} />
          </Card>
        </div>

        <div className="space-y-4">
          {actividad.requiere_entrega ? (
            <PanelDeEntrega key={`${actividad._id}-${actividad.entrega?.intentos.length ?? 0}`} actividad={actividad} />
          ) : (
            <Alert tone="info">Esta es una actividad de aula: tu docente la califica directamente y no necesitas entregar nada aquí.</Alert>
          )}
          {actividad.estado === 'CALIFICADA' && actividad.entrega && (
            <Alert tone="success">
              <p className="font-semibold">Nota: {actividad.entrega.calificacion_numerica}</p>
              {actividad.entrega.retroalimentacion && <p className="mt-1">{actividad.entrega.retroalimentacion}</p>}
            </Alert>
          )}
        </div>
      </div>
    </div>
  );
}

function PanelDeEntrega({ actividad }: { actividad: ActividadEstudiante }) {
  const enviar = useEnviarEntrega();
  const { entrega } = actividad;
  const intentos = entrega?.intentos ?? [];
  const [archivos, setArchivos] = useState<File[]>([]);
  const [texto, setTexto] = useState('');
  const [respuesta, setRespuesta] = useState('');
  const [mensaje, setMensaje] = useState<{ tone: 'success' | 'error'; texto: string } | null>(null);
  const [descargando, setDescargando] = useState<string | null>(null);

  const conArchivo = actividad.formatos_permitidos.length > 0;
  const conEditor = actividad.permite_editor_texto;
  const variosArchivos = actividad.permite_varios_archivos;
  const hayRespuesta = conEditor && htmlTieneContenido(respuesta);
  const puedeEnviar = conArchivo ? archivos.length > 0 || hayRespuesta : hayRespuesta || texto.trim() !== '';

  function agregarArchivos(nuevos: File[]) {
    setArchivos((previos) => {
      const unicos = nuevos.filter((n) => !previos.some((p) => p.name === n.name && p.size === n.size));
      return [...previos, ...unicos].slice(0, MAX_ARCHIVOS_POR_ENTREGA);
    });
  }

  async function enviarEntrega() {
    setMensaje(null);
    try {
      await enviar.mutateAsync({ actividadId: actividad._id, archivos, texto_entrega: texto.trim(), respuesta_html: hayRespuesta ? respuesta : undefined });
      setArchivos([]);
      setTexto('');
      setRespuesta('');
      setMensaje({ tone: 'success', texto: 'Tu entrega quedó registrada.' });
    } catch (error) {
      setMensaje({ tone: 'error', texto: errorMessage(error) });
    }
  }

  async function bajar(numero: number, indice: number, nombre: string) {
    if (!entrega) return;
    setDescargando(`${numero}-${indice}`);
    try {
      await descargarEntrega(entrega._id, nombre, numero, indice);
    } catch (error) {
      setMensaje({ tone: 'error', texto: errorMessage(error) });
    } finally {
      setDescargando(null);
    }
  }

  return (
    <Card>
      <CardHeader title="Tu entrega" />
      <div className="space-y-3">
        {actividad.acceso_especial && (
          <Alert tone="info">Tu docente te dio un plazo personal: puedes entregar hasta el {formatoInstante(actividad.acceso_especial.fecha_limite)}.</Alert>
        )}

        {intentos.length === 0 && <p className="text-sm text-muted">Aún no has entregado.</p>}
        <ul className="space-y-2">
          {intentos.map((i) => (
            <li key={i.numero} className="space-y-1.5 rounded-lg border border-border bg-soft p-3 text-sm">
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-semibold text-ink">{intentos.length > 1 ? `Entrega ${i.numero}` : 'Enviada'}</span>
                <span className="text-xs text-muted">{formatoInstante(i.fecha_entrega)}</span>
                {i.con_retraso && <Chip tone="orange">Con retraso</Chip>}
                {i.acceso_especial && <Chip tone="blue">Plazo personal</Chip>}
                {intentos.length > 1 && i.considerado && <Chip tone="green">Cuenta para la nota</Chip>}
              </div>
              {i.archivos.some((a) => !a.purgado) && (
                <div className="flex flex-wrap gap-2">
                  {i.archivos
                    .filter((a) => !a.purgado)
                    .map((a) => (
                      <Button key={a.indice} type="button" variant="soft-edit" isLoading={descargando === `${i.numero}-${a.indice}`} onClick={() => void bajar(i.numero, a.indice, a.nombre)}>
                        Descargar {a.nombre}
                      </Button>
                    ))}
                </div>
              )}
              {i.archivo_purgado && <ArchivoDepuradoChip />}
              {i.respuesta_html && <ContenidoRico html={i.respuesta_html} className="rounded-lg bg-surface p-3" />}
              {i.texto_entrega && <p className="whitespace-pre-wrap rounded-lg bg-surface p-3 text-body">{i.texto_entrega}</p>}
            </li>
          ))}
        </ul>
        {entrega?.requiere_elegir_intento && <p className="text-xs text-muted">Entregaste varias veces: tu docente elegirá cuál es la válida antes de calificar.</p>}

        {mensaje && <Alert tone={mensaje.tone}>{mensaje.texto}</Alert>}

        {actividad.puede_entregar ? (
          <div className="space-y-3">
            {conArchivo && !variosArchivos && (
              <Dropzone
                file={archivos[0] ?? null}
                onFile={(f) => setArchivos(f ? [f] : [])}
                extensiones={extensionesDe(actividad.formatos_permitidos)}
                maxBytes={MAX_BYTES_ENTREGA}
                hint={`${actividad.formatos_permitidos.map(etiquetaDeFormato).join(', ')} · máximo 10 MB`}
                disabled={enviar.isPending}
              />
            )}
            {conArchivo && variosArchivos && (
              <div className="space-y-2">
                <DropzoneMultiple
                  extensiones={extensionesDe(actividad.formatos_permitidos)}
                  maxBytes={MAX_BYTES_ENTREGA}
                  maxArchivos={MAX_ARCHIVOS_POR_ENTREGA - archivos.length}
                  disabled={enviar.isPending || archivos.length >= MAX_ARCHIVOS_POR_ENTREGA}
                  onFiles={agregarArchivos}
                  etiqueta="Archivos de tu entrega"
                  hint={`${actividad.formatos_permitidos.map(etiquetaDeFormato).join(', ')} · hasta ${MAX_ARCHIVOS_POR_ENTREGA} archivos de 10 MB`}
                />
                {archivos.length > 0 && (
                  <ul className="space-y-1.5">
                    {archivos.map((a) => (
                      <li key={`${a.name}-${a.size}`} className="flex items-center justify-between gap-3 rounded-lg bg-primary-soft px-3 py-2 text-sm">
                        <span className="flex min-w-0 items-center gap-2 text-primary">
                          <PaperclipIcon className="h-4 w-4 shrink-0" />
                          <span className="truncate">{a.name}</span>
                          <span className="shrink-0 text-xs text-muted">{formatoTamano(a.size)}</span>
                        </span>
                        <button
                          type="button"
                          aria-label={`Quitar ${a.name}`}
                          onClick={() => setArchivos((previos) => previos.filter((x) => x !== a))}
                          className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-primary hover:bg-surface"
                        >
                          <XIcon className="h-3.5 w-3.5" />
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )}
            {conEditor && (
              <div className="space-y-1.5">
                <p className="text-label text-ink">Tu respuesta</p>
                <EditorRico value={respuesta} onChange={setRespuesta} etiqueta="Tu respuesta" placeholder="Escribe aquí tu respuesta. Puedes pegar imágenes." />
              </div>
            )}
            <Textarea
              label={conArchivo || conEditor ? 'Comentario para tu docente (opcional)' : 'Tu respuesta'}
              rows={conArchivo || conEditor ? 3 : 8}
              maxLength={10000}
              value={texto}
              onChange={(e) => setTexto(e.target.value)}
            />
            {actividad.vencida && !actividad.acceso_especial && <Alert tone="warning">El plazo ya venció: tu entrega quedará marcada «Entregada con retraso».</Alert>}
            <Button type="button" className="w-full" isLoading={enviar.isPending} disabled={!puedeEnviar} onClick={() => void enviarEntrega()}>
              {intentos.length > 0 ? `Entregar de nuevo (entrega ${intentos.length + 1})` : 'Entregar'}
            </Button>
          </div>
        ) : (
          actividad.motivo_bloqueo && actividad.estado !== 'CALIFICADA' && <Alert tone="info">{actividad.motivo_bloqueo}</Alert>
        )}
      </div>
    </Card>
  );
}
