import type { ReactNode } from 'react';
import { Alert, errorMessage } from '../ui/Alert';
import { Button } from '../ui/Button';
import { Select } from '../ui/Field';

/** Sí / No / sin responder: el formato oficial distingue "no respondido" de "no". */
export function SelectSiNo({ label, value, onChange, disabled }: { label: string; value: boolean | null; onChange: (v: boolean | null) => void; disabled?: boolean }) {
  return (
    <Select label={label} disabled={disabled} value={value === null ? '' : value ? 'si' : 'no'} onChange={(e) => onChange(e.target.value === '' ? null : e.target.value === 'si')}>
      <option value="">Sin responder</option>
      <option value="si">Sí</option>
      <option value="no">No</option>
    </Select>
  );
}

export function Seccion({ titulo, children }: { titulo: string; children: ReactNode }) {
  return (
    <section className="space-y-3">
      <h3 className="text-sm font-semibold uppercase tracking-wide text-primary">{titulo}</h3>
      {children}
    </section>
  );
}

/** Pie de un formulario de sección: muestra el error o la confirmación del último guardado y el botón. */
export function PieGuardar({ mutacion, soloLectura, etiqueta = 'Guardar' }: { mutacion: { isPending: boolean; isError: boolean; isSuccess: boolean; error: unknown }; soloLectura: boolean; etiqueta?: string }) {
  return (
    <div className="space-y-3">
      {mutacion.isError && <Alert tone="error">{errorMessage(mutacion.error)}</Alert>}
      {mutacion.isSuccess && <Alert tone="success">Guardado.</Alert>}
      {!soloLectura && (
        <div className="flex justify-end">
          <Button type="submit" isLoading={mutacion.isPending}>
            {etiqueta}
          </Button>
        </div>
      )}
    </div>
  );
}
