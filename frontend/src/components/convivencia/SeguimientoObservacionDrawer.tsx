import { type FormEvent, useState } from 'react';
import { Alert, errorMessage } from '../ui/Alert';
import { Drawer } from '../ui/Drawer';
import { Input, Textarea } from '../ui/Field';
import { type ObservacionVista, useAgregarSeguimiento, useRegistrarCitacionRealizada } from '../../hooks/useObservaciones';

export type ModoSeguimiento = 'nota' | 'citacion';

interface Props {
  observacion: ObservacionVista | null;
  modo: ModoSeguimiento;
  onClose: () => void;
}

const hoyLocal = () => new Date().toLocaleDateString('en-CA');

export function SeguimientoObservacionDrawer({ observacion, modo, onClose }: Props) {
  if (!observacion) return null;
  return modo === 'nota' ? <NotaForm observacion={observacion} onClose={onClose} /> : <CitacionForm observacion={observacion} onClose={onClose} />;
}

function NotaForm({ observacion, onClose }: { observacion: ObservacionVista; onClose: () => void }) {
  const agregar = useAgregarSeguimiento();
  const [nota, setNota] = useState('');

  const guardar = async (e: FormEvent) => {
    e.preventDefault();
    await agregar.mutateAsync({ id: observacion._id, nota });
    onClose();
  };

  return (
    <Drawer open title="Nota de seguimiento" subtitle="Queda fechada en el registro; no reemplaza lo ya escrito." onClose={onClose} onSubmit={guardar} isSubmitting={agregar.isPending} submitDisabled={nota.trim().length < 3}>
      {agregar.isError && <Alert tone="error">{errorMessage(agregar.error)}</Alert>}
      <Textarea label="Nota" rows={4} maxLength={500} value={nota} onChange={(e) => setNota(e.target.value)} />
    </Drawer>
  );
}

function CitacionForm({ observacion, onClose }: { observacion: ObservacionVista; onClose: () => void }) {
  const registrar = useRegistrarCitacionRealizada();
  const [fecha, setFecha] = useState(hoyLocal());
  const [resultado, setResultado] = useState('');

  const guardar = async (e: FormEvent) => {
    e.preventDefault();
    await registrar.mutateAsync({ id: observacion._id, fecha, resultado });
    onClose();
  };

  return (
    <Drawer open title="Registrar citación" subtitle="Aquí solo se deja constancia de que se citó: el sistema no envía avisos." onClose={onClose} onSubmit={guardar} isSubmitting={registrar.isPending} submitDisabled={!fecha}>
      {registrar.isError && <Alert tone="error">{errorMessage(registrar.error)}</Alert>}
      <Input label="Fecha" type="date" max={hoyLocal()} value={fecha} onChange={(e) => setFecha(e.target.value)} required />
      <Textarea label="Resultado" rows={3} maxLength={500} value={resultado} onChange={(e) => setResultado(e.target.value)} hint="Por ejemplo, quién asistió y qué se acordó." />
    </Drawer>
  );
}
