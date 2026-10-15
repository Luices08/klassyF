import { useQuery } from '@tanstack/react-query';
import { type ReactNode, useEffect, useState } from 'react';
import { Alert, errorMessage } from './Alert';
import { Button } from './Button';
import { Card, CardHeader } from './Card';
import { RefreshIcon, XIcon } from './icons';
import { Spinner } from './Spinner';

interface VistaPreviaPdfProps {
  /** Clave de caché: cambia cuando cambia lo que se previsualiza (el PDF se vuelve a pedir). */
  claveConsulta: readonly unknown[];
  /** Pide el PDF con la sesión del usuario (nunca por URL directa) y devuelve su blob. */
  cargar: () => Promise<{ url: string; blob: Blob }>;
  nombreArchivo: string;
  titulo?: string;
  onCerrar?: () => void;
  /** Aviso o texto que se muestra sobre el visor. */
  nota?: ReactNode;
  /** Alto del visor (clase de Tailwind); por defecto 75% de la pantalla. Un panel lateral usa uno menor. */
  altoVisor?: string;
}

/**
 * Muestra un PDF dentro de la página antes de descargarlo. El PDF es el mismo que se descarga: lo que se ve es lo que se imprime.
 *
 * El blob es lo que se guarda en la consulta; el blob URL se crea y se libera dentro de un mismo efecto. Así sobrevive al doble montaje de
 * React en desarrollo (que ejecuta el efecto, lo limpia y lo vuelve a ejecutar): liberar un URL guardado dejaba el visor en blanco.
 */
export function VistaPreviaPdf({ claveConsulta, cargar, nombreArchivo, titulo = 'Vista previa', onCerrar, nota, altoVisor = 'h-[75vh]' }: VistaPreviaPdfProps) {
  const consulta = useQuery({
    queryKey: ['vista-previa-pdf', ...claveConsulta],
    queryFn: async () => {
      const { url, blob } = await cargar();
      URL.revokeObjectURL(url);
      return blob;
    },
    gcTime: 0,
    staleTime: 0,
  });
  const blob = consulta.data;

  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    if (!blob) {
      setUrl(null);
      return;
    }
    const nuevo = URL.createObjectURL(blob);
    setUrl(nuevo);
    return () => URL.revokeObjectURL(nuevo);
  }, [blob]);

  function descargar() {
    if (!url) return;
    const enlace = document.createElement('a');
    enlace.href = url;
    enlace.download = nombreArchivo;
    enlace.click();
  }

  return (
    <Card>
      <CardHeader
        title={titulo}
        action={
          <div className="flex flex-wrap gap-2">
            <Button type="button" variant="secondary" onClick={() => void consulta.refetch()} isLoading={consulta.isFetching}>
              <RefreshIcon className="h-4 w-4" />
              Actualizar
            </Button>
            <Button type="button" variant="outline" disabled={!url} onClick={descargar}>
              Descargar PDF
            </Button>
            {onCerrar && (
              <Button type="button" variant="secondary" onClick={onCerrar}>
                <XIcon className="h-4 w-4" />
                Cerrar
              </Button>
            )}
          </div>
        }
      />
      {nota}
      {consulta.isLoading && <Spinner label="Preparando la vista previa..." />}
      {consulta.isError && <Alert tone="error">{errorMessage(consulta.error)}</Alert>}
      {url && <iframe src={`${url}#view=FitH`} title={titulo} className={`${altoVisor} w-full rounded-lg border border-border bg-soft`} />}
    </Card>
  );
}
