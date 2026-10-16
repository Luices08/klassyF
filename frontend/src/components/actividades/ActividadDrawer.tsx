import { type FormEvent, useState } from 'react';
import { Alert, errorMessage } from '../ui/Alert';
import { Button } from '../ui/Button';
import { Drawer } from '../ui/Drawer';
import { DropzoneMultiple } from '../ui/DropzoneMultiple';
import { EditorRico } from '../ui/EditorRico';
import { Input, Select } from '../ui/Field';
import { MultiSelect } from '../ui/MultiSelect';
import { PanelDocumentosPdf } from '../ui/PanelDocumentosPdf';
import { Spinner } from '../ui/Spinner';
import { Switch } from '../ui/Switch';
import { PaperclipIcon, PlayIcon, XIcon } from '../ui/icons';
import { AlertasCalendario } from './AlertasCalendario';
import {
  type Actividad,
  type ActividadConResumen,
  type ActividadDetalleGestion,
  type DatosActividad,
  type ReferenciaAdjunto,
  useActividad,
  useActualizarActividad,
  useCrearActividad,
  useRevisionCalendario,
  useSubirAdjuntos,
} from '../../hooks/useActividades';
import { useBloquesDeClase } from '../../hooks/useNotas';
import { cargarArchivoPlanAula } from '../../hooks/usePlanesAula';
import {
  EXTENSIONES_ADJUNTO,
  FORMATOS_EVIDENCIA,
  type FormatoEvidencia,
  MAX_ADJUNTOS_POR_ACTIVIDAD,
  MAX_ARCHIVOS_POR_SUBIDA,
  MAX_BYTES_ADJUNTO,
  MAX_VIDEOS_POR_ACTIVIDAD,
  NOMBRES_TIPO_ACTIVIDAD,
  NOMBRES_TIPO_ADJUNTO,
  TIPOS_ACTIVIDAD,
  type TipoActividad,
  aInputInstante,
  aInstante,
  formatoTamano,
} from '../../lib/actividades';
import type { ResumenPlanAula } from '../../types/domain';

interface ActividadDrawerProps {
  open: boolean;
  onClose: () => void;
  teacherAssignmentId: string;
  periodoNumero: number;
  /** El plan de aula APROBADO de esta clase y periodo (M07): se lee al lado mientras se programa la actividad. */
  planAula: ResumenPlanAula | null;
  /** Con actividad se edita; sin ella se crea. */
  actividad: ActividadConResumen | null;
  /** Las otras clases del docente con esta misma asignatura (otros grupos o grados): donde se puede publicar lo mismo de una vez. */
  otrasClases?: Array<{ id: string; etiqueta: string }>;
}

type AdjuntoEnFormulario = ReferenciaAdjunto & { tipo: keyof typeof NOMBRES_TIPO_ADJUNTO; bytes: number };

interface Formulario {
  tipo: TipoActividad;
  titulo: string;
  contenido: string;
  adjuntos: AdjuntoEnFormulario[];
  videos: string[];
  videoNuevo: string;
  multiples: boolean;
  grupos: string[];
  componente: string;
  peso: string;
  apertura: string;
  entrega: string;
  requiere: boolean;
  formatos: FormatoEvidencia[];
  tardia: boolean;
  confirmar: boolean;
}

const escaparHtml = (t: string) => t.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/** Las actividades anteriores al editor solo tienen texto plano: se muestra como párrafos. */
function contenidoDe(actividad: Actividad): string {
  if (actividad.contenido_html) return actividad.contenido_html;
  return actividad.descripcion
    .split(/\n+/)
    .filter(Boolean)
    .map((linea) => `<p>${escaparHtml(linea)}</p>`)
    .join('');
}

const enlaceDeVideo = (v: { proveedor: 'YOUTUBE' | 'VIMEO'; video_id: string }): string =>
  v.proveedor === 'YOUTUBE' ? `https://www.youtube.com/watch?v=${v.video_id}` : `https://vimeo.com/${v.video_id}`;

