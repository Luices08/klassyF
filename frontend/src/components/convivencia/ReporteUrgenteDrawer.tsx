import { type FormEvent, useState } from 'react';
import { Alert, errorMessage } from '../ui/Alert';
import { Drawer } from '../ui/Drawer';
import { Input, Textarea } from '../ui/Field';
import { type EstudianteObservable, useReportarSituacionGrave } from '../../hooks/useObservaciones';

const hoyLocal = () => new Date().toLocaleDateString('en-CA');

interface Props {
  open: boolean;
  onClose: () => void;
  estudiantes: EstudianteObservable[];
  onReportado?: () => void;
}

/**
 * Reporte urgente de una situación grave (agresión, daño al cuerpo o a la salud, posible delito). El docente no tipifica ni asigna roles:
 * cuenta qué pasó, a quiénes nombra y qué hizo en el momento. Coordinación de convivencia recibe la alerta, abre el caso y define el tipo
 * y el rol de cada estudiante. No queda ningún antecedente en el Observador de los estudiantes.
 */
export function ReporteUrgenteDrawer(props: Props) {
  if (!props.open) return null;
  return <Formulario {...props} />;
}

function Formulario({ onClose, estudiantes, onReportado }: Props) {
  const reportar = useReportarSituacionGrave();
  const [fecha, setFecha] = useState(hoyLocal());
  const [hechos, setHechos] = useState('');
  const [contencion, setContencion] = useState('');

  const guardar = async (e: FormEvent) => {
    e.preventDefault();
    await reportar.mutateAsync({ fecha_hecho: fecha, hechos, acciones_contencion: contencion, estudiantes_ids: estudiantes.map((s) => s.student_id) });
    onReportado?.();
    onClose();
  };

  return (
    <Drawer
      open
      size="lg"
      title="Reporte urgente"
      subtitle={estudiantes.length === 1 ? `${estudiantes[0]?.nombre} ${estudiantes[0]?.apellido} · ${estudiantes[0]?.grupo}` : `${estudiantes.length} estudiantes`}
      onClose={onClose}
      onSubmit={guardar}
      submitLabel="Enviar a coordinación de convivencia"
      submitVariant="soft-danger"
      isSubmitting={reportar.isPending}
      submitDisabled={!hechos.trim() || contencion.trim().length < 5 || estudiantes.length === 0}
    >
      {reportar.isError && <Alert tone="error">{errorMessage(reportar.error)}</Alert>}
      <Alert tone="warning">
        Coordinación de convivencia recibe una alerta de inmediato, abre el caso y define el tipo de situación y el papel de cada estudiante. Tú no tienes que clasificar nada.
      </Alert>

      <Input label="Fecha del hecho" type="date" max={hoyLocal()} value={fecha} onChange={(e) => setFecha(e.target.value)} required />
      <Textarea
        label="Qué pasó"
        rows={5}
        maxLength={2000}
        value={hechos}
        onChange={(e) => setHechos(e.target.value)}
        required
        hint="Relata lo que viste, de forma objetiva. Si hay otros estudiantes involucrados que no seleccionaste, descríbelos aquí: coordinación los agrega al caso. No incluyas diagnósticos ni datos de salud."
      />
      <Textarea
        label="Medida de contención inmediata"
        rows={3}
        maxLength={1000}
        value={contencion}
        onChange={(e) => setContencion(e.target.value)}
        required
        hint="Qué hiciste de inmediato para proteger a las personas (separar a los estudiantes, llevar a enfermería, avisar a un directivo…)."
      />
    </Drawer>
  );
}
