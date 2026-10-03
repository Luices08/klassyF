import { Alert, errorMessage } from '../components/ui/Alert';
import { Chip, TipoSituacionBadge } from '../components/ui/Badge';
import { LineaTiempo } from '../components/ui/LineaTiempo';
import { PageHeader } from '../components/ui/PageHeader';
import { Spinner } from '../components/ui/Spinner';
import { NOMBRES_ESTADO_CASO } from '../hooks/useCasos';
import { type ObservacionPropia, useMiObservador } from '../hooks/useObservaciones';
import { formatoFechaCalendario } from '../lib/fechas';

const textoDeSituacion = (situacion: string | null | undefined) =>
  situacion === 'EN_REVISION' ? 'En revisión por convivencia' : (NOMBRES_ESTADO_CASO as Record<string, string>)[situacion ?? ''] ?? 'En proceso';

function Detalle({ o }: { o: ObservacionPropia }) {
  if (o.clase === 'OBSERVACION') return <p className="whitespace-pre-line">{o.descripcion}</p>;
  if (o.gravedad === 'II' || o.gravedad === 'III') {
    return <p>Hay una situación de convivencia en proceso. Estado del caso: {textoDeSituacion(o.situacion)}. Convivencia te informará los detalles.</p>;
  }
  return (
    <div className="space-y-2">
      {o.falta && <p className="font-semibold">{o.falta.descripcion}</p>}
      <p className="whitespace-pre-line">{o.descripcion}</p>
      {o.version_estudiante && <p className="text-xs text-muted">Tu versión: {o.version_estudiante}</p>}
      {o.compromiso && <p className="text-xs text-muted">Compromiso: {o.compromiso}</p>}
    </div>
  );
}

/** El estudiante ve solo lo suyo: las observaciones que su institución marcó como visibles y sus faltas (de las graves, solo que hay un caso). */
export function MiObservadorPage() {
  const observador = useMiObservador();

  return (
    <div className="space-y-4">
      <PageHeader title="Mi observador" subtitle="Las observaciones y faltas que tus docentes registraron sobre ti." />
      {observador.isLoading && <Spinner />}
      {observador.isError && <Alert tone="error">{errorMessage(observador.error)}</Alert>}
      {observador.data && (
        <LineaTiempo
          vacio="Todavía no tienes observaciones visibles."
          items={observador.data.map((o) => ({
            key: o._id,
            fecha: formatoFechaCalendario(o.fecha_hecho),
            encabezado: (
              <>
                <Chip tone={o.clase === 'FALTA' ? 'orange' : 'blue'}>{o.tipo_nombre}</Chip>
                {o.clase === 'FALTA' && o.gravedad && <TipoSituacionBadge value={o.gravedad} />}
                {o.periodo_numero !== null && <Chip tone="neutral">Periodo {o.periodo_numero}</Chip>}
              </>
            ),
            children: <Detalle o={o} />,
          }))}
        />
      )}
    </div>
  );
}
