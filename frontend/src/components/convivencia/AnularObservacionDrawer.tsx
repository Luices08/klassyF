import { type FormEvent, useState } from 'react';
import { Alert, errorMessage } from '../ui/Alert';
import { Drawer } from '../ui/Drawer';
import { Textarea } from '../ui/Field';
import { type ObservacionVista, useAnularObservacion } from '../../hooks/useObservaciones';

interface Props {
  observacion: ObservacionVista | null;
  onClose: () => void;
}

export function AnularObservacionDrawer({ observacion, onClose }: Props) {
  if (!observacion) return null;
  return <Formulario observacion={observacion} onClose={onClose} />;
}

function Formulario({ observacion, onClose }: { observacion: ObservacionVista; onClose: () => void }) {
  const anular = useAnularObservacion();
  const [motivo, setMotivo] = useState('');

  const guardar = async (e: FormEvent) => {
    e.preventDefault();
    await anular.mutateAsync({ id: observacion._id, motivo });
    onClose();
  };

  return (
    <Drawer
      open
      title="Anular observación"
      subtitle="Una observación no se borra: queda marcada como anulada, con su motivo."
      onClose={onClose}
      onSubmit={guardar}
      submitLabel="Anular observación"
      submitVariant="soft-danger"
      isSubmitting={anular.isPending}
      submitDisabled={motivo.trim().length < 5}
    >
      {anular.isError && <Alert tone="error">{errorMessage(anular.error)}</Alert>}
      <p className="whitespace-pre-line rounded-lg bg-soft p-3 text-sm text-body">{observacion.texto_generado}</p>
      <Textarea
        label="Motivo de la anulación"
        rows={3}
        maxLength={500}
        value={motivo}
        onChange={(e) => setMotivo(e.target.value)}
        hint="Mínimo 5 caracteres. No incluyas datos de otros estudiantes."
      />
    </Drawer>
  );
}
