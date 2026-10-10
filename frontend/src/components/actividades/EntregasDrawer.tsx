import { useState } from 'react';
import { Alert, errorMessage } from '../ui/Alert';
import { EstadoEntregaBadge } from '../ui/Badge';
import { Button } from '../ui/Button';
import { Drawer } from '../ui/Drawer';
import { Input } from '../ui/Field';
import { Spinner } from '../ui/Spinner';
import {
  type FilaEntrega,
  descargarEntrega,
  useCalificarEntrega,
  useEntregasDeActividad,
} from '../../hooks/useActividades';
import { formatoInstante } from '../../lib/actividades';
import type { EscalaEvaluacion } from '../../types/domain';

interface EntregasDrawerProps {
  /** Basta con saber cuál es: se usa desde la lista de actividades y desde la planilla de notas. */
  actividad: { _id: string; titulo: string } | null;
  onClose: () => void;
  /** Escala del año lectivo (CU-ADM-04): acota la nota que se puede digitar; el servidor la vuelve a validar. */
  escala: EscalaEvaluacion | null;
}

/**
 * Revisión de las evidencias de una actividad: quién entregó, cuándo, con qué archivo, y la nota. La nota va al endpoint
 * de calificación (puente hacia M12) y la entrega pasa sola a «Calificada».
 */
export function EntregasDrawer({ actividad, onClose, escala }: EntregasDrawerProps) {
  const entregas = useEntregasDeActividad(actividad?._id);
  const filas = entregas.data ?? [];
  const entregadas = filas.filter((f) => f.entrega?.fecha_entrega).length;
  const calificadas = filas.filter((f) => f.estado === 'CALIFICADA').length;

  return (
    <Drawer
      open={actividad !== null}
      size="lg"
      title={actividad ? `Entregas · ${actividad.titulo}` : 'Entregas'}
      subtitle={actividad && entregas.data ? `${entregadas} de ${filas.length} entregaron · ${calificadas} calificadas` : undefined}
      onClose={onClose}
    >
      {entregas.isLoading && (
        <div className="flex justify-center p-8">
          <Spinner />
        </div>
      )}
      {entregas.isError && <Alert tone="error">{errorMessage(entregas.error)}</Alert>}
      {entregas.data && filas.length === 0 && <Alert tone="info">Este grupo no tiene estudiantes con matrícula activa.</Alert>}
      {actividad && (
        <ul className="space-y-3">
          {filas.map((fila) => (
            <FilaEntregaEstudiante key={`${fila.estudiante._id}-${fila.entrega?.fecha_calificacion ?? ''}`} actividad={actividad} fila={fila} escala={escala} />
          ))}
        </ul>
      )}
    </Drawer>
  );
}

function FilaEntregaEstudiante({ actividad, fila, escala }: { actividad: { _id: string }; fila: FilaEntrega; escala: EscalaEvaluacion | null }) {
  const { entrega } = fila;
  const calificar = useCalificarEntrega();
  const [nota, setNota] = useState(entrega?.calificacion_numerica?.toString() ?? '');
  const [retro, setRetro] = useState(entrega?.retroalimentacion ?? '');
  const [mensaje, setMensaje] = useState<{ tone: 'success' | 'error'; texto: string } | null>(null);
  const [descargando, setDescargando] = useState(false);

  const notaNumerica = Number(nota);
  const notaValida = nota.trim() !== '' && Number.isFinite(notaNumerica) && notaNumerica >= 0;

  async function bajarArchivo() {
    if (!entrega) return;
    setMensaje(null);
    setDescargando(true);
    try {
      await descargarEntrega(entrega._id, entrega.archivo_nombre ?? 'entrega');
    } catch (error) {
      setMensaje({ tone: 'error', texto: errorMessage(error) });
    } finally {
      setDescargando(false);
    }
  }

  async function guardarNota() {
    setMensaje(null);
    try {
      await calificar.mutateAsync({
        actividadId: actividad._id,
        student_id: fila.estudiante._id,
        calificacion_numerica: notaNumerica,
        retroalimentacion: retro.trim(),
      });
      setMensaje({ tone: 'success', texto: 'Nota guardada.' });
    } catch (error) {
      setMensaje({ tone: 'error', texto: errorMessage(error) });
    }
  }

  return (
    <li className="space-y-3 rounded-xl border border-border p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="font-semibold text-ink">
            {fila.estudiante.apellido} {fila.estudiante.nombre}
          </p>
          <p className="text-xs text-muted">Documento {fila.estudiante.numero_documento}</p>
        </div>
        <div className="flex items-center gap-2">
          {entrega?.con_retraso && fila.estado === 'CALIFICADA' && <span className="text-xs text-warning">entregó con retraso</span>}
          <EstadoEntregaBadge value={fila.estado} sinEntrega />
        </div>
      </div>

      {entrega?.fecha_entrega && (
        <div className="space-y-1.5 text-sm text-body">
          <p className="text-xs text-muted">Entregó el {formatoInstante(entrega.fecha_entrega)}</p>
          {entrega.tiene_archivo && (
            <Button type="button" variant="soft-edit" isLoading={descargando} onClick={() => void bajarArchivo()}>
              Descargar {entrega.archivo_nombre ?? 'archivo'}
            </Button>
          )}
          {entrega.texto_entrega && <p className="whitespace-pre-wrap rounded-lg bg-soft p-3">{entrega.texto_entrega}</p>}
        </div>
      )}

      <div className="grid grid-cols-1 items-end gap-3 sm:grid-cols-[8rem_1fr_auto]">
        <Input
          label="Nota"
          type="number"
          inputMode="decimal"
          min={escala?.nota_minima ?? 0}
          max={escala?.nota_maxima}
          step="0.1"
          value={nota}
          onChange={(e) => setNota(e.target.value)}
        />
        <Input label="Retroalimentación" value={retro} onChange={(e) => setRetro(e.target.value)} />
        <Button type="button" isLoading={calificar.isPending} disabled={!notaValida} onClick={() => void guardarNota()}>
          Guardar nota
        </Button>
      </div>
      {mensaje && <Alert tone={mensaje.tone}>{mensaje.texto}</Alert>}
    </li>
  );
}