function formularioInicial(actividad: Actividad | null): Formulario {
  if (actividad) {
    return {
      tipo: actividad.tipo,
      titulo: actividad.titulo,
      contenido: contenidoDe(actividad),
      adjuntos: actividad.adjuntos,
      videos: actividad.videos.map(enlaceDeVideo),
      videoNuevo: '',
      multiples: actividad.permite_multiples_entregas,
      grupos: [],
      componente: actividad.componente_siee,
      peso: actividad.peso_en_componente === null ? '' : String(actividad.peso_en_componente),
      apertura: aInputInstante(actividad.fecha_apertura),
      entrega: aInputInstante(actividad.fecha_entrega),
      requiere: actividad.requiere_entrega,
      formatos: actividad.formatos_permitidos,
      tardia: actividad.permite_entrega_tardia,
      confirmar: false,
    };
  }
  return {
    tipo: 'TAREA',
    titulo: '',
    contenido: '',
    adjuntos: [],
    videos: [],
    videoNuevo: '',
    multiples: false,
    grupos: [],
    componente: '',
    peso: '',
    apertura: aInputInstante(new Date().toISOString()),
    entrega: '',
    requiere: true,
    formatos: ['PDF'],
    tardia: false,
    confirmar: false,
  };
}

/** CU-DOC-02: formulario para programar (o editar) una tarea, evaluación, trabajo o proyecto. */
export function ActividadDrawer(props: ActividadDrawerProps) {
  if (!props.open) return null;
  // Editar necesita el texto completo y los adjuntos, que los listados no traen.
  return props.actividad ? <CargarDetalle {...props} actividad={props.actividad} /> : <FormularioActividad key="nueva" {...props} detalle={null} />;
}

function CargarDetalle(props: ActividadDrawerProps & { actividad: ActividadConResumen }) {
  const detalle = useActividad(props.actividad._id);
  if (detalle.data) return <FormularioActividad key={detalle.data._id} {...props} detalle={detalle.data} />;
  return (
    <Drawer open size="xl" title="Editar actividad" onClose={props.onClose}>
      {detalle.isError ? <Alert tone="error">{errorMessage(detalle.error)}</Alert> : <Spinner label="Cargando actividad..." />}
    </Drawer>
  );
}

