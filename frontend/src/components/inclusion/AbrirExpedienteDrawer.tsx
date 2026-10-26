import { type FormEvent, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Alert, errorMessage } from '../ui/Alert';
import { Drawer } from '../ui/Drawer';
import { Select } from '../ui/Field';
import { type EstudianteBuscado, type TipoExpediente, useAbrirExpediente } from '../../hooks/useInclusion';
import { SelectorCondicion } from './SelectorCondicion';
import { SelectorEstudiante } from './SelectorEstudiante';

/** Abre un expediente directo (sin solicitud previa). Un estudiante con matrícula activa tiene a lo sumo uno por año lectivo. */
export function AbrirExpedienteDrawer({ open, onClose }: { open: boolean; onClose: () => void }) {
  const navigate = useNavigate();
  const abrir = useAbrirExpediente();
  const [estudiante, setEstudiante] = useState<EstudianteBuscado | null>(null);
  const [tipo, setTipo] = useState<TipoExpediente>('PIAR');
  const [condicion, setCondicion] = useState('');
  const [copiar, setCopiar] = useState(true);

  const cerrar = () => {
    setEstudiante(null);
    setCondicion('');
    abrir.reset();
    onClose();
  };

  const enviar = async (e: FormEvent) => {
    e.preventDefault();
    if (!estudiante) return;
    const creado = await abrir.mutateAsync({ student_id: estudiante.student_id, tipo, condicion_codigo: condicion || undefined, copiar_anterior: copiar });
    cerrar();
    navigate(`/inclusion/expedientes/${creado._id}`);
  };

  return (
    <Drawer open={open} title="Nuevo expediente" subtitle="Orientación abre el expediente; luego registra la autorización de la familia." onClose={cerrar} onSubmit={enviar} submitLabel="Abrir expediente" isSubmitting={abrir.isPending} submitDisabled={!estudiante}>
      {abrir.isError && <Alert tone="error">{errorMessage(abrir.error)}</Alert>}
      <SelectorEstudiante seleccionado={estudiante} onSelect={setEstudiante} />
      <Select
        label="Tipo de expediente"
        value={tipo}
        onChange={(e) => {
          setTipo(e.target.value as TipoExpediente);
          setCondicion('');
        }}
      >
        <option value="PIAR">PIAR — Plan individual de ajustes razonables (discapacidad, Decreto 1421)</option>
        <option value="PLAN_APOYO">Plan de apoyo pedagógico (dificultades de aprendizaje)</option>
      </Select>
      <SelectorCondicion
        label="Condición"
        tipo={tipo}
        vacioLabel={tipo === 'PIAR' ? 'Por confirmar' : 'Sin definir aún'}
        value={condicion}
        onChange={(codigo) => setCondicion(codigo)}
        hint="Del catálogo del colegio. Se puede completar o cambiar después en el expediente."
      />
      <label className="flex items-center gap-2 text-sm text-body">
        <input type="checkbox" checked={copiar} onChange={(e) => setCopiar(e.target.checked)} className="h-4 w-4 rounded border-border text-primary focus:ring-primary" />
        Si ya tuvo uno el año anterior, copiar sus características como borrador (la autorización no se hereda)
      </label>
    </Drawer>
  );
}
