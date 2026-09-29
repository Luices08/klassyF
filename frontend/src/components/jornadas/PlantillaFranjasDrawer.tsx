import { type FormEvent, useState } from 'react';
import { useActualizarPlantillaFranjas } from '../../hooks/useInstitution';
import { NOMBRES_TIPO_FRANJA, TIPOS_FRANJA, type FranjaPlantilla, type TipoFranja } from '../../types/domain';
import { Alert, errorMessage } from '../ui/Alert';
import { Button } from '../ui/Button';
import { Drawer } from '../ui/Drawer';
import { Input, Select } from '../ui/Field';
import { IconButton } from '../ui/IconButton';
import { PlusIcon, TrashIcon } from '../ui/icons';

interface FilaForm {
  _key: string;
  nombre: string;
  tipo: TipoFranja;
  duracion_min: number;
}

const conClave = (f: FranjaPlantilla): FilaForm => ({ _key: crypto.randomUUID(), ...f });

function formatoDuracion(minutos: number): string {
  const h = Math.floor(minutos / 60);
  const m = minutos % 60;
  return h > 0 ? `${h} h${m ? ` ${m} min` : ''}` : `${m} min`;
}

interface PlantillaFranjasDrawerProps {
  open: boolean;
  plantilla: FranjaPlantilla[];
  onClose: () => void;
}

/**
 * Plantilla base de franjas de la institución: clases y descansos por duración (sin hora fija). Al cargarla en una
 * jornada, los bloques se encadenan desde la hora de inicio de esa jornada; M09 usa las franjas resultantes.
 */
export function PlantillaFranjasDrawer(props: PlantillaFranjasDrawerProps) {
  if (!props.open) return null;
  return <Formulario {...props} />;
}

function Formulario({ plantilla, onClose }: PlantillaFranjasDrawerProps) {
  const guardar = useActualizarPlantillaFranjas();
  const [filas, setFilas] = useState<FilaForm[]>(() => plantilla.map(conClave));

  const total = filas.reduce((suma, f) => suma + (Number(f.duracion_min) || 0), 0);

  function actualizar(clave: string, cambio: Partial<FilaForm>) {
    setFilas((prev) => prev.map((f) => (f._key === clave ? { ...f, ...cambio } : f)));
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    guardar.reset();
    await guardar.mutateAsync(
      filas.map(({ nombre, tipo, duracion_min }) => ({ nombre: nombre.trim(), tipo, duracion_min: Number(duracion_min) }))
    );
    onClose();
  }

  return (
    <Drawer
      open
      size="lg"
      title="Plantilla de franjas horarias"
      subtitle="Estructura base de clases y descansos para todas las jornadas."
      onClose={onClose}
      onSubmit={handleSubmit}
      submitLabel="Guardar plantilla"
      isSubmitting={guardar.isPending}
    >
      {guardar.isError && <Alert tone="error">{errorMessage(guardar.error)}</Alert>}
      <Alert tone="info">
        Define solo la duración de cada bloque. Al cargar la plantilla en una jornada (Sedes y jornadas), los bloques se
        encadenan desde la hora de inicio de esa jornada, así sirve igual para mañana, tarde o sabatina. Cambiarla no
        modifica las jornadas que ya configuraste.
      </Alert>

      <div className="flex items-center justify-between gap-2">
        <h3 className="text-h3 text-ink">Bloques</h3>
        <Button
          type="button"
          variant="outline"
          onClick={() => setFilas((prev) => [...prev, conClave({ nombre: '', tipo: 'CLASE', duracion_min: 55 })])}
        >
          <PlusIcon className="h-4 w-4" />
          Agregar bloque
        </Button>
      </div>

      {filas.length === 0 && (
        <Alert tone="warning">
          Sin plantilla: cada jornada se configura a mano. Agrega bloques (clases y descansos) para poder cargarlos en
          todas las jornadas.
        </Alert>
      )}

      <div className="space-y-2">
        {filas.map((f, i) => (
          <div key={f._key} className="grid grid-cols-12 items-end gap-2">
            <div className="col-span-12 sm:col-span-5">
              <Input
                id={`plantilla-${f._key}-nombre`}
                label={`Nombre del bloque ${i + 1}`}
                hideLabel={i > 0}
                placeholder="Clase 1, Descanso, Almuerzo..."
                required
                value={f.nombre}
                onChange={(e) => actualizar(f._key, { nombre: e.target.value })}
              />
            </div>
            <div className="col-span-6 sm:col-span-3">
              <Select
                id={`plantilla-${f._key}-tipo`}
                label={`Tipo del bloque ${i + 1}`}
                hideLabel={i > 0}
                value={f.tipo}
                onChange={(e) => actualizar(f._key, { tipo: e.target.value as TipoFranja })}
              >
                {TIPOS_FRANJA.map((t) => (
                  <option key={t} value={t}>
                    {NOMBRES_TIPO_FRANJA[t]}
                  </option>
                ))}
              </Select>
            </div>
            <div className="col-span-5 sm:col-span-3">
              <Input
                id={`plantilla-${f._key}-duracion`}
                label={`Duración del bloque ${i + 1} (minutos)`}
                hideLabel={i > 0}
                type="number"
                min={5}
                max={480}
                step={5}
                required
                value={f.duracion_min}
                onChange={(e) => actualizar(f._key, { duracion_min: Number(e.target.value) })}
              />
            </div>
            <div className="col-span-1 flex justify-end pb-0.5">
              <IconButton
                tone="danger"
                label="Quitar bloque"
                icon={<TrashIcon />}
                onClick={() => setFilas((prev) => prev.filter((x) => x._key !== f._key))}
              />
            </div>
          </div>
        ))}
      </div>
      {filas.length > 0 && (
        <p className="text-sm font-semibold text-ink">
          Duración total: {total} min ({formatoDuracion(total)}). La jornada donde la cargues debe durar al menos eso.
        </p>
      )}
    </Drawer>
  );
}
