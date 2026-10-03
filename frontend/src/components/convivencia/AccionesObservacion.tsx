import { useState } from 'react';
import { Button } from '../ui/Button';
import { useAuth } from '../../context/AuthContext';
import type { ObservacionVista } from '../../hooks/useObservaciones';
import { AnularObservacionDrawer } from './AnularObservacionDrawer';
import { ObservacionDrawer } from './ObservacionDrawer';
import { SeguimientoObservacionDrawer, type ModoSeguimiento } from './SeguimientoObservacionDrawer';

/** Acciones sobre un registro del Observador. El servidor valida el permiso, el plazo y el estado de cada una. */
export function AccionesObservacion({ observacion }: { observacion: ObservacionVista }) {
  const rol = useAuth().user?.rol;
  const [enmendando, setEnmendando] = useState(false);
  const [anulando, setAnulando] = useState(false);
  const [seguimiento, setSeguimiento] = useState<ModoSeguimiento | null>(null);

  if (observacion.estado !== 'ACTIVA' || observacion.reservada) return null;
  // Una falta ya remitida solo la corrige convivencia.
  const puedeCorregir = !observacion.solicitud_id || rol === 'ADMIN' || rol === 'COORDINADOR_CONVIVENCIA';
  const puedeCitar = observacion.requiere_citacion && !observacion.citacion_realizada;

  return (
    <span className="flex flex-wrap justify-end gap-2">
      <Button variant="soft-edit" className="px-3 py-1 text-xs" onClick={() => setSeguimiento('nota')}>
        Nota de seguimiento
      </Button>
      {puedeCitar && (
        <Button variant="soft-edit" className="px-3 py-1 text-xs" onClick={() => setSeguimiento('citacion')}>
          Registrar citación
        </Button>
      )}
      {puedeCorregir && (
        <>
          <Button variant="soft-edit" className="px-3 py-1 text-xs" onClick={() => setEnmendando(true)}>
            Enmendar
          </Button>
          <Button variant="soft-danger" className="px-3 py-1 text-xs" onClick={() => setAnulando(true)}>
            Anular
          </Button>
        </>
      )}

      <ObservacionDrawer open={enmendando} onClose={() => setEnmendando(false)} observacion={observacion} />
      <AnularObservacionDrawer observacion={anulando ? observacion : null} onClose={() => setAnulando(false)} />
      <SeguimientoObservacionDrawer observacion={seguimiento ? observacion : null} modo={seguimiento ?? 'nota'} onClose={() => setSeguimiento(null)} />
    </span>
  );
}
