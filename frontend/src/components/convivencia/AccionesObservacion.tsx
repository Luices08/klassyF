import { useState } from 'react';
import { IconButton } from '../ui/IconButton';
import { BanIcon, CalendarIcon, MessageCircleIcon, PencilIcon, TrashIcon } from '../ui/icons';
import { useAuth } from '../../context/AuthContext';
import type { ObservacionVista } from '../../hooks/useObservaciones';
import { AnularObservacionDrawer } from './AnularObservacionDrawer';
import { EliminarObservacionDrawer } from './EliminarObservacionDrawer';
import { ObservacionDrawer } from './ObservacionDrawer';
import { SeguimientoObservacionDrawer, type ModoSeguimiento } from './SeguimientoObservacionDrawer';

/** Acciones sobre un registro del Observador. El servidor valida el permiso, el plazo y el estado de cada una. */
export function AccionesObservacion({ observacion }: { observacion: ObservacionVista }) {
  const rol = useAuth().user?.rol;
  const [editando, setEditando] = useState(false);
  const [anulando, setAnulando] = useState(false);
  const [eliminando, setEliminando] = useState(false);
  const [seguimiento, setSeguimiento] = useState<ModoSeguimiento | null>(null);

  if (observacion.estado !== 'ACTIVA' || observacion.reservada) return null;
  // Una falta ya remitida solo la corrige convivencia.
  const puedeCorregir = !observacion.solicitud_id || rol === 'ADMIN' || rol === 'COORDINADOR_CONVIVENCIA';
  const puedeCitar = observacion.requiere_citacion && !observacion.citacion_realizada;
  // Sin usar = nada colgando del registro: solo así se ofrece eliminar (el servidor lo vuelve a comprobar, y también el plazo).
  const sinUsar =
    !observacion.solicitud_id &&
    !observacion.caso &&
    !observacion.citacion_realizada &&
    !observacion.seguimientos?.length &&
    (!observacion.compromiso_estado || observacion.compromiso_estado === 'PENDIENTE');

  return (
    <span className="flex justify-end gap-2">
      <IconButton tone="edit" label="Nota de seguimiento" icon={<MessageCircleIcon />} onClick={() => setSeguimiento('nota')} />
      {puedeCitar && <IconButton tone="edit" label="Registrar citación" icon={<CalendarIcon />} onClick={() => setSeguimiento('citacion')} />}
      {puedeCorregir && (
        <>
          <IconButton tone="edit" label="Editar" icon={<PencilIcon />} onClick={() => setEditando(true)} />
          {sinUsar && <IconButton tone="danger" label="Eliminar" icon={<TrashIcon />} onClick={() => setEliminando(true)} />}
          <IconButton tone="neutral" label="Anular" icon={<BanIcon />} onClick={() => setAnulando(true)} />
        </>
      )}

      <ObservacionDrawer open={editando} onClose={() => setEditando(false)} observacion={observacion} />
      <AnularObservacionDrawer observacion={anulando ? observacion : null} onClose={() => setAnulando(false)} />
      <EliminarObservacionDrawer observacion={eliminando ? observacion : null} onClose={() => setEliminando(false)} />
      <SeguimientoObservacionDrawer observacion={seguimiento ? observacion : null} modo={seguimiento ?? 'nota'} onClose={() => setSeguimiento(null)} />
    </span>
  );
}
