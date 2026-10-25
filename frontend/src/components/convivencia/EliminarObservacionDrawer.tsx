import type { FormEvent } from 'react';
import { Alert, errorMessage } from '../ui/Alert';
import { Drawer } from '../ui/Drawer';
import { type ObservacionVista, useEliminarObservacion } from '../../hooks/useObservaciones';

interface Props {
  observacion: ObservacionVista | null;
  onClose: () => void;
}

/** Eliminar por completo un registro que se hizo por error; si ya se usó o venció el plazo, el servidor lo rechaza y se anula. */
export function EliminarObservacionDrawer({ observacion, onClose }: Props) {
  if (!observacion) return null;
  return <Formulario observacion={observacion} onClose={onClose} />;
}

function Formulario({ observacion, onClose }: { observacion: ObservacionVista; onClose: () => void }) {
  const eliminar = useEliminarObservacion();

  const guardar = async (e: FormEvent) => {
    e.preventDefault();
    await eliminar.mutateAsync(observacion._id);
    onClose();
  };

  return (
    <Drawer
      open
      title="Eliminar registro"
      subtitle="Úsalo si te equivocaste. El registro desaparece por completo y no se puede recuperar."
      onClose={onClose}
      onSubmit={guardar}
      submitLabel="Eliminar registro"
      submitVariant="soft-danger"
      isSubmitting={eliminar.isPending}
    >
      {eliminar.isError && <Alert tone="error">{errorMessage(eliminar.error)}</Alert>}
      <p className="whitespace-pre-line rounded-lg bg-soft p-3 text-sm text-body">{observacion.descripcion}</p>
      <Alert tone="info">
        Solo se puede eliminar dentro del plazo y mientras no tenga seguimiento, citación ni caso. Pasado el plazo, o si ya se usó, hay que anularlo con su motivo.
      </Alert>
    </Drawer>
  );
}
