import type { FormEvent } from 'react';
import { Alert } from '../../ui/Alert';
import { Drawer } from '../../ui/Drawer';
import { Input } from '../../ui/Field';

interface PublicarPlantillaDrawerProps {
  open: boolean;
  nombre: string;
  versionNueva: number;
  nota: string;
  onNota: (nota: string) => void;
  /** Lo que cambió respecto a la versión vigente, en palabras. */
  cambios: string[];
  problemas: string[];
  error: string | null;
  isSubmitting: boolean;
  onClose: () => void;
  onPublicar: () => void;
}

/** Confirmar la publicación: qué cambió, la nota de la versión y lo que el servidor rechace, todo junto. */
export function PublicarPlantillaDrawer({ open, nombre, versionNueva, nota, onNota, cambios, problemas, error, isSubmitting, onClose, onPublicar }: PublicarPlantillaDrawerProps) {
  const enviar = (e: FormEvent) => {
    e.preventDefault();
    onPublicar();
  };
  return (
    <Drawer open={open} title={`Publicar ${nombre}`} subtitle={`Se crea la versión ${versionNueva}. Lo ya expedido conserva su texto.`} onClose={onClose} onSubmit={enviar} submitLabel="Publicar versión" isSubmitting={isSubmitting}>
      <div className="space-y-2">
        <p className="text-sm font-semibold text-ink">Qué cambia</p>
        {cambios.length > 0 ? (
          <ul className="list-disc space-y-1 pl-5 text-sm text-body">
            {cambios.map((c) => (
              <li key={c}>{c}</li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-muted">Hay cambios en el texto.</p>
        )}
      </div>
      <Input label="Nota del cambio (opcional)" value={nota} onChange={(e) => onNota(e.target.value)} maxLength={300} placeholder="Ej. Se agrega la vigencia de 30 días" hint="Queda en el historial de versiones." />
      {error && <Alert tone="error">{error}</Alert>}
      {problemas.length > 0 && (
        <Alert tone="error">
          <p className="font-semibold">Para poder publicarla falta corregir:</p>
          <ul className="mt-1 list-disc space-y-1 pl-4">
            {problemas.map((p) => (
              <li key={p}>{p}</li>
            ))}
          </ul>
        </Alert>
      )}
    </Drawer>
  );
}
