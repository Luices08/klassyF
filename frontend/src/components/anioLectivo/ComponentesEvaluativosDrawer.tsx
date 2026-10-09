import { type FormEvent, useState } from 'react';
import { useActualizarComponentesEvaluativos } from '../../hooks/useAniosLectivos';
import {
  type AcademicYear,
  NOMBRES_ORIGEN_COMPONENTE,
  type OrigenComponente,
} from '../../types/domain';
import { Alert, errorMessage } from '../ui/Alert';
import { Chip } from '../ui/Badge';
import { Button } from '../ui/Button';
import { Drawer } from '../ui/Drawer';
import { Input, Select } from '../ui/Field';
import { IconButton } from '../ui/IconButton';
import { PlusIcon, TrashIcon } from '../ui/icons';

interface ComponentesEvaluativosDrawerProps {
  open: boolean;
  anio: AcademicYear | null;
  onClose: () => void;
}

interface FilaComponente {
  /** Los componentes que ya existían conservan su clave: las actividades programadas la referencian. */
  clave?: string;
  nombre: string;
  porcentaje: string;
  origen: OrigenComponente;
}

const MAX_COMPONENTES = 8;

/**
 * Componentes evaluativos del año (M12, CU-ADM-04): los bloques que forman el 100% de la nota de una asignatura en el
 * periodo (Saber/Hacer/Ser, Heteroevaluación, Autoevaluación...). Cada uno se alimenta del promedio de las actividades
 * de M11 o de una nota que el docente digita directo (p. ej. la autoevaluación). Sustituye a la ponderación fija
 * Saber/Hacer/Ser y, como la escala, solo se edita con el año en planificación.
 */
export function ComponentesEvaluativosDrawer(props: ComponentesEvaluativosDrawerProps) {
  if (!props.open || !props.anio) return null;
  return <Formulario key={props.anio._id} {...props} anio={props.anio} />;
}

function Formulario({ anio, onClose }: ComponentesEvaluativosDrawerProps & { anio: AcademicYear }) {
  const guardar = useActualizarComponentesEvaluativos();
  const [filas, setFilas] = useState<FilaComponente[]>(() =>
    anio.componentes_efectivos.map((c) => ({ clave: c.clave, nombre: c.nombre, porcentaje: String(c.porcentaje), origen: c.origen }))
  );

  const cambiar = (indice: number, cambios: Partial<FilaComponente>) =>
    setFilas((prev) => prev.map((f, i) => (i === indice ? { ...f, ...cambios } : f)));

  const suma = Math.round(filas.reduce((total, f) => total + (Number(f.porcentaje) || 0), 0) * 100) / 100;
  const nombres = filas.map((f) => f.nombre.trim().toLowerCase());
  const problema =
    filas.some((f) => f.nombre.trim() === '' || f.porcentaje === '' || Number(f.porcentaje) < 0)
      ? 'Cada componente necesita nombre y porcentaje.'
      : new Set(nombres).size !== nombres.length
        ? 'Hay dos componentes con el mismo nombre.'
        : !filas.some((f) => f.origen === 'ACTIVIDADES')
          ? 'Al menos un componente debe alimentarse de actividades; si no, no se podría programar ninguna.'
          : suma !== 100
            ? 'Los porcentajes deben sumar exactamente 100%.'
            : null;

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    guardar.reset();
    await guardar.mutateAsync({
      anioId: anio._id,
      componentes: filas.map((f) => ({ ...(f.clave ? { clave: f.clave } : {}), nombre: f.nombre.trim(), porcentaje: Number(f.porcentaje), origen: f.origen })),
    });
    onClose();
  }

  return (
    <Drawer
      open
      size="lg"
      title="Componentes evaluativos"
      subtitle={`${anio.nombre} · bloques de la nota de cada asignatura`}
      onClose={onClose}
      onSubmit={handleSubmit}
      submitLabel="Guardar componentes"
      isSubmitting={guardar.isPending}
      submitDisabled={problema !== null}
    >
      {guardar.isError && <Alert tone="error">{errorMessage(guardar.error)}</Alert>}

      <p className="text-xs text-muted">
        Define de qué bloques se compone el 100% de la nota de una asignatura en el periodo. Los que se alimentan de actividades promedian las
        que programa el docente (M11); los de nota directa los digita el docente en la planilla, sin actividad. La nota de cada bloque se
        pondera por su porcentaje.
      </p>

      <ul className="space-y-3">
        {filas.map((fila, i) => (
          <li key={fila.clave ?? `nuevo-${i}`} className="grid grid-cols-1 items-end gap-3 rounded-lg border border-border p-3 sm:grid-cols-[1fr_6rem_1fr_auto]">
            <Input label="Nombre" value={fila.nombre} maxLength={60} onChange={(e) => cambiar(i, { nombre: e.target.value })} />
            <Input
              label="Porcentaje"
              type="number"
              min={0}
              max={100}
              step="any"
              value={fila.porcentaje}
              onChange={(e) => cambiar(i, { porcentaje: e.target.value })}
            />
            <Select label="Se alimenta de" value={fila.origen} onChange={(e) => cambiar(i, { origen: e.target.value as OrigenComponente })}>
              {(Object.keys(NOMBRES_ORIGEN_COMPONENTE) as OrigenComponente[]).map((o) => (
                <option key={o} value={o}>
                  {NOMBRES_ORIGEN_COMPONENTE[o]}
                </option>
              ))}
            </Select>
            <IconButton
              tone="danger"
              label="Quitar componente"
              icon={<TrashIcon />}
              disabled={filas.length === 1}
              onClick={() => setFilas((prev) => prev.filter((_, j) => j !== i))}
            />
          </li>
        ))}
      </ul>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <Button type="button" variant="outline" disabled={filas.length >= MAX_COMPONENTES} onClick={() => setFilas((prev) => [...prev, { nombre: '', porcentaje: '0', origen: 'ACTIVIDADES' }])}>
          <PlusIcon className="h-4 w-4" />
          Agregar componente
        </Button>
        <Chip tone={suma === 100 ? 'green' : 'red'}>Suma: {suma}%</Chip>
      </div>
      {problema && <p className="text-xs text-danger">{problema}</p>}
    </Drawer>
  );
}
