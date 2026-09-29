import { type FormEvent, useState } from 'react';
import { useCambiarEstadoEspacio, useActualizarEspacio, useCrearEspacio } from '../../hooks/useEspacios';
import { useAreas } from '../../hooks/useCatalogs';
import {
  ESTADOS_ESPACIO,
  NOMBRES_ESTADO_ESPACIO,
  NOMBRES_RECURSO_ESPACIO,
  NOMBRES_TIPO_ESPACIO,
  RECURSOS_ESPACIO,
  TIPOS_ESPACIO,
  type Campus,
  type Espacio,
  type EstadoEspacio,
  type RecursoEspacio,
  type TipoEspacio,
} from '../../types/domain';
import { Alert, errorMessage } from '../ui/Alert';
import { Drawer } from '../ui/Drawer';
import { Input, Select } from '../ui/Field';
import { MultiSelect } from '../ui/MultiSelect';

interface EspacioDrawerProps {
  open: boolean;
  /** null = nuevo espacio; con valor = edición. */
  espacio: Espacio | null;
  sedes: Campus[];
  /** Sede preseleccionada al crear (la del filtro activo). */
  sedeInicialId?: string;
  onClose: () => void;
}

/** Formulario Nuevo / Editar espacio (M10). Se monta solo mientras está abierto para arrancar siempre limpio. */
export function EspacioDrawer(props: EspacioDrawerProps) {
  if (!props.open) return null;
  return <FormularioEspacio {...props} />;
}

