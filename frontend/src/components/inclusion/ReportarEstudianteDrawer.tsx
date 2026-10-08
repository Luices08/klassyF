import { type FormEvent, useState } from 'react';
import { Alert, errorMessage } from '../ui/Alert';
import { Drawer } from '../ui/Drawer';
import { Textarea } from '../ui/Field';
import { type EstudianteBuscado, useCrearSolicitud } from '../../hooks/useInclusion';
import { SelectorEstudiante } from './SelectorEstudiante';

/**
 * Reporta una necesidad de apoyo con hechos observados. No se diagnostica ni se rotula al estudiante: orientación valora, cita a
 * la familia y decide. El docente solo vuelve a ver que su reporte existe y en qué va.
 */
export function ReportarEstudianteDrawer({ open, onClose }: { open: boolean; onClose: () => void }) {
  const crear = useCrearSolicitud();
  const [estudiante, setEstudiante] = useState<EstudianteBuscado | null>(null);
  const [motivo, setMotivo] = useState('');
  const [observacion, setObservacion] = useState('');

  const cerrar = () => {
    setEstudiante(null);
    setMotivo('');
    setObservacion('');
    crear.reset();
    onClose();
  };

  const enviar = async (e: FormEvent) => {
    e.preventDefault();
    if (!estudiante) return;
    await crear.mutateAsync({ student_id: estudiante.student_id, motivo_declarado: motivo, observacion: observacion || undefined });
    cerrar();
  };

  return (
    <Drawer open={open} title="Reportar a orientación" subtitle="Describe lo que observas, sin diagnosticar." onClose={cerrar} onSubmit={enviar} submitLabel="Enviar a orientación" isSubmitting={crear.isPending} submitDisabled={!estudiante || motivo.trim().length < 5}>
      {crear.isError && <Alert tone="error">{errorMessage(crear.error)}</Alert>}
      <SelectorEstudiante seleccionado={estudiante} onSelect={setEstudiante} />
      <Textarea label="¿Qué observas?" value={motivo} onChange={(e) => setMotivo(e.target.value)} maxLength={500} hint="Hechos concretos y observables (ej.: «no alcanza a leer lo que está en el tablero»)." />
      <Textarea label="Detalle (opcional)" value={observacion} onChange={(e) => setObservacion(e.target.value)} maxLength={4000} hint="Desde cuándo, en qué situaciones y qué ya has intentado en el aula." />
    </Drawer>
  );
}
