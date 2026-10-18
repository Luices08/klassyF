import { Alert } from '../ui/Alert';
import { Drawer } from '../ui/Drawer';
import type { PoliticaPromocion } from '../../hooks/usePromocion';
import { describirCambios } from '../../lib/cambiosPolitica';
import type { NombresCatalogo } from '../../lib/resumenPolitica';

interface Props {
  open: boolean;
  onClose: () => void;
  onConfirmar: () => void;
  guardando: boolean;
  antes: PoliticaPromocion;
  despues: PoliticaPromocion;
  notaAprobatoria: number;
  nombres: NombresCatalogo;
}

/** Antes de guardar: qué cambia en lenguaje de colegio y qué más se actualiza (Recuperaciones). */
export function ConfirmarCambiosPolitica({ open, onClose, onConfirmar, guardando, antes, despues, notaAprobatoria, nombres }: Props) {
  const c = describirCambios(antes, despues, notaAprobatoria, nombres);
  return (
    <Drawer
      open={open}
      title="Revisa los cambios"
      subtitle="Así quedará tu política de promoción."
      onClose={onClose}
      onSubmit={(e) => {
        e.preventDefault();
        onConfirmar();
      }}
      submitLabel="Guardar política"
      isSubmitting={guardando}
    >
      {c.quitan.length > 0 && (
        <div>
          <p className="mb-1 text-label text-body">Deja de decir</p>
          <ul className="list-disc space-y-1 pl-5 text-sm text-muted">
            {c.quitan.map((f) => (
              <li key={f}>{f}</li>
            ))}
          </ul>
        </div>
      )}
      {c.agregan.length > 0 && (
        <div>
          <p className="mb-1 text-label text-body">Pasa a decir</p>
          <ul className="list-disc space-y-1 pl-5 text-sm text-ink">
            {c.agregan.map((f) => (
              <li key={f}>{f}</li>
            ))}
          </ul>
        </div>
      )}
      {c.otros.length > 0 && (
        <ul className="list-disc space-y-1 pl-5 text-sm text-ink">
          {c.otros.map((f) => (
            <li key={f}>{f}</li>
          ))}
        </ul>
      )}
      {despues.umbrales.recuperacion_hasta !== null && <Alert tone="info">También se actualizará «Recuperaciones de fin de año» para que quede igual.</Alert>}
      <Alert tone="info">Los cierres que ya hiciste conservan la política con la que se calcularon.</Alert>
    </Drawer>
  );
}
