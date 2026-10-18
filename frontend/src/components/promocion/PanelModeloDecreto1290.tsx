import { Alert } from '../ui/Alert';
import { Drawer } from '../ui/Drawer';
import type { PoliticaPromocion } from '../../hooks/usePromocion';
import { describirCambios, hayCambios } from '../../lib/cambiosPolitica';
import { aplicarPlantillaDecreto1290 } from '../../lib/plantillaDecreto1290';
import type { NombresCatalogo } from '../../lib/resumenPolitica';

interface Props {
  open: boolean;
  onClose: () => void;
  actual: PoliticaPromocion;
  notaAprobatoria: number;
  nombres: NombresCatalogo;
  onAplicar: (nueva: PoliticaPromocion) => void;
}

/** Muestra qué cambiaría el modelo del Decreto 1290 antes de aplicarlo al formulario (todavía no se guarda nada). */
export function PanelModeloDecreto1290({ open, onClose, actual, notaAprobatoria, nombres, onAplicar }: Props) {
  const modelo = aplicarPlantillaDecreto1290(actual);
  const cambios = describirCambios(actual, modelo, notaAprobatoria, nombres);
  const sinCambios = !hayCambios(actual, modelo);

  return (
    <Drawer
      open={open}
      title="Modelo del Decreto 1290"
      subtitle="Parte de los valores típicos y ajusta lo que necesites. Nada se guarda hasta que pulses «Guardar»."
      onClose={onClose}
      onSubmit={(e) => {
        e.preventDefault();
        onAplicar(modelo);
        onClose();
      }}
      submitLabel="Aplicar el modelo"
      submitDisabled={sinCambios}
    >
      {sinCambios ? (
        <Alert tone="info">Tu formulario ya coincide con el modelo.</Alert>
      ) : (
        <>
          {cambios.quitan.length > 0 && (
            <div>
              <p className="mb-1 text-label text-body">Dejará de decir</p>
              <ul className="list-disc space-y-1 pl-5 text-sm text-muted">
                {cambios.quitan.map((f) => (
                  <li key={f}>{f}</li>
                ))}
              </ul>
            </div>
          )}
          <div>
            <p className="mb-1 text-label text-body">Pasará a decir</p>
            <ul className="list-disc space-y-1 pl-5 text-sm text-ink">
              {cambios.agregan.map((f) => (
                <li key={f}>{f}</li>
              ))}
            </ul>
          </div>
          <Alert tone="info">El modelo no toca tus materias imprescindibles, las materias que se pueden deber ni tus reglas especiales.</Alert>
        </>
      )}
    </Drawer>
  );
}
