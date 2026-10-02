import { Alert, errorMessage } from '../components/ui/Alert';
import { Chip } from '../components/ui/Badge';
import { LineaTiempo } from '../components/ui/LineaTiempo';
import { PageHeader } from '../components/ui/PageHeader';
import { Spinner } from '../components/ui/Spinner';
import { useMiObservador } from '../hooks/useObservaciones';
import { formatoFechaCalendario } from '../lib/fechas';

/** El estudiante ve solo lo suyo y solo el texto final de lo que su institución marcó como visible. */
export function MiObservadorPage() {
  const observador = useMiObservador();

  return (
    <div className="space-y-4">
      <PageHeader title="Mi observador" subtitle="Las observaciones que tus docentes registraron sobre ti." />
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
                <Chip tone="blue">{o.tipo_nombre}</Chip>
                {o.periodo_numero !== null && <Chip tone="neutral">Periodo {o.periodo_numero}</Chip>}
              </>
            ),
            children: <p className="whitespace-pre-line">{o.texto_generado}</p>,
          }))}
        />
      )}
    </div>
  );
}
