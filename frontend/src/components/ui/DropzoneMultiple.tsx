import { type DragEvent, useRef, useState } from 'react';
import { formatoTamano } from '../../lib/actividades';
import { UploadIcon } from './icons';

interface DropzoneMultipleProps {
  /** Extensiones admitidas con punto (`.pdf`). */
  extensiones: string[];
  maxBytes: number;
  /** Cuántos archivos admite en una sola vez (los que sobren se avisan, no se descartan en silencio). */
  maxArchivos: number;
  onFiles: (archivos: File[]) => void;
  hint?: string;
  disabled?: boolean;
  etiqueta?: string;
}

/**
 * Zona para soltar o elegir varios archivos a la vez. Como `Dropzone`, solo valida lo visible en el navegador (extensión, tamaño y
 * cantidad); el servidor confirma el contenido. No guarda la lista: entrega los archivos válidos a quien la usa.
 */
export function DropzoneMultiple({ extensiones, maxBytes, maxArchivos, onFiles, hint, disabled, etiqueta = 'Archivos adjuntos' }: DropzoneMultipleProps) {
  const entrada = useRef<HTMLInputElement>(null);
  const [arrastrando, setArrastrando] = useState(false);
  const [problemas, setProblemas] = useState<string[]>([]);

  function recibir(candidatos: File[]) {
    if (candidatos.length === 0) return;
    const nuevos: string[] = [];
    const validos: File[] = [];
    for (const archivo of candidatos) {
      const extension = `.${archivo.name.split('.').pop()?.toLowerCase() ?? ''}`;
      if (!extensiones.includes(extension)) nuevos.push(`${archivo.name}: formato no admitido (${extension}).`);
      else if (archivo.size > maxBytes) nuevos.push(`${archivo.name}: pesa ${formatoTamano(archivo.size)} y el máximo es ${formatoTamano(maxBytes)}.`);
      else validos.push(archivo);
    }
    if (validos.length > maxArchivos) {
      nuevos.push(`Se pueden subir ${maxArchivos} archivos a la vez: se omitieron ${validos.length - maxArchivos}.`);
      validos.length = maxArchivos;
    }
    setProblemas(nuevos);
    if (validos.length > 0) onFiles(validos);
  }

  function alSoltar(e: DragEvent<HTMLDivElement>) {
    e.preventDefault();
    setArrastrando(false);
    if (!disabled) recibir(Array.from(e.dataTransfer.files));
  }

  return (
    <div className="space-y-2">
      <div
        onDragOver={(e) => {
          e.preventDefault();
          if (!disabled) setArrastrando(true);
        }}
        onDragLeave={() => setArrastrando(false)}
        onDrop={alSoltar}
        className={`flex flex-col items-center gap-2 rounded-xl border-2 border-dashed px-4 py-5 text-center transition-colors ${
          arrastrando ? 'border-primary bg-primary-soft' : 'border-border bg-soft'
        } ${disabled ? 'opacity-60' : ''}`}
      >
        <UploadIcon className="h-6 w-6 text-primary" />
        <p className="text-sm text-body">
          Arrastra tus archivos aquí o{' '}
          <button type="button" disabled={disabled} onClick={() => entrada.current?.click()} className="font-semibold text-primary hover:underline disabled:cursor-not-allowed">
            elígelos en tu equipo
          </button>
        </p>
        {hint && <p className="text-xs text-muted">{hint}</p>}
        <input
          ref={entrada}
          type="file"
          multiple
          accept={extensiones.join(',')}
          className="hidden"
          aria-label={etiqueta}
          disabled={disabled}
          onChange={(e) => {
            recibir(Array.from(e.target.files ?? []));
            e.target.value = '';
          }}
        />
      </div>
      {problemas.length > 0 && (
        <ul className="space-y-0.5 text-xs text-danger">
          {problemas.map((p) => (
            <li key={p}>{p}</li>
          ))}
        </ul>
      )}
    </div>
  );
}
