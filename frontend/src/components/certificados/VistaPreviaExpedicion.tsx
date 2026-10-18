import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { Alert, errorMessage } from '../ui/Alert';
import { Card } from '../ui/Card';
import { Spinner } from '../ui/Spinner';
import { descargarVistaPrevia, type EntradaExpedicion } from '../../hooks/useCertificados';
import { useDebouncedValue } from '../../hooks/useDebouncedValue';

interface VistaPreviaExpedicionProps {
  /** Lo que se va a expedir; `null` mientras falta elegir estudiante o documento. */
  entrada: EntradaExpedicion | null;
  /** Por qué todavía no se puede mostrar (p. ej. faltan confirmar dependencias). */
  motivoPausa?: string | null;
}

/**
 * El documento tal como saldrá, con los datos reales del estudiante, que se vuelve a dibujar solo al cambiar cualquier opción.
 * Es la misma vista previa de siempre (sin consecutivo, QR ni validez): el código y el QR reales nacen al expedir, dentro de la
 * transacción, para que la numeración no tenga huecos. Mientras llega la nueva se conserva la anterior para que no parpadee.
 */
export function VistaPreviaExpedicion({ entrada, motivoPausa }: VistaPreviaExpedicionProps) {
  const pedida = useDebouncedValue(entrada, 600);
  const consulta = useQuery({
    queryKey: ['certificados', 'vista-previa-en-vivo', pedida],
    queryFn: async () => {
      const { url, blob } = await descargarVistaPrevia(pedida as EntradaExpedicion);
      URL.revokeObjectURL(url);
      return blob;
    },
    enabled: Boolean(pedida) && !motivoPausa,
    placeholderData: keepPreviousData,
    gcTime: 0,
    staleTime: 0,
    retry: false,
  });
  const blob = consulta.data;

  // El URL se crea y se libera dentro del mismo efecto (sobrevive al doble montaje de React en desarrollo).
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

  const actualizando = Boolean(entrada) && (consulta.isFetching || entrada !== pedida);

  return (
    <Card className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm font-semibold text-ink">Así quedará el documento</p>
        {actualizando && !motivoPausa && <span className="text-xs text-muted">Actualizando…</span>}
      </div>
      <p className="text-xs text-muted">Con los datos reales del estudiante. El código, el QR y la huella reales se generan al expedir; aquí solo es una muestra.</p>
      {!entrada && <p className="rounded-lg border border-dashed border-border p-8 text-center text-sm text-muted">Elige un estudiante y un documento para ver aquí cómo queda.</p>}
      {entrada && motivoPausa && <Alert tone="info">{motivoPausa}</Alert>}
      {entrada && !motivoPausa && consulta.isLoading && <Spinner label="Preparando la vista previa…" />}
      {entrada && !motivoPausa && consulta.isError && <Alert tone="warning">{errorMessage(consulta.error)}</Alert>}
      {entrada && !motivoPausa && !consulta.isError && url && (
        <iframe src={`${url}#view=FitH`} title="Vista previa del documento" className={`h-[78vh] w-full rounded-lg border border-border bg-soft transition-opacity ${actualizando ? 'opacity-60' : ''}`} />
      )}
    </Card>
  );
}
