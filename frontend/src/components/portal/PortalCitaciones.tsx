import { useCitacionesDelHijo, useResponderCitacionDelHijo } from '../../hooks/useCitaciones';
import { formatoFechaHora } from '../../lib/fechas';
import { EstadoCitacionChip, RespuestaChip } from '../citaciones/chipsCitacion';
import { Alert, errorMessage } from '../ui/Alert';
import { Button } from '../ui/Button';
import { Card } from '../ui/Card';
import { Spinner } from '../ui/Spinner';

/** Citaciones del colegio a este estudiante, con el botón para confirmar o avisar que no se podrá asistir (M24). */
export function PortalCitaciones({ studentId }: { studentId: string }) {
  const { data, isLoading, isError, error } = useCitacionesDelHijo(studentId);
  const responder = useResponderCitacionDelHijo(studentId);

  return (
    <div className="space-y-4">
      {isLoading && <Spinner />}
      {isError && <Alert tone="error">{errorMessage(error)}</Alert>}
      {responder.isError && <Alert tone="error">{errorMessage(responder.error)}</Alert>}
      {data && data.length === 0 && <Alert tone="info">El colegio no ha enviado citaciones para este estudiante.</Alert>}
      {(data ?? []).map((c) => (
        <Card key={c.destinatario_id}>
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h3 className="text-h3 text-ink">{c.titulo}</h3>
              <p className="text-sm text-muted">
                {c.motivo} · convoca {c.convocante} ({c.convocante_cargo})
              </p>
            </div>
            <EstadoCitacionChip estado={c.estado} />
          </div>
          <p className="mt-2 text-sm text-body">
            <span className="font-semibold text-ink">{formatoFechaHora(c.fecha_hora)}</span> · {c.lugar}
          </p>
          {c.descripcion && <p className="mt-2 whitespace-pre-line text-sm text-body">{c.descripcion}</p>}
          {c.motivo_cancelacion && <p className="mt-2 text-sm text-body">Motivo de la cancelación: {c.motivo_cancelacion}</p>}
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <RespuestaChip respuesta={c.respuesta} />
            {c.puede_responder ? (
              <>
                <Button disabled={responder.isPending || c.respuesta === 'CONFIRMADA'} onClick={() => responder.mutate({ destinatarioId: c.destinatario_id, respuesta: 'CONFIRMADA' })}>
                  Confirmar asistencia
                </Button>
                <Button variant="outline" disabled={responder.isPending || c.respuesta === 'NO_ASISTIRA'} onClick={() => responder.mutate({ destinatarioId: c.destinatario_id, respuesta: 'NO_ASISTIRA' })}>
                  No podré asistir
                </Button>
              </>
            ) : (
              c.motivo_no_responder && <span className="text-xs text-muted">{c.motivo_no_responder}</span>
            )}
          </div>
        </Card>
      ))}
    </div>
  );
}
