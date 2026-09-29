import { type FormEvent, useState } from 'react';
import { useActualizarHorarioJornada, useFranjasDesdePlantilla } from '../../hooks/useCatalogs';
import {
  DIAS_SEMANA_ISO,
  NOMBRES_DIA_SEMANA,
  NOMBRES_TIPO_FRANJA,
  TIPOS_FRANJA,
  type JornadaOperativa,
  type TipoFranja,
} from '../../types/domain';
import { Alert, errorMessage } from '../ui/Alert';
import { Button } from '../ui/Button';
import { Drawer } from '../ui/Drawer';
import { Input, Select } from '../ui/Field';
import { IconButton } from '../ui/IconButton';
import { PlusIcon, TrashIcon } from '../ui/icons';

interface FranjaForm {
  _key: string;
  nombre: string;
  tipo: TipoFranja;
  hora_inicio: string;
  hora_fin: string;
}

interface FranjasJornadaDrawerProps {
  open: boolean;
  jornada: JornadaOperativa | null;
  onClose: () => void;
}

/**
 * Horario de una jornada (M01): los días en que opera y sus franjas reales de clase y descanso. Es la estructura de
 * tiempo que usa la malla de ocupación de espacios (M10) y usará el motor de horarios (M09).
 */
export function FranjasJornadaDrawer(props: FranjasJornadaDrawerProps) {
  if (!props.open || !props.jornada) return null;
  return <Formulario key={props.jornada._id} {...props} jornada={props.jornada} />;
}

const conClave = (f: Omit<FranjaForm, '_key'>): FranjaForm => ({ _key: crypto.randomUUID(), ...f });

