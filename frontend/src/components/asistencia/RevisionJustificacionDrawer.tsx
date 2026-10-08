import { useState, type FormEvent } from 'react';
import { Alert, errorMessage } from '../ui/Alert';
import { Drawer } from '../ui/Drawer';
import { Select, Textarea } from '../ui/Field';
import { abrirSoporteJustificacion, useRevisarJustificacion } from '../../hooks/useAsistencia';
import { formatoFechaCalendario } from '../../lib/fechas';
import type { JustificacionAsistencia } from '../../types/domain';

/** Coordinación aprueba o rechaza la excusa; rechazar exige el motivo. Se monta solo al abrirse. */
export function RevisionJustificacionDrawer({
  justificacion,
  onClose,
}: {
  justificacion: JustificacionAsistencia;
  onClose: () => void;
}) {
  const revisar = useRevisarJustificacion();
  const [decision, setDecision] = useState<'APROBADA' | 'RECHAZADA'>('APROBADA');
  const [comentario, setComentario] = useState('');

  const { student_id: estudiante, inasistencia } = justificacion;

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    try {
      await revisar.mutateAsync({ id: justificacion._id, estado: decision, comentario });
    } catch {
      return; // el mensaje lo muestra la mutación; el drawer queda abierto
    }
    onClose();
  }

  return (
    <Drawer
      open
      title="Revisar justificación"
      subtitle={`${estudiante.apellido} ${estudiante.nombre}`}
      onClose={onClose}
      onSubmit={(e) => void handleSubmit(e)}
      submitLabel={decision === 'APROBADA' ? 'Aprobar' : 'Rechazar'}
      submitVariant={decision === 'APROBADA' ? 'primary' : 'soft-danger'}
      isSubmitting={revisar.isPending}
      submitDisabled={decision === 'RECHAZADA' && comentario.trim().length === 0}
    >
      {revisar.isError && <Alert tone="error">{errorMessage(revisar.error)}</Alert>}

      <dl className="space-y-2 text-sm">
        <div>
          <dt className="text-muted">Inasistencia</dt>
          <dd className="text-ink">
            {formatoFechaCalendario(inasistencia.fecha)} · {inasistencia.asignatura} · Grupo {inasistencia.grupo}
          </dd>
        </div>
        <div>
          <dt className="text-muted">Motivo</dt>
          <dd className="text-ink">{justificacion.motivo}</dd>
        </div>
        {justificacion.acudiente_id && (
          <div>
            <dt className="text-muted">Presentada por</dt>
            <dd className="text-ink">
              {justificacion.acudiente_id.nombre} {justificacion.acudiente_id.apellido}
            </dd>
          </div>
        )}
        <div>
          <dt className="text-muted">Soporte</dt>
          <dd>
            {justificacion.tiene_soporte ? (
              <button
                type="button"
                className="font-semibold text-primary hover:underline"
                onClick={() => void abrirSoporteJustificacion(justificacion._id)}
              >
                {justificacion.archivo_nombre ?? 'Ver soporte'}
              </button>
            ) : (
              <span className="text-muted">Sin soporte adjunto</span>
            )}
          </dd>
        </div>
      </dl>

      <Select label="Decisión" value={decision} onChange={(e) => setDecision(e.target.value as 'APROBADA' | 'RECHAZADA')}>
        <option value="APROBADA">Aprobar: la falla pasa a justificada</option>
        <option value="RECHAZADA">Rechazar: la falla sigue como injustificada</option>
      </Select>
      <Textarea
        label={decision === 'RECHAZADA' ? 'Motivo del rechazo' : 'Comentario (opcional)'}
        value={comentario}
        maxLength={500}
        onChange={(e) => setComentario(e.target.value)}
      />
    </Drawer>
  );
}