function FormularioActividad({
  onClose,
  teacherAssignmentId,
  periodoNumero,
  planAula,
  actividad: resumen,
  detalle,
  otrasClases = [],
}: ActividadDrawerProps & { detalle: ActividadDetalleGestion | null }) {
  // Al editar, `detalle` ya trae el texto completo; `actividad` conserva el nombre que usa el resto del formulario.
  const actividad: ActividadConResumen | null = detalle ?? resumen;
  const [f, setF] = useState<Formulario>(() => formularioInicial(detalle));
  const subir = useSubirAdjuntos();
  const [omitidas, setOmitidas] = useState<string[]>([]);
  // Los bloques del molde del colegio con lo que ya tienen en esta clase y periodo: solo se ofrecen los que aún tienen lugar.
  const bloques = useBloquesDeClase({ teacherAssignmentId, periodoNumero });
  const [mensaje, setMensaje] = useState<string | null>(null);
  const crear = useCrearActividad();
  const actualizar = useActualizarActividad();
  const guardando = crear.isPending || actualizar.isPending;

  const cambiar = <K extends keyof Formulario>(campo: K, valor: Formulario[K]) => setF((prev) => ({ ...prev, [campo]: valor }));

  const fechaEntrega = f.entrega ? aInstante(f.entrega) : null;
  const fechaCambia = !actividad || fechaEntrega !== actividad.fecha_entrega;
  const revision = useRevisionCalendario(
    fechaEntrega
      ? {
          teacher_assignment_id: teacherAssignmentId,
          periodo_numero: periodoNumero,
          fecha_entrega: fechaEntrega,
          tipo: f.tipo,
          excluir_id: actividad?._id,
          exigir_futuro: f.requiere && fechaCambia,
        }
      : null
  );
  const alertas = revision.data?.alertas ?? [];
  const hayBloqueo = alertas.some((a) => a.severidad === 'BLOQUEO');
  const hayAdvertencia = alertas.some((a) => a.severidad === 'ADVERTENCIA');

  const tieneEntregas = (resumen?.resumen.entregadas ?? 0) > 0;
  const peso = f.peso.trim() === '' ? null : Number(f.peso);
  const bloqueElegido = f.componente !== '' ? f.componente : (bloques.data?.find((b) => b.casillas.length < b.max_casillas)?.clave ?? '');
  const completo =
    f.titulo.trim() !== '' &&
    f.contenido.trim() !== '' &&
    bloqueElegido !== '' &&
    f.entrega !== '' &&
    f.apertura !== '' &&
    (peso === null || (Number.isFinite(peso) && peso >= 0 && peso <= 100));

  const toggleFormato = (clave: FormatoEvidencia) =>
    cambiar('formatos', f.formatos.includes(clave) ? f.formatos.filter((x) => x !== clave) : [...f.formatos, clave]);

  const datos = (): DatosActividad => ({
    titulo: f.titulo.trim(),
    contenido_html: f.contenido,
    adjuntos: f.adjuntos.map(({ id, ext, nombre }) => ({ id, ext, nombre })),
    videos: f.videos,
    permite_multiples_entregas: f.requiere && f.multiples,
    tipo: f.tipo,
    componente_siee: bloqueElegido,
    peso_en_componente: peso,
    fecha_apertura: aInstante(f.apertura),
    fecha_entrega: aInstante(f.entrega),
    requiere_entrega: f.requiere,
    formatos_permitidos: f.requiere ? f.formatos : [],
    permite_entrega_tardia: f.requiere && f.tardia,
    confirmar_alertas: f.confirmar,
  });

  /** Al editar solo viaja lo que cambió: así corregir un título no reabre validaciones de lo que no se tocó. */
  const cambios = (completos: DatosActividad, original: Actividad): Partial<DatosActividad> => {
    const actuales: Partial<DatosActividad> = { ...completos };
    const iguales: Array<keyof DatosActividad> = [];
    if (completos.titulo === original.titulo) iguales.push('titulo');
    if (completos.contenido_html === contenidoDe(original)) iguales.push('contenido_html');
    if (JSON.stringify(completos.adjuntos?.map((a) => a.id)) === JSON.stringify(original.adjuntos.map((a) => a.id))) iguales.push('adjuntos');
    if (JSON.stringify(completos.videos) === JSON.stringify(original.videos.map(enlaceDeVideo))) iguales.push('videos');
    if (completos.permite_multiples_entregas === original.permite_multiples_entregas) iguales.push('permite_multiples_entregas');
    if (completos.tipo === original.tipo) iguales.push('tipo');
    if (completos.componente_siee === original.componente_siee) iguales.push('componente_siee');
    if (completos.peso_en_componente === original.peso_en_componente) iguales.push('peso_en_componente');
    if (completos.fecha_apertura === original.fecha_apertura) iguales.push('fecha_apertura');
    if (completos.fecha_entrega === original.fecha_entrega) iguales.push('fecha_entrega');
    if (completos.requiere_entrega === original.requiere_entrega) iguales.push('requiere_entrega');
    if (completos.permite_entrega_tardia === original.permite_entrega_tardia) iguales.push('permite_entrega_tardia');
    if (JSON.stringify(completos.formatos_permitidos) === JSON.stringify(original.formatos_permitidos)) iguales.push('formatos_permitidos');
    for (const campo of iguales) delete actuales[campo];
    return actuales;
  };

  async function subirArchivos(archivos: File[]) {
    setMensaje(null);
    const cupo = MAX_ADJUNTOS_POR_ACTIVIDAD - f.adjuntos.length;
    if (archivos.length > cupo) {
      setMensaje(`Una actividad admite hasta ${MAX_ADJUNTOS_POR_ACTIVIDAD} archivos adjuntos.`);
      return;
    }
    try {
      const subidos = await subir.mutateAsync(archivos);
      setF((prev) => ({
        ...prev,
        adjuntos: [...prev.adjuntos, ...subidos.filter((s) => !prev.adjuntos.some((a) => a.id === s.id))],
      }));
    } catch (error) {
      setMensaje(errorMessage(error));
    }
  }

  function agregarVideo() {
    const enlace = f.videoNuevo.trim();
    if (!enlace) return;
    if (!/^https?:\/\/(www\.|m\.)?(youtube\.com|youtube-nocookie\.com|youtu\.be|vimeo\.com|player\.vimeo\.com)\//i.test(enlace)) {
      setMensaje('Solo se aceptan enlaces de YouTube o Vimeo.');
      return;
    }
    if (f.videos.includes(enlace)) return;
    setMensaje(null);
    setF((prev) => ({ ...prev, videos: [...prev.videos, enlace], videoNuevo: '' }));
  }

  async function guardar(e: FormEvent) {
    e.preventDefault();
    setMensaje(null);
    try {
      if (actividad) {
        await actualizar.mutateAsync({ id: actividad._id, ...cambios(datos(), actividad), confirmar_alertas: f.confirmar });
      } else {
        const resultado = await crear.mutateAsync({
          teacher_assignment_id: teacherAssignmentId,
          periodo_numero: periodoNumero,
          ...datos(),
          grupos_adicionales: f.grupos,
        });
        // Si en algún grupo no se pudo publicar, el docente lo lee antes de cerrar: la actividad principal ya quedó creada.
        if (resultado.omitidas.length > 0) {
          setOmitidas(resultado.omitidas.map((o) => `${o.grupo}: ${o.motivo}`));
          return;
        }
      }
      onClose();
    } catch (error) {
      setMensaje(errorMessage(error));
    }
  }

  return (
    <Drawer
      open
      size="xl"
      title={actividad ? 'Editar actividad' : 'Nueva actividad'}
      subtitle={`Periodo ${periodoNumero}. Estudiantes y calendario se resuelven por tu asignación.`}
      onClose={onClose}
      onSubmit={(e) => void guardar(e)}
      submitLabel={actividad ? 'Guardar cambios' : 'Programar actividad'}
      isSubmitting={guardando}
      submitDisabled={!completo || hayBloqueo || (hayAdvertencia && !f.confirmar)}
    >
      <div className="grid gap-5 lg:grid-cols-2">
        <div className="space-y-4">
          {mensaje && <Alert tone="error">{mensaje}</Alert>}
          {omitidas.length > 0 && (
            <Alert tone="warning">
              <p className="font-semibold">La actividad se creó, pero no se pudo publicar en estos grupos:</p>
              <ul className="mt-1 list-disc pl-5">
                {omitidas.map((o) => (
                  <li key={o}>{o}</li>
                ))}
              </ul>
              <button type="button" onClick={onClose} className="mt-2 font-semibold underline">
                Entendido, cerrar
              </button>
            </Alert>
          )}

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <Select label="Tipo" value={f.tipo} onChange={(e) => cambiar('tipo', e.target.value as TipoActividad)}>
              {TIPOS_ACTIVIDAD.map((t) => (
                <option key={t} value={t}>
                  {NOMBRES_TIPO_ACTIVIDAD[t]}
                </option>
              ))}
            </Select>
            <div className="sm:col-span-2">
              <Input label="Título" value={f.titulo} maxLength={150} onChange={(e) => cambiar('titulo', e.target.value)} />
            </div>
          </div>

          <div className="space-y-1.5">
            <p className="text-label text-ink">Instrucciones</p>
            <EditorRico
              value={f.contenido}
              onChange={(html) => cambiar('contenido', html)}
              etiqueta="Instrucciones de la actividad"
              placeholder="Lo que el estudiante debe hacer y cómo se evalúa. Puedes pegar imágenes."
            />
          </div>

          <fieldset className="space-y-3 rounded-lg border border-border p-3">
            <legend className="px-1 text-label text-body">Material de apoyo</legend>
            <DropzoneMultiple
              extensiones={EXTENSIONES_ADJUNTO}
              maxBytes={MAX_BYTES_ADJUNTO}
              maxArchivos={MAX_ARCHIVOS_POR_SUBIDA}
              disabled={subir.isPending || f.adjuntos.length >= MAX_ADJUNTOS_POR_ACTIVIDAD}
              onFiles={(archivos) => void subirArchivos(archivos)}
              hint={`JPG, PNG, WEBP, PDF, Word, Excel, PowerPoint, MP3 o MP4 · hasta ${formatoTamano(MAX_BYTES_ADJUNTO)} cada uno · máx. ${MAX_ADJUNTOS_POR_ACTIVIDAD} archivos`}
            />
            {subir.isPending && <Spinner label="Subiendo archivos..." />}
            {f.adjuntos.length > 0 && (
              <ul className="space-y-1.5">
                {f.adjuntos.map((a) => (
                  <li key={a.id} className="flex items-center justify-between gap-3 rounded-lg bg-primary-soft px-3 py-2 text-sm">
                    <span className="flex min-w-0 items-center gap-2 text-primary">
                      <PaperclipIcon className="h-4 w-4 shrink-0" />
                      <span className="truncate">{a.nombre}</span>
                      <span className="shrink-0 text-xs text-muted">
                        {NOMBRES_TIPO_ADJUNTO[a.tipo]} · {formatoTamano(a.bytes)}
                      </span>
                    </span>
                    <button
                      type="button"
                      aria-label={`Quitar ${a.nombre}`}
                      onClick={() => setF((prev) => ({ ...prev, adjuntos: prev.adjuntos.filter((x) => x.id !== a.id) }))}
                      className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-primary hover:bg-surface"
                    >
                      <XIcon className="h-3.5 w-3.5" />
                    </button>
                  </li>
                ))}
              </ul>
            )}

            <div className="space-y-1.5">
              <div className="flex items-end gap-2">
                <div className="min-w-0 flex-1">
                  <Input
                    label="Video (YouTube o Vimeo)"
                    value={f.videoNuevo}
                    placeholder="https://www.youtube.com/watch?v=…"
                    disabled={f.videos.length >= MAX_VIDEOS_POR_ACTIVIDAD}
                    onChange={(e) => cambiar('videoNuevo', e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        agregarVideo();
                      }
                    }}
                  />
                </div>
                <Button type="button" variant="outline" disabled={!f.videoNuevo.trim() || f.videos.length >= MAX_VIDEOS_POR_ACTIVIDAD} onClick={agregarVideo}>
                  Agregar
                </Button>
              </div>
              {f.videos.map((v) => (
                <div key={v} className="flex items-center justify-between gap-3 rounded-lg bg-soft px-3 py-2 text-sm">
                  <span className="flex min-w-0 items-center gap-2 text-body">
                    <PlayIcon className="h-4 w-4 shrink-0 text-primary" />
                    <span className="truncate">{v}</span>
                  </span>
                  <button
                    type="button"
                    aria-label="Quitar video"
                    onClick={() => setF((prev) => ({ ...prev, videos: prev.videos.filter((x) => x !== v) }))}
                    className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-body hover:bg-surface"
                  >
                    <XIcon className="h-3.5 w-3.5" />
                  </button>
                </div>
              ))}
            </div>
          </fieldset>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Select
              label="Bloque de la planilla"
              value={bloqueElegido}
              disabled={bloques.isLoading}
              error={bloques.isError ? errorMessage(bloques.error) : undefined}
              hint="El colegio define los bloques y cuántas casillas admite cada uno."
              onChange={(e) => cambiar('componente', e.target.value)}
            >
              {/* Una actividad antigua puede apuntar a un bloque que el año ya no ofrece: se conserva visible. */}
              {actividad && !bloques.data?.some((b) => b.clave === actividad.componente_siee) && (
                <option value={actividad.componente_siee}>{actividad.componente_nombre}</option>
              )}
              {(bloques.data ?? []).map((b) => {
                const lleno = b.casillas.length >= b.max_casillas && b.clave !== actividad?.componente_siee;
                return (
                  <option key={b.clave} value={b.clave} disabled={lleno}>
                    {b.nombre} ({b.porcentaje}%) · {b.casillas.length}/{b.max_casillas} casillas{lleno ? ' · lleno' : ''}
                  </option>
                );
              })}
            </Select>
            <Input
              label="Peso dentro del bloque (%)"
              type="number"
              min={0}
              max={100}
              step="0.5"
              value={f.peso}
              hint="Opcional. Vacío: las casillas sin peso se reparten en partes iguales lo que queda del bloque."
              onChange={(e) => cambiar('peso', e.target.value)}
            />
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Input
              label="Se publica (hora de Colombia)"
              type="datetime-local"
              value={f.apertura}
              onChange={(e) => cambiar('apertura', e.target.value)}
            />
            <Input
              label="Límite de entrega (hora de Colombia)"
              type="datetime-local"
              value={f.entrega}
              min={f.apertura || undefined}
              onChange={(e) => {
                cambiar('entrega', e.target.value);
                cambiar('confirmar', false);
              }}
            />
          </div>

          {fechaEntrega && <AlertasCalendario revision={revision.data} cargando={revision.isFetching} error={revision.error} />}
          {hayAdvertencia && !hayBloqueo && (
            <label className="flex items-start gap-2 text-sm text-body">
              <input type="checkbox" className="mt-0.5" checked={f.confirmar} onChange={(e) => cambiar('confirmar', e.target.checked)} />
              Entiendo las advertencias y quiero programar la actividad en esta fecha.
            </label>
          )}

          {!actividad && otrasClases.length > 0 && (
            <div className="space-y-1.5">
              <MultiSelect
                label="Publicar también en otros grupos (misma materia)"
                options={otrasClases.map((c) => ({ value: c.id, label: c.etiqueta }))}
                selected={f.grupos}
                onChange={(grupos) => cambiar('grupos', grupos)}
                emptyLabel="Solo en este grupo"
                allLabel="Solo en este grupo"
              />
              <p className="text-xs text-muted">
                Se crea una copia en cada grupo elegido. Cada copia sigue sus propias reglas: si el plan de aula de ese grado aún no está aprobado, esa copia se omite y te avisamos.
              </p>
            </div>
          )}

          <fieldset className="space-y-3 rounded-lg border border-border p-3">
            <legend className="px-1 text-label text-body">Recepción de entregas</legend>
            <label className="flex items-center gap-2 text-sm text-body">
              <input
                type="checkbox"
                checked={f.requiere}
                disabled={tieneEntregas}
                onChange={(e) => cambiar('requiere', e.target.checked)}
              />
              Los estudiantes entregan algo en la plataforma
            </label>
            {f.requiere ? (
              <>
                <div>
                  <p className="mb-1.5 text-label text-body">Formatos que se aceptan</p>
                  <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-2">
                    {FORMATOS_EVIDENCIA.map((formato) => (
                      <label key={formato.clave} className="flex items-center gap-2 text-sm text-body">
                        <input
                          type="checkbox"
                          checked={f.formatos.includes(formato.clave)}
                          disabled={tieneEntregas}
                          onChange={() => toggleFormato(formato.clave)}
                        />
                        {formato.etiqueta}
                      </label>
                    ))}
                  </div>
                  {tieneEntregas && <p className="mt-1.5 text-xs text-muted">Los formatos ya no se pueden cambiar: hay estudiantes que entregaron.</p>}
                  {f.formatos.length === 0 && (
                    <p className="mt-1.5 text-xs text-muted">Sin formatos marcados, el estudiante responde escribiendo en la plataforma.</p>
                  )}
                </div>
                <label className="flex items-center gap-2 text-sm text-body">
                  <input type="checkbox" checked={f.tardia} onChange={(e) => cambiar('tardia', e.target.checked)} />
                  Acepta entregas tardías (quedan marcadas «Entregada con retraso»)
                </label>
                <Switch
                  label="Permite múltiples entregas"
                  description="Si está apagado, cada estudiante entrega una sola vez. Encendido, puede volver a entregar y tú eliges cuál es la válida antes de calificar."
                  checked={f.multiples}
                  onChange={(v) => cambiar('multiples', v)}
                />
              </>
            ) : (
              <p className="text-xs text-muted">Actividad de aula: no recibe archivos. La calificas directamente.</p>
            )}
          </fieldset>
        </div>

        <PanelDocumentosPdf
          documentos={
            planAula
              ? [
                  {
                    clave: `plan-aula-${planAula._id}-${planAula.version_actual}`,
                    titulo: `Tu plan de aula aprobado: ${planAula.titulo}`,
                    nombreArchivo: planAula.archivo_nombre,
                    cargar: () => cargarArchivoPlanAula(planAula._id, planAula.version_actual),
                  },
                ]
              : []
          }
          vacio="Aquí verás el plan de aula aprobado de este periodo."
        />
      </div>
    </Drawer>
  );
}
