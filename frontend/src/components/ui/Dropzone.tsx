import { type DragEvent, useRef, useState } from 'react';
import { UploadIcon, XIcon } from './icons';

interface DropzoneProps {
  /** Extensiones admitidas con punto (`.pdf`): filtran el selector y se comprueban también al soltar un archivo. */
  extensiones: string[];
  maxBytes: number;
  file: File | null;
  onFile: (file: File | null) => void;
  /** Texto de ayuda bajo el título, p. ej. los formatos que acepta. */
  hint?: string;
  disabled?: boolean;
}

function tamano(bytes: number): string {
  return bytes < 1024 * 1024 ? `${Math.max(1, Math.round(bytes / 1024))} KB` : `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

/**
 * Zona para soltar (o elegir) un archivo. Solo valida lo que se ve en el navegador (extensión y tamaño) para avisar
 * antes de subir; el contenido real lo confirma siempre el servidor.
 */
export function Dropzone({ extensiones, maxBytes, file, onFile, hint, disabled }: DropzoneProps) {
  const entrada = useRef<HTMLInputElement>(null);
  const [arrastrando, setArrastrando] = useState(false);
  const [problema, setProblema] = useState<string | null>(null);

  function recibir(candidato: File | undefined) {
    if (!candidato) return;
    const extension = `.${candidato.name.split('.').pop()?.toLowerCase() ?? ''}`;
    if (!extensiones.includes(extension)) {
      setProblema(`Formato no admitido (${extension}). Usa: ${extensiones.join(', ')}.`);
      return;
    }
    if (candidato.size > maxBytes) {
      setProblema(`El archivo pesa ${tamano(candidato.size)} y el máximo es ${tamano(maxBytes)}.`);
      return;
    }
    setProblema(null);
    onFile(candidato);
  }

  function alSoltar(e: DragEvent<HTMLDivElement>) {
    e.preventDefault();
    setArrastrando(false);
    if (!disabled) recibir(e.dataTransfer.files[0]);
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
        className={`flex flex-col items-center gap-2 rounded-xl border-2 border-dashed px-4 py-6 text-center transition-colors ${
          arrastrando ? 'border-primary bg-primary-soft' : 'border-border bg-soft'
        } ${disabled ? 'opacity-60' : ''}`}
      >
        <UploadIcon className="h-6 w-6 text-primary" />
        <p className="text-sm text-body">
          Arrastra tu archivo aquí o{' '}
          <button
            type="button"
            disabled={disabled}
            onClick={() => entrada.current?.click()}
            className="font-semibold text-primary hover:underline disabled:cursor-not-allowed"
          >
            elígelo en tu equipo
          </button>
        </p>
        {hint && <p className="text-xs text-muted">{hint}</p>}
        <input
          ref={entrada}
          type="file"
          accept={extensiones.join(',')}
          className="hidden"
          aria-label="Archivo de la entrega"
          disabled={disabled}
          onChange={(e) => {
            recibir(e.target.files?.[0]);
            e.target.value = '';
          }}
        />
      </div>

      {file && (
        <div className="flex items-center justify-between gap-3 rounded-lg bg-primary-soft px-3 py-2 text-sm">
          <span className="min-w-0 truncate text-primary">
            {file.name} <span className="text-muted">· {tamano(file.size)}</span>
          </span>
          <button
            type="button"
            aria-label="Quitar archivo"
            disabled={disabled}
            onClick={() => onFile(null)}
            className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-primary hover:bg-surface"
          >
            <XIcon className="h-3.5 w-3.5" />
          </button>
        </div>
      )}
      {problema && <p className="text-xs text-danger">{problema}</p>}
    </div>
  );
}
