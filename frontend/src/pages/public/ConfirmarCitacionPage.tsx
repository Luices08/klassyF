import { Link, useParams } from 'react-router-dom';
import { EstadoCitacionChip, RespuestaChip } from '../../components/citaciones/chipsCitacion';
import { Alert, errorMessage } from '../../components/ui/Alert';
import { Button } from '../../components/ui/Button';
import { Card } from '../../components/ui/Card';
import { Spinner } from '../../components/ui/Spinner';
import { useCitacionPublica, useResponderCitacionPublica } from '../../hooks/useCitaciones';
import { formatoFechaHora } from '../../lib/fechas';

/**
 * Confirmación de asistencia desde el correo (M24), sin iniciar sesión: el enlace lleva un código único del acudiente. El botón del correo
 * abre esta página en vez de confirmar directamente porque algunos programas de correo abren los enlaces por su cuenta para revisarlos, y
 * eso confirmaría la asistencia sin que la persona lo decidiera.
 */
export function ConfirmarCitacionPage() {
  const { token = '' } = useParams<{ token: string }>();
  const citacion = useCitacionPublica(token);
  const responder = useResponderCitacionPublica(token);
  const c = citacion.data;

  return (
    <div className="min-h-screen bg-soft text-body">
      <header className="border-b border-border bg-surface">
        <div className="mx-auto flex h-16 max-w-2xl items-center justify-between px-4 sm:px-6">
          <span className="text-sm font-semibold text-ink">{c?.institucion || 'Citación'}</span>
          <Link to="/" className="text-sm font-semibold text-primary hover:underline">
            Ir al inicio
          </Link>
        </div>
      </header>
      <main className="mx-auto max-w-2xl space-y-4 px-4 py-8 sm:px-6">
        {citacion.isLoading && <Spinner label="Buscando la citación…" />}
        {citacion.isError && <Alert tone="error">{errorMessage(citacion.error)}</Alert>}
        {responder.isError && <Alert tone="error">{errorMessage(responder.error)}</Alert>}

        {c && (
          <Card>
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h1 className="text-h3 text-ink">{c.titulo}</h1>
                <p className="text-sm text-muted">
                  {c.motivo} · por {c.estudiante}
                </p>
              </div>
              <EstadoCitacionChip estado={c.estado} />
            </div>
            <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-2">
              <div>
                <dt className="text-label text-muted">Fecha y hora</dt>
                <dd className="font-semibold text-ink">{formatoFechaHora(c.fecha_hora)}</dd>
              </div>
              <div>
                <dt className="text-label text-muted">Lugar</dt>
                <dd className="font-semibold text-ink">{c.lugar}</dd>
              </div>
              <div className="sm:col-span-2">
                <dt className="text-label text-muted">Convoca</dt>
                <dd className="font-semibold text-ink">
                  {c.convocante} ({c.convocante_cargo})
                </dd>
              </div>
            </dl>
            {c.descripcion && <p className="mt-3 whitespace-pre-line text-sm text-body">{c.descripcion}</p>}

            <div className="mt-5 space-y-3">
              <div className="flex items-center gap-2 text-sm">
                <span className="text-muted">Tu respuesta:</span>
                <RespuestaChip respuesta={c.respuesta} />
              </div>
              {c.puede_responder ? (
                <div className="flex flex-wrap gap-2">
                  <Button disabled={responder.isPending || c.respuesta === 'CONFIRMADA'} onClick={() => responder.mutate('CONFIRMADA')}>
                    Confirmar asistencia
                  </Button>
                  <Button variant="outline" disabled={responder.isPending || c.respuesta === 'NO_ASISTIRA'} onClick={() => responder.mutate('NO_ASISTIRA')}>
                    No podré asistir
                  </Button>
                </div>
              ) : (
                <Alert tone="info">{c.motivo_no_responder}</Alert>
              )}
              {responder.isSuccess && <Alert tone="success">Registramos tu respuesta. Puedes volver a este enlace para cambiarla hasta que comience la reunión.</Alert>}
            </div>
          </Card>
        )}
      </main>
    </div>
  );
}
