import { type FormEvent, useState } from 'react';
import { Alert, errorMessage } from '../ui/Alert';
import { Drawer } from '../ui/Drawer';
import { Input, Select, Textarea } from '../ui/Field';
import {
  MEDIOS_CITACION,
  NOMBRES_MEDIO,
  NOMBRES_RESPONSABLE,
  RESPONSABLES_COMPROMISO,
  type MedioCitacion,
  type ObservacionVista,
  type ResponsableCompromiso,
  useAgregarCitacion,
  useAgregarCompromiso,
  useSolicitarCaso,
} from '../../hooks/useObservaciones';

export type ModoSeguimiento = 'compromiso' | 'citacion' | 'caso';

interface Props {
  observacion: ObservacionVista | null;
  modo: ModoSeguimiento;
  onClose: () => void;
}

const hoyLocal = () => new Date().toLocaleDateString('en-CA');

export function SeguimientoObservacionDrawer({ observacion, modo, onClose }: Props) {
  if (!observacion) return null;
  if (modo === 'compromiso') return <CompromisoForm observacion={observacion} onClose={onClose} />;
  if (modo === 'citacion') return <CitacionForm observacion={observacion} onClose={onClose} />;
  return <SolicitudCasoForm observacion={observacion} onClose={onClose} />;
}

function CompromisoForm({ observacion, onClose }: { observacion: ObservacionVista; onClose: () => void }) {
  const agregar = useAgregarCompromiso();
  const [descripcion, setDescripcion] = useState('');
  const [responsable, setResponsable] = useState<ResponsableCompromiso>('ESTUDIANTE');
  const [fechaLimite, setFechaLimite] = useState('');

  const guardar = async (e: FormEvent) => {
    e.preventDefault();
    await agregar.mutateAsync({ id: observacion._id, descripcion, responsable, fecha_limite: fechaLimite });
    onClose();
  };

  return (
    <Drawer
      open
      title="Registrar compromiso"
      subtitle="Un acuerdo con fecha límite. Queda pendiente hasta que se marque como cumplido o incumplido."
      onClose={onClose}
      onSubmit={guardar}
      isSubmitting={agregar.isPending}
      submitDisabled={descripcion.trim().length < 5 || !fechaLimite}
    >
      {agregar.isError && <Alert tone="error">{errorMessage(agregar.error)}</Alert>}
      <Textarea label="Compromiso" rows={3} maxLength={500} value={descripcion} onChange={(e) => setDescripcion(e.target.value)} />
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Select label="Responsable" value={responsable} onChange={(e) => setResponsable(e.target.value as ResponsableCompromiso)}>
          {RESPONSABLES_COMPROMISO.map((r) => (
            <option key={r} value={r}>
              {NOMBRES_RESPONSABLE[r]}
            </option>
          ))}
        </Select>
        <Input label="Fecha límite" type="date" min={hoyLocal()} value={fechaLimite} onChange={(e) => setFechaLimite(e.target.value)} required />
      </div>
    </Drawer>
  );
}

function CitacionForm({ observacion, onClose }: { observacion: ObservacionVista; onClose: () => void }) {
  const agregar = useAgregarCitacion();
  const [fecha, setFecha] = useState(hoyLocal());
  const [medio, setMedio] = useState<MedioCitacion>('LLAMADA');
  const [dirigidaA, setDirigidaA] = useState('');
  const [resultado, setResultado] = useState('');

  const guardar = async (e: FormEvent) => {
    e.preventDefault();
    await agregar.mutateAsync({ id: observacion._id, fecha, medio, dirigida_a: dirigidaA, resultado });
    onClose();
  };

  return (
    <Drawer
      open
      title="Registrar citación"
      subtitle="Aquí solo se deja constancia de que se citó: el sistema no envía avisos."
      onClose={onClose}
      onSubmit={guardar}
      isSubmitting={agregar.isPending}
      submitDisabled={!fecha}
    >
      {agregar.isError && <Alert tone="error">{errorMessage(agregar.error)}</Alert>}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Input label="Fecha" type="date" max={hoyLocal()} value={fecha} onChange={(e) => setFecha(e.target.value)} required />
        <Select label="Medio" value={medio} onChange={(e) => setMedio(e.target.value as MedioCitacion)}>
          {MEDIOS_CITACION.map((m) => (
            <option key={m} value={m}>
              {NOMBRES_MEDIO[m]}
            </option>
          ))}
        </Select>
      </div>
      <Input label="Dirigida a" value={dirigidaA} onChange={(e) => setDirigidaA(e.target.value)} maxLength={120} placeholder="Acudiente o responsable citado" />
      <Textarea label="Resultado" rows={3} maxLength={500} value={resultado} onChange={(e) => setResultado(e.target.value)} />
    </Drawer>
  );
}

function SolicitudCasoForm({ observacion, onClose }: { observacion: ObservacionVista; onClose: () => void }) {
  const solicitar = useSolicitarCaso();
  const [motivo, setMotivo] = useState('');

  const guardar = async (e: FormEvent) => {
    e.preventDefault();
    await solicitar.mutateAsync({ id: observacion._id, motivo });
    onClose();
  };

  return (
    <Drawer
      open
      title="Pedir atención de convivencia"
      subtitle="El coordinador de convivencia decidirá si se abre un caso."
      onClose={onClose}
      onSubmit={guardar}
      isSubmitting={solicitar.isPending}
      submitDisabled={motivo.trim().length < 5}
    >
      {solicitar.isError && <Alert tone="error">{errorMessage(solicitar.error)}</Alert>}
      <Textarea label="¿Por qué crees que debe atenderse?" rows={4} maxLength={500} value={motivo} onChange={(e) => setMotivo(e.target.value)} />
    </Drawer>
  );
}
