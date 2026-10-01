import { type FormEvent, useState } from 'react';
import { useActualizarPonderacionComponentes } from '../../hooks/useAniosLectivos';
import type { AcademicYear, ComponenteSiee } from '../../types/domain';
import { Alert, errorMessage } from '../ui/Alert';
import { Chip } from '../ui/Badge';
import { Drawer } from '../ui/Drawer';
import { Input } from '../ui/Field';

interface PonderacionComponentesDrawerProps {
  open: boolean;
  anio: AcademicYear | null;
  onClose: () => void;
}

const ETIQUETAS: Record<ComponenteSiee, string> = {
  COGNITIVO_SABER: 'Saber (cognitivo)',
  PROCEDIMENTAL_HACER: 'Hacer (procedimental)',
  ACTITUDINAL_SER: 'Ser (actitudinal)',
};

const RESPALDO_PORCENTAJE: Record<ComponenteSiee, number> = {
  COGNITIVO_SABER: 40,
  PROCEDIMENTAL_HACER: 40,
  ACTITUDINAL_SER: 20,
};

/**
 * Ponderación de componentes del SIEE (Decreto 1290, CU-ADM-04): los pesos de Saber/Hacer/Ser
 * para la nota de asignatura, que ya no quedan quemados en el motor de boletines (ver
 * backend/src/utils/siee#ponderacionEfectiva). Se editan como porcentaje (0-100, deben sumar
 * 100) y se convierten a fracción (0-1) al guardar, que es como los consume el backend.
 */
export function PonderacionComponentesDrawer(props: PonderacionComponentesDrawerProps) {
  if (!props.open || !props.anio) return null;
  return <Formulario key={props.anio._id} {...props} anio={props.anio} />;
}

function Formulario({ anio, onClose }: PonderacionComponentesDrawerProps & { anio: AcademicYear }) {
  const actual = anio.ponderacion_componentes;
  const guardar = useActualizarPonderacionComponentes();

  const [porcentajes, setPorcentajes] = useState<Record<ComponenteSiee, string>>({
    COGNITIVO_SABER: String(actual ? actual.COGNITIVO_SABER * 100 : RESPALDO_PORCENTAJE.COGNITIVO_SABER),
    PROCEDIMENTAL_HACER: String(actual ? actual.PROCEDIMENTAL_HACER * 100 : RESPALDO_PORCENTAJE.PROCEDIMENTAL_HACER),
    ACTITUDINAL_SER: String(actual ? actual.ACTITUDINAL_SER * 100 : RESPALDO_PORCENTAJE.ACTITUDINAL_SER),
  });

  const suma = Object.values(porcentajes).reduce((sum, v) => sum + (Number(v) || 0), 0);
  const sumaValida = Math.round(suma * 100) / 100 === 100;

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    guardar.reset();
    await guardar.mutateAsync({
      anioId: anio._id,
      COGNITIVO_SABER: Number(porcentajes.COGNITIVO_SABER) / 100,
      PROCEDIMENTAL_HACER: Number(porcentajes.PROCEDIMENTAL_HACER) / 100,
      ACTITUDINAL_SER: Number(porcentajes.ACTITUDINAL_SER) / 100,
    });
    onClose();
  }

  return (
    <Drawer
      open
      title="Ponderación de componentes del SIEE"
      subtitle={`${anio.nombre} · Decreto 1290 de 2009`}
      onClose={onClose}
      onSubmit={handleSubmit}
      submitLabel="Guardar ponderación"
      isSubmitting={guardar.isPending}
      submitDisabled={!sumaValida}
    >
      {guardar.isError && <Alert tone="error">{errorMessage(guardar.error)}</Alert>}

      <p className="text-xs text-muted">
        Define el peso de cada componente evaluativo en la nota de asignatura. Los 3 componentes (Saber, Hacer, Ser)
        son obligatorios por ley; tú defines su peso según el manual de convivencia/SIEE de la institución. Deben
        sumar 100%.
      </p>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        {(Object.keys(ETIQUETAS) as ComponenteSiee[]).map((componente) => (
          <Input
            key={componente}
            label={`${ETIQUETAS[componente]} (%)`}
            type="number"
            min={0}
            max={100}
            step="any"
            required
            value={porcentajes[componente]}
            onChange={(e) => setPorcentajes((prev) => ({ ...prev, [componente]: e.target.value }))}
          />
        ))}
      </div>

      <div>
        <Chip tone={sumaValida ? 'green' : 'red'}>Suma: {suma}%</Chip>
        {!sumaValida && <p className="mt-1 text-xs text-danger">La suma de los 3 pesos debe ser exactamente 100%.</p>}
      </div>
    </Drawer>
  );
}