function Formulario({ jornada, onClose }: FranjasJornadaDrawerProps & { jornada: JornadaOperativa }) {
  const guardar = useActualizarHorarioJornada();
  const cargarPlantilla = useFranjasDesdePlantilla();

  const [dias, setDias] = useState<number[]>(jornada.dias_habiles);
  const [franjas, setFranjas] = useState<FranjaForm[]>(() => jornada.franjas.map(conClave));
  const [aviso, setAviso] = useState<string | null>(null);

  function alternarDia(dia: number) {
    setDias((prev) => (prev.includes(dia) ? prev.filter((d) => d !== dia) : [...prev, dia]));
  }

  function actualizar(clave: string, cambio: Partial<FranjaForm>) {
    setFranjas((prev) => prev.map((f) => (f._key === clave ? { ...f, ...cambio } : f)));
  }

  function agregar() {
    // La nueva franja arranca donde termina la anterior, o al inicio de la jornada si es la primera.
    const ultima = franjas[franjas.length - 1];
    const inicio = ultima?.hora_fin || jornada.hora_inicio;
    setFranjas((prev) => [...prev, conClave({ nombre: '', tipo: 'CLASE', hora_inicio: inicio, hora_fin: '' })]);
  }

  async function handleCargarPlantilla() {
    cargarPlantilla.reset();
    setAviso(null);
    const resultado = await cargarPlantilla.mutateAsync(jornada._id);
    setFranjas(resultado.franjas.map(conClave));
    setAviso(
      `Se cargaron ${resultado.franjas.length} bloques de la plantilla institucional desde las ${jornada.hora_inicio}. ` +
        (resultado.minutos_libres > 0 ? `Quedan ${resultado.minutos_libres} minutos libres al final de la jornada. ` : '') +
        'Revísalos y guarda para aplicarlos.'
    );
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    guardar.reset();
    await guardar.mutateAsync({
      id: jornada._id,
      dias_habiles: dias,
      franjas: franjas.map(({ nombre, tipo, hora_inicio, hora_fin }) => ({
        nombre: nombre.trim(),
        tipo,
        hora_inicio,
        hora_fin,
      })),
    });
    onClose();
  }

  const sede = typeof jornada.sede_id === 'string' ? '' : `${jornada.sede_id.nombre} · `;

  return (
    <Drawer
      open
      size="lg"
      title={`Horario de la jornada ${jornada.nombre}`}
      subtitle={`${sede}${jornada.hora_inicio}–${jornada.hora_fin}`}
      onClose={onClose}
      onSubmit={handleSubmit}
      submitLabel="Guardar horario"
      isSubmitting={guardar.isPending}
      submitDisabled={dias.length === 0}
    >
      {guardar.isError && <Alert tone="error">{errorMessage(guardar.error)}</Alert>}

      <fieldset>
        <legend className="mb-1.5 text-label text-body">Días en que opera la jornada</legend>
        <div className="flex flex-wrap gap-x-4 gap-y-2">
          {DIAS_SEMANA_ISO.map((d) => (
            <label key={d} className="flex items-center gap-2 text-sm text-body">
              <input
                type="checkbox"
                checked={dias.includes(d)}
                onChange={() => alternarDia(d)}
                className="h-4 w-4 rounded border-border text-primary focus:ring-primary"
              />
              {NOMBRES_DIA_SEMANA[d]}
            </label>
          ))}
        </div>
        <p className="mt-1 text-xs text-muted">
          Marca el sábado o el domingo si la institución tiene jornadas de fin de semana.
        </p>
      </fieldset>

      <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
        <h3 className="text-h3 text-ink">Franjas de clase y descanso</h3>
        <div className="flex gap-2">
          <Button type="button" variant="outline" onClick={handleCargarPlantilla} isLoading={cargarPlantilla.isPending}>
            Cargar plantilla institucional
          </Button>
          <Button type="button" variant="outline" onClick={agregar}>
            <PlusIcon className="h-4 w-4" />
            Agregar franja
          </Button>
        </div>
      </div>

      {cargarPlantilla.isError && <Alert tone="error">{errorMessage(cargarPlantilla.error)}</Alert>}
      {aviso && <Alert tone="info">{aviso}</Alert>}
      {franjas.length === 0 && (
        <Alert tone="warning">
          Esta jornada aún no tiene franjas. Agrégalas a mano o cárgalas desde la plantilla institucional; el horario de
          clases y la malla de espacios usan esta estructura.
        </Alert>
      )}

      <div className="space-y-2">
        {franjas.map((f, i) => (
          <div key={f._key} className="grid grid-cols-12 items-end gap-2">
            <div className="col-span-12 sm:col-span-4">
              <Input
                id={`franja-${f._key}-nombre`}
                label={`Nombre de la franja ${i + 1}`}
                hideLabel={i > 0}
                placeholder="Clase 1, Descanso..."
                required
                value={f.nombre}
                onChange={(e) => actualizar(f._key, { nombre: e.target.value })}
              />
            </div>
            <div className="col-span-5 sm:col-span-3">
              <Select
                id={`franja-${f._key}-tipo`}
                label={`Tipo de la franja ${i + 1}`}
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
            <div className="col-span-3 sm:col-span-2">
              <Input
                id={`franja-${f._key}-inicio`}
                label={`Inicio de la franja ${i + 1}`}
                hideLabel={i > 0}
                type="time"
                required
                value={f.hora_inicio}
                onChange={(e) => actualizar(f._key, { hora_inicio: e.target.value })}
              />
            </div>
            <div className="col-span-3 sm:col-span-2">
              <Input
                id={`franja-${f._key}-fin`}
                label={`Fin de la franja ${i + 1}`}
                hideLabel={i > 0}
                type="time"
                required
                value={f.hora_fin}
                onChange={(e) => actualizar(f._key, { hora_fin: e.target.value })}
              />
            </div>
            <div className="col-span-1 flex justify-end pb-0.5">
              <IconButton
                tone="danger"
                label="Quitar franja"
                icon={<TrashIcon />}
                onClick={() => setFranjas((prev) => prev.filter((x) => x._key !== f._key))}
              />
            </div>
          </div>
        ))}
      </div>
      {franjas.length > 0 && (
        <p className="text-xs text-muted">
          Las franjas deben ir en orden, sin traslaparse y dentro del horario de la jornada ({jornada.hora_inicio}–
          {jornada.hora_fin}).
        </p>
      )}
    </Drawer>
  );
}