function FormularioEspacio({ espacio, sedes, sedeInicialId, onClose }: EspacioDrawerProps) {
  const editando = espacio !== null;
  const areasQuery = useAreas();
  const crear = useCrearEspacio();
  const actualizar = useActualizarEspacio();
  const cambiarEstado = useCambiarEstadoEspacio();
  const mutacion = editando ? actualizar : crear;

  const [sedeId, setSedeId] = useState(espacio?.sede_id._id ?? sedeInicialId ?? sedes[0]?._id ?? '');
  const [nombre, setNombre] = useState(espacio?.nombre ?? '');
  const [tipo, setTipo] = useState<TipoEspacio>(espacio?.tipo_espacio ?? 'AULA_REGULAR');
  const [capacidad, setCapacidad] = useState(espacio?.capacidad ?? 25);
  const [pisoBloque, setPisoBloque] = useState(espacio?.piso_bloque ?? '');
  const [recursos, setRecursos] = useState<RecursoEspacio[]>(espacio?.recursos ?? []);
  const [computadores, setComputadores] = useState(espacio?.computadores_operativos ?? 0);
  const [areas, setAreas] = useState<string[]>(espacio?.areas_exclusivas ?? []);
  const [simultaneos, setSimultaneos] = useState(espacio?.admite_grupos_simultaneos ?? false);
  const [estado, setEstado] = useState<EstadoEspacio>(espacio?.estado ?? 'DISPONIBLE');

  // Aforo mínimo recomendado: el cupo del grupo más grande que ya usa este espacio como salón titular.
  const minimoRecomendado = Math.max(0, ...(espacio?.grupos_asignados ?? []).map((g) => g.max_capacity));
  const porDebajoDelMinimo = editando && minimoRecomendado > 0 && capacidad < minimoRecomendado;

  function alternarRecurso(recurso: RecursoEspacio) {
    setRecursos((prev) => (prev.includes(recurso) ? prev.filter((r) => r !== recurso) : [...prev, recurso]));
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    mutacion.reset();
    cambiarEstado.reset();

    const datos = {
      nombre: nombre.trim(),
      tipo_espacio: tipo,
      capacidad: Number(capacidad),
      piso_bloque: pisoBloque.trim() || null,
      recursos,
      computadores_operativos: Number(computadores) || 0,
      areas_exclusivas: areas,
      admite_grupos_simultaneos: simultaneos,
    };

    if (espacio) {
      await actualizar.mutateAsync({ id: espacio._id, ...datos });
      if (estado !== espacio.estado) await cambiarEstado.mutateAsync({ id: espacio._id, estado });
    } else {
      await crear.mutateAsync({ sede_id: sedeId, ...datos });
    }
    onClose();
  }

  const error = mutacion.error ?? cambiarEstado.error;

  return (
    <Drawer
      open
      size="lg"
      title={editando ? `Editar ${espacio.nombre}` : 'Nuevo espacio'}
      subtitle="Aulas, laboratorios, salas y canchas de una sede. Su aforo limita el cupo de los grupos."
      onClose={onClose}
      onSubmit={handleSubmit}
      submitLabel={editando ? 'Guardar cambios' : 'Crear espacio'}
      isSubmitting={mutacion.isPending || cambiarEstado.isPending}
      submitDisabled={!sedeId || !nombre.trim() || !(Number(capacidad) >= 1)}
    >
      {error && <Alert tone="error">{errorMessage(error)}</Alert>}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Select
          label="Sede"
          required
          value={sedeId}
          disabled={editando}
          onChange={(e) => setSedeId(e.target.value)}
          hint={editando ? 'La sede no se puede cambiar: los grupos que lo usan quedarían en otra sede.' : undefined}
        >
          {sedes.map((s) => (
            <option key={s._id} value={s._id}>
              {s.nombre}
            </option>
          ))}
        </Select>
        <Input
          label="Nombre / nomenclatura"
          required
          placeholder="Aula 101, Laboratorio de Química..."
          value={nombre}
          onChange={(e) => setNombre(e.target.value)}
        />
        <Select label="Tipo de espacio" value={tipo} onChange={(e) => setTipo(e.target.value as TipoEspacio)}>
          {TIPOS_ESPACIO.map((t) => (
            <option key={t} value={t}>
              {NOMBRES_TIPO_ESPACIO[t]}
            </option>
          ))}
        </Select>
        <Input
          label="Capacidad máxima / aforo"
          type="number"
          min={1}
          step={1}
          required
          value={capacidad}
          onChange={(e) => setCapacidad(Number(e.target.value))}
          hint="Puestos disponibles: es el tope del cupo de los grupos que usen este espacio como salón."
        />
        <Input
          label="Piso / Bloque (opcional)"
          placeholder="Bloque A - Piso 2"
          value={pisoBloque}
          onChange={(e) => setPisoBloque(e.target.value)}
        />
        {editando && (
          <Select
            label="Estado operativo"
            value={estado}
            onChange={(e) => setEstado(e.target.value as EstadoEspacio)}
            hint="En mantenimiento o inactivo no se asigna a grupos ni al motor de horarios."
          >
            {ESTADOS_ESPACIO.map((s) => (
              <option key={s} value={s}>
                {NOMBRES_ESTADO_ESPACIO[s]}
              </option>
            ))}
          </Select>
        )}
      </div>

      {porDebajoDelMinimo && (
        <Alert tone="warning">
          Hay grupos asignados con cupo de hasta {minimoRecomendado}: el aforo mínimo recomendado es {minimoRecomendado}. Si
          guardas {capacidad}, esos grupos quedarán marcados con sobrecupo.
        </Alert>
      )}

      <fieldset className="space-y-2">
        <legend className="mb-1.5 text-label text-body">Recursos y dotación</legend>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          {RECURSOS_ESPACIO.map((r) => (
            <label key={r} className="flex items-center gap-2 text-sm text-body">
              <input
                type="checkbox"
                checked={recursos.includes(r)}
                onChange={() => alternarRecurso(r)}
                className="h-4 w-4 rounded border-border text-primary focus:ring-primary"
              />
              {NOMBRES_RECURSO_ESPACIO[r]}
            </label>
          ))}
        </div>
        <div className="max-w-xs">
          <Input
            label="Computadores operativos"
            type="number"
            min={0}
            step={1}
            value={computadores}
            onChange={(e) => setComputadores(Number(e.target.value))}
          />
        </div>
      </fieldset>

      <MultiSelect
        label="Áreas exclusivas (opcional)"
        options={(areasQuery.data ?? []).map((a) => ({ value: a._id, label: a.nombre }))}
        selected={areas}
        onChange={setAreas}
        allLabel="Uso general (sin restricción)"
      />
      {areasQuery.data?.length === 0 && (
        <p className="-mt-2 text-xs text-muted">Aún no hay áreas creadas; el espacio queda de uso general.</p>
      )}

      <label className="flex items-start gap-2 text-sm text-body">
        <input
          type="checkbox"
          checked={simultaneos}
          onChange={(e) => setSimultaneos(e.target.checked)}
          className="mt-0.5 h-4 w-4 rounded border-border text-primary focus:ring-primary"
        />
        <span>
          Admite varios grupos a la vez
          <span className="block text-xs text-muted">
            Para canchas, patios o auditorios. Si no, solo un grupo puede usarlo en cada jornada.
          </span>
        </span>
      </label>
    </Drawer>
  );
}
