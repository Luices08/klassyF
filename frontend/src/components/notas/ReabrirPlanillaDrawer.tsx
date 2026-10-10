import { type FormEvent, useState } from 'react';
import { Alert, errorMessage } from '../ui/Alert';
import { Drawer } from '../ui/Drawer';
import { Textarea } from '../ui/Field';

interface ReabrirPlanillaDrawerProps {
  open: boolean;
  /** Qué se reabre, p. ej. «Matemáticas · 601 · Periodo 1». */
  subtitulo: string;
  /** Aviso extra cuando se reabre algo ya definitivo. */
  aviso?: string;
  onClose: () => void;
  onConfirmar: (motivo: string) => Promise<unknown>;
}

/** Reabrir una planilla cerrada exige motivo: queda en el historial de cada nota y en la auditoría. */
export function ReabrirPlanillaDrawer(props: ReabrirPlanillaDrawerProps) {
  return props.open ? <Formulario {...props} /> : null;
}

function Formulario({ subtitulo, aviso, onClose, onConfirmar }: ReabrirPlanillaDrawerProps) {
  const [motivo, setMotivo] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  async function enviar(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setEnviando(true);
    try {
      await onConfirmar(motivo.trim());
      onClose();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setEnviando(false);
    }
  }

  return (
    <Drawer
      open
      title="Reabrir planilla de notas"
      subtitle={subtitulo}
      onClose={onClose}
      onSubmit={(e) => void enviar(e)}
      submitLabel="Reabrir planilla"
      isSubmitting={enviando}
      submitDisabled={motivo.trim().length < 5}
    >
      {error && <Alert tone="error">{error}</Alert>}
      <Alert tone="warning">
        Mientras esté abierta, el boletín de esta asignatura vuelve a quedar «sin cerrar». {aviso}
      </Alert>
      <Textarea
        label="Motivo de la reapertura"
        rows={4}
        maxLength={500}
        value={motivo}
        hint="Obligatorio (mínimo 5 caracteres). Queda registrado con tu usuario y la fecha."
        onChange={(e) => setMotivo(e.target.value)}
      />
    </Drawer>
  );
}
