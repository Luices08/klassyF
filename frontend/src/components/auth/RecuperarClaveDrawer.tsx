import { type FormEvent, useState } from 'react';
import { Alert, errorMessage } from '../ui/Alert';
import { Drawer } from '../ui/Drawer';
import { Input, Textarea } from '../ui/Field';
import { useSolicitarRecuperacionClave } from '../../hooks/useRecuperacionClave';

/** «Olvidé mi contraseña»: no cambia nada en la cuenta, solo avisa a la secretaría para que entregue una clave nueva en persona. */
export function RecuperarClaveDrawer({ open, onClose, documentoInicial }: { open: boolean; onClose: () => void; documentoInicial: string }) {
  const solicitar = useSolicitarRecuperacionClave();
  const [documento, setDocumento] = useState(documentoInicial);
  const [nota, setNota] = useState('');

  function cerrar() {
    solicitar.reset();
    setNota('');
    onClose();
  }

  function enviar(e: FormEvent) {
    e.preventDefault();
    solicitar.mutate({ numero_documento: documento.trim(), nota: nota.trim() || undefined });
  }

  const enviada = solicitar.isSuccess;

  return (
    <Drawer
      open={open}
      title="Olvidé mi contraseña"
      subtitle="La secretaría del colegio te entregará una clave nueva."
      onClose={cerrar}
      onSubmit={enviada ? (e) => { e.preventDefault(); cerrar(); } : enviar}
      submitLabel={enviada ? 'Listo' : 'Enviar solicitud'}
      isSubmitting={solicitar.isPending}
      submitDisabled={!enviada && documento.trim().length < 3}
    >
      {enviada ? (
        <Alert tone="success">{solicitar.data.mensaje}</Alert>
      ) : (
        <div className="space-y-4">
          {solicitar.isError && <Alert tone="error">{errorMessage(solicitar.error)}</Alert>}
          <Alert tone="info">Tu contraseña no cambia hasta que la secretaría verifique que eres tú. Cuando te entregue la clave nueva, el sistema te pedirá cambiarla al entrar.</Alert>
          <Input label="Número de documento" required value={documento} onChange={(e) => setDocumento(e.target.value)} />
          <Textarea label="¿Algo que ayude a reconocerte? (opcional)" hint="Por ejemplo, tu grupo o el nombre de tu acudiente." maxLength={200} value={nota} onChange={(e) => setNota(e.target.value)} />
        </div>
      )}
    </Drawer>
  );
}
