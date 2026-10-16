import { useState } from 'react';
import { Alert, errorMessage } from '../ui/Alert';
import { Button } from '../ui/Button';
import { Input } from '../ui/Field';
import { type AccesoEspecial, useOtorgarAccesoEspecial, useRevocarAccesoEspecial } from '../../hooks/useActividades';
import { aInputInstante, aInstante, formatoInstante } from '../../lib/actividades';

interface AccesoEspecialFormProps {
  actividadId: string;
  estudianteId: string;
  /** Fecha límite de la actividad: el plazo personal tiene que ser posterior. */
  fechaEntrega: string;
  acceso: AccesoEspecial | null;
  /** Solo el docente titular lo da; los demás lo ven. */
  puedeGestionar: boolean;
}

/**
 * Plazo personal para un estudiante con una excusa válida: entrega pasada la fecha de la actividad sin quedar como tardío.
 * El motivo queda guardado en la actividad y solo lo ven quienes la gestionan.
 */
export function AccesoEspecialForm({ actividadId, estudianteId, fechaEntrega, acceso, puedeGestionar }: AccesoEspecialFormProps) {
  const otorgar = useOtorgarAccesoEspecial();
  const revocar = useRevocarAccesoEspecial();
  const [abierto, setAbierto] = useState(false);
  const [limite, setLimite] = useState(acceso ? aInputInstante(acceso.fecha_limite) : '');
  const [motivo, setMotivo] = useState(acceso?.motivo ?? '');
  const [error, setError] = useState<string | null>(null);

  async function guardar() {
    setError(null);
    try {
      await otorgar.mutateAsync({ actividadId, student_id: estudianteId, fecha_limite: aInstante(limite), motivo: motivo.trim() });
      setAbierto(false);
    } catch (e) {
      setError(errorMessage(e));
    }
  }

  async function quitar() {
    if (!window.confirm('¿Quitar el plazo personal de este estudiante?')) return;
    setError(null);
    try {
      await revocar.mutateAsync({ actividadId, studentId: estudianteId });
    } catch (e) {
      setError(errorMessage(e));
    }
  }

  return (
    <div className="space-y-2 rounded-lg border border-border bg-soft p-3 text-sm">
      {acceso ? (
        <div className="space-y-1">
          <p className="font-semibold text-ink">Acceso especial hasta {formatoInstante(acceso.fecha_limite)}</p>
          <p className="text-body">Motivo: {acceso.motivo}</p>
        </div>
      ) : (
        <p className="text-muted">Si tiene una excusa válida, puedes darle un plazo personal para entregar sin que cuente como tardía.</p>
      )}
      {error && <Alert tone="error">{error}</Alert>}
      {puedeGestionar && !abierto && (
        <div className="flex flex-wrap gap-2">
          <Button type="button" variant="soft-edit" onClick={() => setAbierto(true)}>
            {acceso ? 'Cambiar plazo' : 'Dar plazo personal'}
          </Button>
          {acceso && (
            <Button type="button" variant="soft-danger" isLoading={revocar.isPending} onClick={() => void quitar()}>
              Quitar
            </Button>
          )}
        </div>
      )}
      {puedeGestionar && abierto && (
        <div className="space-y-2">
          <Input
            label="Puede entregar hasta (hora de Colombia)"
            type="datetime-local"
            min={aInputInstante(fechaEntrega)}
            value={limite}
            onChange={(e) => setLimite(e.target.value)}
          />
          <Input label="Motivo" value={motivo} maxLength={300} hint="Por ejemplo: incapacidad médica, calamidad familiar." onChange={(e) => setMotivo(e.target.value)} />
          <div className="flex justify-end gap-2">
            <Button type="button" variant="secondary" onClick={() => setAbierto(false)}>
              Cancelar
            </Button>
            <Button type="button" isLoading={otorgar.isPending} disabled={!limite || motivo.trim().length < 5} onClick={() => void guardar()}>
              Guardar plazo
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
