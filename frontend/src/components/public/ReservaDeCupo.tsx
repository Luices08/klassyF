import { Alert } from '../ui/Alert';
import type { EstadoSolicitudResultado } from '../../hooks/useAdmissionRequests';
import { formatoFechaCalendario } from '../../lib/fechas';

/**
 * Lo que la familia ve de su solicitud en prematrícula (sitio público): el cupo apartado en un grado, sede y jornada, o su turno en la lista de espera.
 * Nunca trae datos de otras familias. Se suma a los estados de siempre; no los reemplaza.
 */
export function ReservaDeCupo({ resultado }: { resultado: EstadoSolicitudResultado }) {
  const r = resultado.reserva;
  if (!r) return null;
  const donde = `${r.grado}${r.anio ? ` ${r.anio}` : ''} · ${r.sede} · jornada ${r.jornada}`;

  if (resultado.estado === 'EN_ESPERA') {
    return (
      <Alert tone="info">
        Estás en la <strong>lista de espera</strong> para {donde}
        {resultado.posicion_espera ? ` (turno ${resultado.posicion_espera})` : ''}. Los cupos se dan por orden de inscripción: la secretaría se comunicará contigo cuando se libere uno.
      </Alert>
    );
  }

  return (
    <Alert tone={r.vencida ? 'warning' : 'success'}>
      {r.vencida ? (
        <>
          Tu cupo estaba reservado para {donde}, pero pasó el último día para matricular
          {r.fecha_limite_matricula ? ` (${formatoFechaCalendario(r.fecha_limite_matricula)})` : ''}. Comunícate con la secretaría para saber si aún hay lugar.
        </>
      ) : (
        <>
          <strong>Tu cupo está reservado</strong> para {donde}.
          {r.fecha_limite_matricula ? ` Preséntate a matricular a más tardar el ${formatoFechaCalendario(r.fecha_limite_matricula)}.` : ' La secretaría te dirá cuándo presentarte a matricular.'} Aún no es una matrícula: se formaliza con tus documentos.
        </>
      )}
    </Alert>
  );
}
