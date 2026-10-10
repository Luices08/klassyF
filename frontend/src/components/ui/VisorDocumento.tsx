import { useRef } from 'react';
import { Button } from './Button';

interface VisorDocumentoProps {
  /** URL del PDF (un blob bajado con la sesión: nunca una URL directa). */
  url: string;
  titulo: string;
  /** Nombre con el que se descarga. */
  nombreArchivo: string;
  /** Alto del visor; por defecto 70% de la pantalla. */
  className?: string;
}

/**
 * Muestra un PDF dentro de la propia pantalla (sin obligar a abrir otra pestaña ni a ir a otra sección), con descargar, imprimir y
 * abrir en una pestaña aparte. Lo usan los certificados al expedir, en el historial y en la vista previa de las plantillas.
 */
export function VisorDocumento({ url, titulo, nombreArchivo, className = 'h-[70vh]' }: VisorDocumentoProps) {
  const marco = useRef<HTMLIFrameElement>(null);

  const imprimir = () => {
    try {
      marco.current?.contentWindow?.focus();
      marco.current?.contentWindow?.print();
    } catch {
      // Algunos navegadores no dejan imprimir desde el visor incrustado: queda "Abrir en otra pestaña".
      window.open(url, '_blank');
    }
  };

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm font-semibold text-ink">{titulo}</p>
        <div className="flex flex-wrap gap-2">
          <a href={url} download={nombreArchivo}>
            <Button type="button" variant="outline" className="px-3 py-1 text-xs">
              Descargar
            </Button>
          </a>
          <Button type="button" variant="outline" className="px-3 py-1 text-xs" onClick={imprimir}>
            Imprimir
          </Button>
          <a href={url} target="_blank" rel="noreferrer">
            <Button type="button" variant="secondary" className="px-3 py-1 text-xs">
              Abrir en otra pestaña
            </Button>
          </a>
        </div>
      </div>
      <iframe ref={marco} src={url} title={titulo} className={`w-full rounded-lg border border-border bg-soft ${className}`} />
    </div>
  );
}
