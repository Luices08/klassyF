import { Dropzone } from '../ui/Dropzone';
import { Input, Textarea } from '../ui/Field';
import { MAX_BYTES_PLANEACION, MAX_DESCRIPCION_PLAN, MAX_TITULO_PLAN } from '../../lib/planeacion';

interface CamposRadicacionProps {
  titulo: string;
  onTitulo: (valor: string) => void;
  descripcion: string;
  onDescripcion: (valor: string) => void;
  archivo: File | null;
  onArchivo: (archivo: File | null) => void;
  disabled?: boolean;
}

/** Lo que se pide al radicar un plan de área o de aula: título, descripción y el PDF. Comparten los mismos topes que el servidor. */
export function CamposRadicacion({ titulo, onTitulo, descripcion, onDescripcion, archivo, onArchivo, disabled }: CamposRadicacionProps) {
  return (
    <>
      <Input
        label="Título"
        required
        maxLength={MAX_TITULO_PLAN}
        value={titulo}
        onChange={(e) => onTitulo(e.target.value)}
        disabled={disabled}
      />
      <Textarea
        label="Descripción"
        required
        rows={4}
        maxLength={MAX_DESCRIPCION_PLAN}
        value={descripcion}
        onChange={(e) => onDescripcion(e.target.value)}
        disabled={disabled}
        hint="Qué cubre el documento: unidades, tiempos, evaluación."
      />
      <div>
        <p className="mb-1.5 text-label text-body">Documento (PDF)</p>
        <Dropzone
          extensiones={['.pdf']}
          maxBytes={MAX_BYTES_PLANEACION}
          file={archivo}
          onFile={onArchivo}
          disabled={disabled}
          hint="Solo PDF, hasta 25 MB."
          etiqueta="Documento PDF del plan"
        />
      </div>
    </>
  );
}
