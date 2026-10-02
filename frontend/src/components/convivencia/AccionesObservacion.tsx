import { useState } from 'react';
import { Button } from '../ui/Button';
import { type CatalogoConvivencia, type ObservacionVista } from '../../hooks/useObservaciones';
import { AnularObservacionDrawer } from './AnularObservacionDrawer';
import { ObservacionDrawer } from './ObservacionDrawer';
import { SeguimientoObservacionDrawer, type ModoSeguimiento } from './SeguimientoObservacionDrawer';

interface Props {
  observacion: ObservacionVista;
  catalogo?: CatalogoConvivencia;
}

/** Acciones sobre una observación. El servidor valida el permiso y el plazo de cada una. */
export function AccionesObservacion({ observacion, catalogo }: Props) {
  const [enmendando, setEnmendando] = useState(false);
  const [anulando, setAnulando] = useState(false);
  const [seguimiento, setSeguimiento] = useState<ModoSeguimiento | null>(null);

  if (observacion.estado !== 'ACTIVA' || observacion.reservada) return null;
  const puedePedirCaso = observacion.familia === 'DISCIPLINARIA' && !observacion.solicitud_caso;

  return (
    <span className="flex flex-wrap justify-end gap-2">
      <Button variant="soft-edit" className="px-3 py-1 text-xs" onClick={() => setSeguimiento('compromiso')}>
        Compromiso
      </Button>
      <Button variant="soft-edit" className="px-3 py-1 text-xs" onClick={() => setSeguimiento('citacion')}>
        Citación
      </Button>
      {puedePedirCaso && (
        <Button variant="soft-edit" className="px-3 py-1 text-xs" onClick={() => setSeguimiento('caso')}>
          Pedir caso
        </Button>
      )}
      <Button variant="soft-edit" className="px-3 py-1 text-xs" onClick={() => setEnmendando(true)}>
        Enmendar
      </Button>
      <Button variant="soft-danger" className="px-3 py-1 text-xs" onClick={() => setAnulando(true)}>
        Anular
      </Button>

      {catalogo && (
        <ObservacionDrawer open={enmendando} onClose={() => setEnmendando(false)} catalogo={catalogo} observacion={observacion} />
      )}
      <AnularObservacionDrawer observacion={anulando ? observacion : null} onClose={() => setAnulando(false)} />
      <SeguimientoObservacionDrawer observacion={seguimiento ? observacion : null} modo={seguimiento ?? 'compromiso'} onClose={() => setSeguimiento(null)} />
    </span>
  );
}
