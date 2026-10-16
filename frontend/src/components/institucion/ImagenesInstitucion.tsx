import { useState } from 'react';
import { Alert, errorMessage } from '../ui/Alert';
import { Button } from '../ui/Button';
import { Card, CardHeader } from '../ui/Card';
import { Dropzone } from '../ui/Dropzone';
import { BuildingIcon } from '../ui/icons';
import { type ClaveImagenInstitucional, useImagenesInstitucion, useQuitarImagenInstitucion, useSubirImagenInstitucion } from '../../hooks/useInstitution';
import { urlDeApi } from '../../lib/apiClient';

const MAX_BYTES = 2 * 1024 * 1024;

interface BloqueImagenProps {
  clave: ClaveImagenInstitucional;
  titulo: string;
  subtitulo: string;
  /** Fecha de la imagen cargada (versión de la URL), o null si no hay. */
  actualizadaEn: string | null;
}

function BloqueImagen({ clave, titulo, subtitulo, actualizadaEn }: BloqueImagenProps) {
  const subir = useSubirImagenInstitucion();
  const quitar = useQuitarImagenInstitucion();
  const [archivo, setArchivo] = useState<File | null>(null);

  const url = actualizadaEn ? urlDeApi(`/public/institution-imagen/${clave}?v=${new Date(actualizadaEn).getTime()}`) : null;

  async function guardar() {
    if (!archivo) return;
    await subir.mutateAsync({ clave, file: archivo });
    setArchivo(null);
  }

  return (
    <Card>
      <CardHeader title={titulo} subtitle={subtitulo} />
      <div className="space-y-3">
        {(subir.isError || quitar.isError) && <Alert tone="error">{errorMessage(subir.error ?? quitar.error)}</Alert>}

        {url ? (
          <img src={url} alt={titulo} className="aspect-video w-full rounded-xl border border-border object-cover" />
        ) : (
          <div className="flex aspect-video w-full flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-border bg-soft text-muted">
            <BuildingIcon className="h-8 w-8" />
            <span className="text-sm">Aún no hay imagen</span>
          </div>
        )}

        <Dropzone
          extensiones={['.png', '.jpg', '.jpeg', '.webp']}
          maxBytes={MAX_BYTES}
          file={archivo}
          onFile={setArchivo}
          hint="PNG, JPG o WEBP, hasta 2 MB. Se recomienda una foto horizontal."
          etiqueta={`Imagen: ${titulo}`}
          disabled={subir.isPending}
        />

        <div className="flex flex-wrap gap-2">
          <Button type="button" onClick={() => void guardar()} isLoading={subir.isPending} disabled={!archivo}>
            {url ? 'Reemplazar imagen' : 'Guardar imagen'}
          </Button>
          {url && (
            <Button type="button" variant="secondary" onClick={() => quitar.mutate(clave)} isLoading={quitar.isPending}>
              Quitar imagen
            </Button>
          )}
        </div>
      </div>
    </Card>
  );
}

/** Fotos de la institución, fuera del drawer: la del ingreso (login) y la del tablero que verán docentes, estudiantes y demás perfiles. */
export function ImagenesInstitucion() {
  const imagenes = useImagenesInstitucion();

  return (
    <div className="space-y-3">
      {imagenes.isError && <Alert tone="error">{errorMessage(imagenes.error)}</Alert>}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <BloqueImagen
          clave="login"
          titulo="Imagen del inicio de sesión"
          subtitulo="Se muestra junto al formulario de ingreso."
          actualizadaEn={imagenes.data?.login?.actualizada_en ?? null}
        />
        <BloqueImagen
          clave="dashboard"
          titulo="Imagen del tablero"
          subtitulo="Para el próximo tablero de docentes, estudiantes y demás perfiles."
          actualizadaEn={imagenes.data?.dashboard?.actualizada_en ?? null}
        />
      </div>
    </div>
  );
}
