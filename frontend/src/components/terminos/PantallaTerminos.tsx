import { useState } from 'react';
import { usePublicInstitutionInfo } from '../../hooks/usePublicInfo';
import { formatoFechaCalendario } from '../../lib/fechas';
import { conInstitucion, type DocumentoTerminos } from '../../lib/terminos';
import { Alert, errorMessage } from '../ui/Alert';
import { Button } from '../ui/Button';
import { BanIcon, FileTextIcon } from '../ui/icons';
import { Spinner } from '../ui/Spinner';

interface Props {
  documento: DocumentoTerminos;
  onAceptar: () => void;
  guardando?: boolean;
  error?: unknown;
  /** Acción extra en la pantalla de rechazo (p. ej. cerrar la sesión en los términos del perfil). */
  accionRechazo?: { etiqueta: string; onClick: () => void };
}

/** Mientras se carga o si falla lo necesario para decidir, tampoco se deja pasar. */
export function PantallaTerminosEspera({ error, onReintentar }: { error?: unknown; onReintentar?: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-soft px-4">
      {error ? (
        <div className="w-full max-w-md space-y-3 rounded-xl border border-border bg-surface p-5">
          <Alert tone="error">No se pudieron cargar los términos y condiciones: {errorMessage(error)}</Alert>
          {onReintentar && (
            <div className="flex justify-end">
              <Button onClick={onReintentar}>Reintentar</Button>
            </div>
          )}
        </div>
      ) : (
        <Spinner label="Cargando términos y condiciones..." />
      )}
    </div>
  );
}

/** Ocupa toda la ventana: mientras no se acepten los términos no se ve nada más de la plataforma. */
export function PantallaTerminos({ documento, onAceptar, guardando, error, accionRechazo }: Props) {
  const { data: info } = usePublicInstitutionInfo();
  const institucion = info?.nombre || 'la institución educativa';
  const [leido, setLeido] = useState(false);
  const [rechazado, setRechazado] = useState(false);
  const texto = (t: string) => conInstitucion(t, institucion);

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-soft px-4 py-6 sm:py-10">
      <div className="mx-auto w-full max-w-3xl rounded-xl border border-border bg-surface shadow-sm">
        <header className="flex items-center gap-3 border-b border-border p-5">
          {info?.logo_url ? (
            <img src={info.logo_url} alt="" className="h-12 w-12 shrink-0 rounded-xl border border-border object-contain p-1" />
          ) : (
            <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-primary-soft text-primary">
              <FileTextIcon className="h-6 w-6" />
            </span>
          )}
          <div className="min-w-0">
            <h1 className="text-h3 text-ink">{documento.titulo}</h1>
            <p className="text-sm text-muted">
              {institucion} · Versión {documento.version} · Vigente desde {formatoFechaCalendario(documento.vigente_desde)}
            </p>
          </div>
        </header>

        {rechazado ? (
          <div className="space-y-4 p-5">
            <div className="flex flex-col items-center gap-3 py-6 text-center">
              <span className="flex h-14 w-14 items-center justify-center rounded-full bg-danger-soft text-danger">
                <BanIcon className="h-7 w-7" />
              </span>
              <h2 className="text-h3 text-ink">No puede ingresar a la plataforma</h2>
              <p className="max-w-md text-body">
                Si no se aceptan los términos y condiciones, no se puede ingresar a la plataforma. Puede revisarlos de nuevo cuando quiera.
              </p>
            </div>
            <div className="flex flex-wrap justify-center gap-2">
              {accionRechazo && (
                <Button variant="secondary" onClick={accionRechazo.onClick}>
                  {accionRechazo.etiqueta}
                </Button>
              )}
              <Button onClick={() => setRechazado(false)}>Revisar los términos de nuevo</Button>
            </div>
          </div>
        ) : (
          <>
            <div className="max-h-[60vh] space-y-4 overflow-y-auto p-5 text-body">
              <p>{texto(documento.introduccion)}</p>
              {documento.secciones.map((seccion) => (
                <section key={seccion.titulo} className="space-y-2">
                  <h2 className="font-semibold text-ink">{seccion.titulo}</h2>
                  {seccion.parrafos.map((parrafo, i) => (
                    <p key={i} className="text-sm leading-relaxed">
                      {texto(parrafo)}
                    </p>
                  ))}
                </section>
              ))}
            </div>

            <footer className="space-y-3 border-t border-border p-5">
              <Alert tone="info">Si rechaza estos términos no podrá ingresar a la plataforma.</Alert>
              {Boolean(error) && <Alert tone="error">{errorMessage(error)}</Alert>}
              <label className="flex items-start gap-2 text-sm text-body">
                <input type="checkbox" className="mt-0.5" checked={leido} onChange={(e) => setLeido(e.target.checked)} />
                <span>He leído y acepto los términos y condiciones.</span>
              </label>
              <div className="flex flex-wrap justify-end gap-2">
                <Button variant="soft-danger" onClick={() => setRechazado(true)}>
                  Rechazar
                </Button>
                <Button disabled={!leido} isLoading={guardando} onClick={onAceptar}>
                  Aceptar y continuar
                </Button>
              </div>
            </footer>
          </>
        )}
      </div>
    </div>
  );
}
