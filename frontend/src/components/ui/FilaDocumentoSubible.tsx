import { useRef } from 'react';
import type { EstadoDocumentoMatricula } from '../../types/domain';
import { EstadoDocumentoBadge } from './Badge';
import { Button } from './Button';
import { UploadIcon } from './icons';

interface FilaDocumentoSubibleProps {
  nombre: string;
  estado: EstadoDocumentoMatricula;
  /** Motivo del rechazo, para que sepa qué corregir. */
  comentario?: string | null;
  /** Cómo debe ser el archivo (p. ej. «Registro civil legible…»). */
  indicacion?: string;
  obligatorio?: boolean;
  /** Si todavía se puede (re)enviar este documento. */
  editable: boolean;
  subiendo: boolean;
  onArchivo: (file: File) => void;
}

/** Un documento de matrícula con su estado y, si aún se puede, el botón para subir o reemplazar el archivo (sitio público y portal del acudiente). */
export function FilaDocumentoSubible({ nombre, estado, comentario, indicacion, obligatorio = true, editable, subiendo, onArchivo }: FilaDocumentoSubibleProps) {
  const inputRef = useRef<HTMLInputElement>(null);

  return (
    <li className="flex flex-wrap items-center justify-between gap-2 py-3">
      <div className="min-w-0">
        <p className="text-sm font-medium text-ink">
          {nombre}
          {!obligatorio && <span className="ml-2 text-xs font-normal text-muted">Opcional</span>}
        </p>
        {indicacion && estado !== 'APROBADO' && <p className="mt-0.5 text-xs text-muted">{indicacion}</p>}
        {comentario && <p className="mt-0.5 text-xs text-danger">Motivo del rechazo: {comentario}</p>}
      </div>
      <div className="flex items-center gap-2">
        <EstadoDocumentoBadge value={estado} />
        {editable && (
          <>
            <input
              ref={inputRef}
              type="file"
              accept=".pdf,.jpg,.jpeg,.png,.webp"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0];
                e.target.value = '';
                if (file) onArchivo(file);
              }}
            />
            <Button
              type="button"
              variant="soft-edit"
              isLoading={subiendo}
              onClick={() => inputRef.current?.click()}
              aria-label={`${estado === 'PENDIENTE' ? 'Subir' : 'Reemplazar'} ${nombre}`}
            >
              <UploadIcon className="h-4 w-4" />
              {estado === 'PENDIENTE' ? 'Subir' : 'Reemplazar'}
            </Button>
          </>
        )}
      </div>
    </li>
  );
}
