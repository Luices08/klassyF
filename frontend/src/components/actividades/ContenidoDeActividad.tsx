import { useState } from 'react';
import { Alert, errorMessage } from '../ui/Alert';
import { ContenidoRico } from '../ui/ContenidoRico';
import { DownloadIcon, PaperclipIcon } from '../ui/icons';
import { type Actividad, descargarAdjunto } from '../../hooks/useActividades';
import { ETIQUETAS_CAMPO_MODIFICADO, NOMBRES_TIPO_ADJUNTO, formatoInstante, formatoTamano } from '../../lib/actividades';

/** Lo que el docente puso en la actividad: instrucciones, videos incrustados, archivos de apoyo y qué cambió después de publicarla. */
export function ContenidoDeActividad({ actividad }: { actividad: Actividad }) {
  const [error, setError] = useState<string | null>(null);

  async function bajar(adjunto: Actividad['adjuntos'][number]) {
    setError(null);
    try {
      await descargarAdjunto(actividad._id, adjunto);
    } catch (e) {
      setError(errorMessage(e));
    }
  }

  return (
    <div className="space-y-4">
      {actividad.contenido_html ? (
        <ContenidoRico html={actividad.contenido_html} />
      ) : (
        <p className="whitespace-pre-wrap text-body">{actividad.descripcion}</p>
      )}

      {actividad.videos.length > 0 && (
        <div className={`grid gap-3 ${actividad.videos.length > 1 ? 'sm:grid-cols-2' : ''}`}>
          {actividad.videos.map((v) => (
            <div key={`${v.proveedor}-${v.video_id}`} className="aspect-video overflow-hidden rounded-xl border border-border bg-soft">
              <iframe
                src={v.url_incrustada}
                title={`Video de la actividad (${v.proveedor === 'YOUTUBE' ? 'YouTube' : 'Vimeo'})`}
                className="h-full w-full"
                loading="lazy"
                referrerPolicy="strict-origin-when-cross-origin"
                allow="accelerometer; encrypted-media; gyroscope; picture-in-picture; fullscreen"
                allowFullScreen
              />
            </div>
          ))}
        </div>
      )}

      {actividad.adjuntos.length > 0 && (
        <div className="space-y-1.5">
          <p className="text-label text-ink">Material de apoyo</p>
          {error && <Alert tone="error">{error}</Alert>}
          <ul className="space-y-1.5">
            {actividad.adjuntos.map((a) => (
              <li key={a.id}>
                <button
                  type="button"
                  onClick={() => void bajar(a)}
                  className="flex w-full items-center justify-between gap-3 rounded-lg bg-primary-soft px-3 py-2 text-left text-sm text-primary hover:bg-primary-soft/70"
                >
                  <span className="flex min-w-0 items-center gap-2">
                    <PaperclipIcon className="h-4 w-4 shrink-0" />
                    <span className="truncate">{a.nombre}</span>
                    <span className="shrink-0 text-xs text-muted">
                      {NOMBRES_TIPO_ADJUNTO[a.tipo]} · {formatoTamano(a.bytes)}
                    </span>
                  </span>
                  <DownloadIcon className="h-4 w-4 shrink-0" />
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}

      {actividad.modificaciones.length > 0 && (
        <Alert tone="info">
          <p className="font-semibold">El docente modificó esta actividad después de publicarla.</p>
          <ul className="mt-1 list-disc pl-5 text-sm">
            {actividad.modificaciones.map((m) => (
              <li key={m.fecha}>
                {formatoInstante(m.fecha)}: cambió {m.campos.map((c) => ETIQUETAS_CAMPO_MODIFICADO[c] ?? c).join(', ')}
              </li>
            ))}
          </ul>
        </Alert>
      )}
    </div>
  );
}
