import { NOMBRES_ESTADO_CASO } from '../../hooks/useCasos';
import type { ObservacionPropia } from '../../hooks/useObservaciones';
import { formatoFechaCalendario } from '../../lib/fechas';
import { Chip, TipoSituacionBadge } from '../ui/Badge';
import { LineaTiempo } from '../ui/LineaTiempo';

const textoDeSituacion = (situacion: string | null | undefined) =>
  situacion === 'EN_REVISION' ? 'En revisión por convivencia' : (NOMBRES_ESTADO_CASO as Record<string, string>)[situacion ?? ''] ?? 'En proceso';

function Detalle({ o, paraFamilia }: { o: ObservacionPropia; paraFamilia: boolean }) {
  if (o.clase === 'OBSERVACION') return <p className="whitespace-pre-line">{o.descripcion}</p>;
  if (o.gravedad === 'II' || o.gravedad === 'III') {
    return <p>Hay una situación de convivencia en proceso. Estado del caso: {textoDeSituacion(o.situacion)}. Convivencia {paraFamilia ? 'se comunicará con ustedes' : 'te informará los detalles'}.</p>;
  }
  return (
    <div className="space-y-2">
      {o.falta && <p className="font-semibold">{o.falta.descripcion}</p>}
      <p className="whitespace-pre-line">{o.descripcion}</p>
      {o.version_estudiante && (
        <p className="text-xs text-muted">
          {paraFamilia ? 'Versión del estudiante' : 'Tu versión'}: {o.version_estudiante}
        </p>
      )}
      {o.compromiso && <p className="text-xs text-muted">Compromiso: {o.compromiso}</p>}
    </div>
  );
}

interface ObservadorFamiliaProps {
  registros: ObservacionPropia[];
  /** El texto habla del estudiante en tercera persona (portal del acudiente) en lugar de «tú». */
  paraFamilia?: boolean;
}

/** Lo que la institución deja ver de un observador a la familia: observaciones visibles y faltas (de las graves, solo que hay un caso y su estado). */
export function ObservadorFamilia({ registros, paraFamilia = false }: ObservadorFamiliaProps) {
  return (
    <LineaTiempo
      vacio={paraFamilia ? 'Todavía no hay observaciones visibles.' : 'Todavía no tienes observaciones visibles.'}
      items={registros.map((o) => ({
        key: o._id,
        fecha: formatoFechaCalendario(o.fecha_hecho),
        encabezado: (
          <>
            <Chip tone={o.clase === 'FALTA' ? 'orange' : 'blue'}>{o.tipo_nombre}</Chip>
            {o.clase === 'FALTA' && o.gravedad && <TipoSituacionBadge value={o.gravedad} />}
            {o.periodo_numero !== null && <Chip tone="neutral">Periodo {o.periodo_numero}</Chip>}
          </>
        ),
        children: <Detalle o={o} paraFamilia={paraFamilia} />,
      }))}
    />
  );
}
