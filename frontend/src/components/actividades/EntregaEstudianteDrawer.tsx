import { type FormEvent, useState } from 'react';
import { Alert, errorMessage } from '../ui/Alert';
import { EstadoEntregaBadge, TipoActividadChip } from '../ui/Badge';
import { Button } from '../ui/Button';
import { Drawer } from '../ui/Drawer';
import { Dropzone } from '../ui/Dropzone';
import { Textarea } from '../ui/Field';
import { type ActividadEstudiante, descargarEntrega, useEnviarEntrega } from '../../hooks/useActividades';
import { MAX_BYTES_ENTREGA, NOMBRES_COMPONENTE_SIEE, etiquetaDeFormato, extensionesDe, formatoInstante } from '../../lib/actividades';

interface EntregaEstudianteDrawerProps {
  actividad: ActividadEstudiante | null;
  onClose: () => void;
}

/** CU-EST-03: el estudiante lee la actividad, sube su evidencia (o escribe su respuesta) y ve su nota cuando llega. */
export function EntregaEstudianteDrawer({ actividad, onClose }: EntregaEstudianteDrawerProps) {
  return actividad ? <Contenido key={actividad._id} actividad={actividad} onClose={onClose} /> : null;
}

function Contenido({ actividad, onClose }: { actividad: ActividadEstudiante; onClose: () => void }) {
  const enviar = useEnviarEntrega();
  const { entrega } = actividad;
  const [archivo, setArchivo] = useState<File | null>(null);
  const [texto, setTexto] = useState(entrega?.texto_entrega ?? '');
  const [mensaje, setMensaje] = useState<{ tone: 'success' | 'error'; texto: string } | null>(null);

  const conArchivo = actividad.formatos_permitidos.length > 0;
  const puedeEnviar = conArchivo ? archivo !== null : texto.trim() !== '';
  const reentrega = entrega !== null && entrega.fecha_entrega !== null;

  async function enviarEntrega(e: FormEvent) {
    e.preventDefault();
    setMensaje(null);
    try {
      await enviar.mutateAsync({ actividadId: actividad._id, archivo, texto_entrega: texto.trim() });
      setArchivo(null);
      setMensaje({ tone: 'success', texto: 'Tu entrega quedó registrada.' });
    } catch (error) {
      setMensaje({ tone: 'error', texto: errorMessage(error) });
    }
  }

  async function bajarMiArchivo() {
    if (!entrega) return;
    try {
      await descargarEntrega(entrega._id, entrega.archivo_nombre ?? 'entrega');
    } catch (error) {
      setMensaje({ tone: 'error', texto: errorMessage(error) });
    }
  }

  return (
    <Drawer
      open
      size="lg"
      title={actividad.titulo}
      subtitle={`${actividad.asignacion?.asignatura?.nombre ?? 'Asignatura'} · ${actividad.asignacion?.docente ? `${actividad.asignacion.docente.nombre} ${actividad.asignacion.docente.apellido}` : ''}`}
      onClose={onClose}
      onSubmit={actividad.puede_entregar ? (e) => void enviarEntrega(e) : undefined}
      submitLabel={reentrega ? 'Reemplazar mi entrega' : 'Entregar'}
      isSubmitting={enviar.isPending}
      submitDisabled={!puedeEnviar}
    >
      <div className="flex flex-wrap items-center gap-2">
        <TipoActividadChip value={actividad.tipo} />
        <EstadoEntregaBadge value={actividad.estado} />
        <span className="text-xs text-muted">{NOMBRES_COMPONENTE_SIEE[actividad.componente_siee]}</span>
      </div>

      <p className="whitespace-pre-wrap text-sm text-body">{actividad.descripcion}</p>

      <dl className="grid grid-cols-1 gap-3 rounded-lg bg-soft p-3 text-sm sm:grid-cols-2">
        <div>
          <dt className="text-xs text-muted">Límite de entrega</dt>
          <dd className="font-semibold text-ink">{formatoInstante(actividad.fecha_entrega)}</dd>
        </div>
        <div>
          <dt className="text-xs text-muted">Entregas tardías</dt>
          <dd className="font-semibold text-ink">{actividad.permite_entrega_tardia ? 'Se aceptan, marcadas con retraso' : 'No se aceptan'}</dd>
        </div>
        {actividad.requiere_entrega && (
          <div className="sm:col-span-2">
            <dt className="text-xs text-muted">Cómo entregar</dt>
            <dd className="font-semibold text-ink">
              {conArchivo ? `Un archivo: ${actividad.formatos_permitidos.map(etiquetaDeFormato).join(', ')}` : 'Escribe tu respuesta en la plataforma'}
            </dd>
          </div>
        )}
      </dl>

      {entrega?.fecha_entrega && (
        <div className="space-y-2 rounded-lg border border-border p-3 text-sm">
          <p className="font-semibold text-ink">Tu entrega</p>
          <p className="text-xs text-muted">
            Enviada el {formatoInstante(entrega.fecha_entrega)}
            {entrega.con_retraso ? ' · con retraso' : ''}
          </p>
          {entrega.tiene_archivo && (
            <Button type="button" variant="soft-edit" onClick={() => void bajarMiArchivo()}>
              Descargar {entrega.archivo_nombre ?? 'mi archivo'}
            </Button>
          )}
          {entrega.texto_entrega && <p className="whitespace-pre-wrap rounded-lg bg-soft p-3 text-body">{entrega.texto_entrega}</p>}
        </div>
      )}

      {actividad.estado === 'CALIFICADA' && entrega && (
        <Alert tone="success">
          <p className="font-semibold">Nota: {entrega.calificacion_numerica}</p>
          {entrega.retroalimentacion && <p className="mt-1">{entrega.retroalimentacion}</p>}
        </Alert>
      )}

      {mensaje && <Alert tone={mensaje.tone}>{mensaje.texto}</Alert>}

      {actividad.puede_entregar ? (
        <div className="space-y-3">
          {conArchivo && (
            <Dropzone
              file={archivo}
              onFile={setArchivo}
              extensiones={extensionesDe(actividad.formatos_permitidos)}
              maxBytes={MAX_BYTES_ENTREGA}
              hint={`${actividad.formatos_permitidos.map(etiquetaDeFormato).join(', ')} · máximo 10 MB`}
              disabled={enviar.isPending}
            />
          )}
          <Textarea
            label={conArchivo ? 'Comentario para tu docente (opcional)' : 'Tu respuesta'}
            rows={conArchivo ? 3 : 8}
            maxLength={10000}
            value={texto}
            onChange={(e) => setTexto(e.target.value)}
          />
          {actividad.vencida && <Alert tone="warning">El plazo ya venció: tu entrega quedará marcada «Entregada con retraso».</Alert>}
          {reentrega && <p className="text-xs text-muted">Puedes reemplazar tu entrega hasta que tu docente la califique.</p>}
        </div>
      ) : (
        actividad.motivo_bloqueo && actividad.estado !== 'CALIFICADA' && <Alert tone="info">{actividad.motivo_bloqueo}</Alert>
      )}
    </Drawer>
  );
}
