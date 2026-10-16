import { Alert, errorMessage } from '../ui/Alert';
import { ProgressBar } from '../ui/ProgressBar';
import { Spinner } from '../ui/Spinner';
import { useAnalisisActividad } from '../../hooks/useActividades';

function Dato({ etiqueta, valor, detalle }: { etiqueta: string; valor: string; detalle?: string }) {
  return (
    <div className="rounded-lg bg-soft px-3 py-2">
      <p className="text-xs text-muted">{etiqueta}</p>
      <p className="text-h3 text-ink">{valor}</p>
      {detalle && <p className="text-xs text-muted">{detalle}</p>}
    </div>
  );
}

/** Cómo va la actividad: entregas, calificaciones y cómo se reparte el grupo por nivel de desempeño. */
export function AnalisisDeActividad({ actividadId, requiereEntrega }: { actividadId: string; requiereEntrega: boolean }) {
  const analisis = useAnalisisActividad(actividadId);
  if (analisis.isLoading) return <Spinner />;
  if (analisis.isError) return <Alert tone="error">{errorMessage(analisis.error)}</Alert>;
  const a = analisis.data;
  if (!a) return null;
  const maximo = Math.max(1, ...a.distribucion.map((d) => d.cantidad));

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {requiereEntrega && <Dato etiqueta="Entregaron" valor={`${a.entregaron}/${a.total_estudiantes}`} detalle={`${a.porcentaje_entrega}%`} />}
        {requiereEntrega && <Dato etiqueta="Con retraso" valor={String(a.con_retraso)} detalle={a.con_varios_intentos > 0 ? `${a.con_varios_intentos} con varios intentos` : undefined} />}
        <Dato etiqueta="Calificados" valor={`${a.calificados}/${a.total_estudiantes}`} detalle={`${a.porcentaje_calificado}%`} />
        <Dato etiqueta="Por calificar" valor={String(a.por_calificar)} />
      </div>

      {requiereEntrega && (
        <div className="space-y-1">
          <div className="flex justify-between text-xs text-muted">
            <span>Avance de entregas</span>
            <span>{a.porcentaje_entrega}%</span>
          </div>
          <ProgressBar value={a.entregaron} max={a.total_estudiantes} tone={a.porcentaje_entrega >= 80 ? 'green' : a.porcentaje_entrega >= 50 ? 'orange' : 'red'} label="Avance de entregas" />
        </div>
      )}

      {a.notas ? (
        <>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            <Dato etiqueta="Promedio" valor={String(a.notas.promedio)} />
            <Dato etiqueta="Mediana" valor={String(a.notas.mediana)} />
            <Dato etiqueta="Más alta" valor={String(a.notas.maxima)} />
            <Dato etiqueta="Más baja" valor={String(a.notas.minima)} />
          </div>
          <p className="text-sm text-body">
            Aprueban <strong>{a.notas.aprueban}</strong> ({a.notas.porcentaje_aprueban}%) · pierden <strong>{a.notas.pierden}</strong>.
          </p>
          <div className="space-y-1.5">
            <p className="text-label text-ink">Distribución por desempeño</p>
            {a.distribucion.map((d) => (
              <div key={d.nivel} className="grid grid-cols-[6rem_1fr_2rem] items-center gap-2 text-sm">
                <span className="truncate text-body">{d.etiqueta}</span>
                <ProgressBar value={d.cantidad} max={maximo} tone={d.aprobatorio ? 'green' : 'red'} label={d.etiqueta} />
                <span className="text-right text-muted">{d.cantidad}</span>
              </div>
            ))}
          </div>
        </>
      ) : (
        <p className="text-sm text-muted">Cuando haya notas verás aquí el promedio y cómo se reparte el grupo.</p>
      )}
    </div>
  );
}
