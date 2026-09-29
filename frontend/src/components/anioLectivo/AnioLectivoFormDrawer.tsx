import { type FormEvent, useState } from 'react';
import { useActualizarAnio, useCrearAnio, type PeriodoInput } from '../../hooks/useAniosLectivos';
import { avisosCalendario } from '../../lib/calendarioColombia';
import { aInputFecha } from '../../lib/fechas';
import type { AcademicYear, Calendario } from '../../types/domain';
import { Alert, errorMessage } from '../ui/Alert';
import { Button } from '../ui/Button';
import { Drawer } from '../ui/Drawer';
import { Input, Select } from '../ui/Field';
import { IconButton } from '../ui/IconButton';
import { PlusIcon, TrashIcon } from '../ui/icons';

const MIN_PERIODOS = 2;
const MAX_PERIODOS = 4;

interface PeriodoForm {
  _key: string;
  numero: number;
  nombre: string;
  porcentaje: number;
  fecha_inicio: string;
  fecha_fin: string;
  fecha_apertura_notas: string;
  fecha_cierre_notas: string;
  cerrado: boolean;
}

function periodoNuevo(numero: number, porcentaje = 0): PeriodoForm {
  return {
    _key: crypto.randomUUID(),
    numero,
    nombre: `Periodo ${numero}`,
    porcentaje,
    fecha_inicio: '',
    fecha_fin: '',
    fecha_apertura_notas: '',
    fecha_cierre_notas: '',
    cerrado: false,
  };
}

function periodosDe(anio: AcademicYear | null): PeriodoForm[] {
  if (!anio) return [1, 2, 3, 4].map((n) => periodoNuevo(n, 25));
  return anio.periodos.map((p) => ({
    _key: crypto.randomUUID(),
    numero: p.numero,
    nombre: p.nombre,
    porcentaje: p.porcentaje,
    fecha_inicio: aInputFecha(p.fecha_inicio),
    fecha_fin: aInputFecha(p.fecha_fin),
    fecha_apertura_notas: aInputFecha(p.fecha_apertura_notas),
    fecha_cierre_notas: aInputFecha(p.fecha_cierre_notas),
    cerrado: p.estado === 'CERRADO',
  }));
}

interface AnioLectivoFormDrawerProps {
  open: boolean;
  onClose: () => void;
  /** null = crear un año nuevo; con valor = editar su parametrización. */
  anio: AcademicYear | null;
  /** Años existentes: de ahí se elige de cuál copiar los grupos al crear. */
  anios: AcademicYear[];
  onGuardado: (anio: AcademicYear, gruposCopiados?: number) => void;
}

/** Contenedor: monta el formulario solo mientras está abierto, así su estado siempre arranca limpio. */
export function AnioLectivoFormDrawer(props: AnioLectivoFormDrawerProps) {
  if (!props.open) return null;
  return <FormularioAnio {...props} />;
}

function FormularioAnio({ onClose, anio, anios, onGuardado }: AnioLectivoFormDrawerProps) {
  const editando = anio !== null;
  // Con el año en curso la cantidad de periodos ya no cambia y los cerrados quedan intactos.
  const estructuraBloqueada = anio?.estado === 'EN_CURSO';

  const crear = useCrearAnio();
  const actualizar = useActualizarAnio();
  const mutacion = editando ? actualizar : crear;

  const [year, setYear] = useState(() => anio?.year ?? (anios.length > 0 ? Math.max(...anios.map((x) => x.year)) + 1 : new Date().getFullYear()));
  const [nombre, setNombre] = useState(anio?.nombre ?? '');
  const [calendario, setCalendario] = useState<Calendario>(anio?.calendario ?? 'A');
  const [fechaInicio, setFechaInicio] = useState(aInputFecha(anio?.fecha_inicio));
  const [fechaFin, setFechaFin] = useState(aInputFecha(anio?.fecha_fin));
  const [periodos, setPeriodos] = useState<PeriodoForm[]>(() => periodosDe(anio));
  const [copiarDe, setCopiarDe] = useState(() => anios[0]?._id ?? '');

  const total = Math.round(periodos.reduce((sum, p) => sum + (Number(p.porcentaje) || 0), 0) * 100) / 100;
  const sumaOk = total === 100;
  const avisos = avisosCalendario(calendario, year, periodos);

  function actualizarPeriodo(index: number, cambio: Partial<PeriodoForm>) {
    setPeriodos((prev) => prev.map((p, i) => (i === index ? { ...p, ...cambio } : p)));
  }

  function agregarPeriodo() {
    setPeriodos((prev) => (prev.length >= MAX_PERIODOS ? prev : [...prev, periodoNuevo(prev.length + 1)]));
  }

  function quitarPeriodo(index: number) {
    setPeriodos((prev) =>
      prev.length <= MIN_PERIODOS ? prev : prev.filter((_, i) => i !== index).map((p, i) => ({ ...p, numero: i + 1 }))
    );
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    mutacion.reset();

    const periodosInput: PeriodoInput[] = periodos.map((p) => ({
      numero: p.numero,
      nombre: p.nombre,
      porcentaje: Number(p.porcentaje),
      fecha_inicio: p.fecha_inicio,
      fecha_fin: p.fecha_fin,
      fecha_apertura_notas: p.fecha_apertura_notas || null,
      fecha_cierre_notas: p.fecha_cierre_notas || null,
    }));
    const datos = {
      nombre: nombre.trim() || `Año lectivo ${year}`,
      calendario,
      // Si se dejan vacías, el año abarca desde el primer periodo hasta el último.
      fecha_inicio: fechaInicio || periodos[0]?.fecha_inicio || '',
      fecha_fin: fechaFin || periodos[periodos.length - 1]?.fecha_fin || '',
      periodos: periodosInput,
    };

    if (anio) {
      const actualizado = await actualizar.mutateAsync({ id: anio._id, ...datos });
      onGuardado(actualizado);
    } else {
      const creado = await crear.mutateAsync({ year, ...datos, copiar_grupos_de_id: copiarDe || undefined });
      onGuardado(creado, creado.grupos_copiados);
    }
    onClose();
  }

  return (
    <Drawer
      open
      size="lg"
      title={editando ? `Editar ${anio.nombre}` : 'Nuevo año lectivo'}
      subtitle={
        editando
          ? 'Ajusta el régimen, las fechas y los periodos de esta vigencia.'
          : 'Define la vigencia, su régimen y los periodos (de 2 a 4, sumando exactamente 100%).'
      }
      onClose={onClose}
      onSubmit={handleSubmit}
      submitLabel={editando ? 'Guardar cambios' : 'Crear año lectivo'}
      isSubmitting={mutacion.isPending}
      submitDisabled={!sumaOk}
    >
      {mutacion.isError && <Alert tone="error">{errorMessage(mutacion.error)}</Alert>}
      {estructuraBloqueada && (
        <Alert tone="info">
          El año está en curso: no se puede cambiar la cantidad de periodos y los periodos ya cerrados no se modifican.
        </Alert>
      )}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Input
          label="Año de la vigencia"
          type="number"
          min={2000}
          max={2100}
          required
          disabled={editando}
          value={year}
          onChange={(e) => setYear(Number(e.target.value))}
        />
        <Select label="Régimen de calendario" value={calendario} onChange={(e) => setCalendario(e.target.value as Calendario)}>
          <option value="A">Calendario A (febrero a noviembre)</option>
          <option value="B">Calendario B (agosto a junio)</option>
        </Select>
        <div className="sm:col-span-2">
          <Input
            label="Nombre (opcional)"
            placeholder={`Año lectivo ${year}`}
            value={nombre}
            onChange={(e) => setNombre(e.target.value)}
          />
        </div>
        <Input
          label="Inicio del año escolar"
          type="date"
          value={fechaInicio}
          onChange={(e) => setFechaInicio(e.target.value)}
          hint="Vacío = inicio del primer periodo."
        />
        <Input
          label="Fin del año escolar"
          type="date"
          value={fechaFin}
          onChange={(e) => setFechaFin(e.target.value)}
          hint="Vacío = fin del último periodo."
        />
      </div>

      {!editando && anios.length > 0 && (
        <Select
          label="Grupos del nuevo año"
          value={copiarDe}
          onChange={(e) => setCopiarDe(e.target.value)}
          hint="Se crean grupos nuevos (sin matrículas); los del año anterior no se tocan."
        >
          <option value="">No copiar grupos</option>
          {anios.map((a) => (
            <option key={a._id} value={a._id}>
              Copiar los grupos activos de {a.nombre}
            </option>
          ))}
        </Select>
      )}

      <div className="flex items-center justify-between gap-3 pt-2">
        <h3 className="text-h3 text-ink">Periodos</h3>
        {!estructuraBloqueada && (
          <Button type="button" variant="outline" onClick={agregarPeriodo} disabled={periodos.length >= MAX_PERIODOS}>
            <PlusIcon className="h-4 w-4" />
            Agregar periodo
          </Button>
        )}
      </div>

      <div className="space-y-3">
        {periodos.map((p, i) => (
          <div key={p._key} className="rounded-xl border border-border p-4">
            <div className="mb-3 flex items-center justify-between">
              <p className="text-sm font-semibold text-ink">Periodo {p.numero}</p>
              {!estructuraBloqueada && (
                <IconButton
                  tone="danger"
                  label="Quitar periodo"
                  icon={<TrashIcon />}
                  disabled={periodos.length <= MIN_PERIODOS}
                  onClick={() => quitarPeriodo(i)}
                />
              )}
            </div>
            {p.cerrado && <p className="mb-3 text-xs text-muted">Periodo cerrado: no se puede modificar.</p>}
            <div className="grid grid-cols-2 gap-3">
              <Input
                label="Nombre"
                required
                disabled={p.cerrado}
                value={p.nombre}
                onChange={(e) => actualizarPeriodo(i, { nombre: e.target.value })}
              />
              <Input
                label="Peso (%)"
                type="number"
                min={0}
                max={100}
                step="any"
                required
                disabled={p.cerrado}
                value={p.porcentaje}
                onChange={(e) => actualizarPeriodo(i, { porcentaje: Number(e.target.value) })}
              />
              <Input
                label="Inicio de clases"
                type="date"
                required
                disabled={p.cerrado}
                value={p.fecha_inicio}
                onChange={(e) => actualizarPeriodo(i, { fecha_inicio: e.target.value })}
              />
              <Input
                label="Fin de clases"
                type="date"
                required
                disabled={p.cerrado}
                value={p.fecha_fin}
                onChange={(e) => actualizarPeriodo(i, { fecha_fin: e.target.value })}
              />
              <Input
                label="Apertura de notas (opcional)"
                type="date"
                disabled={p.cerrado}
                value={p.fecha_apertura_notas}
                onChange={(e) => actualizarPeriodo(i, { fecha_apertura_notas: e.target.value })}
              />
              <Input
                label="Cierre de notas (opcional)"
                type="date"
                disabled={p.cerrado}
                value={p.fecha_cierre_notas}
                onChange={(e) => actualizarPeriodo(i, { fecha_cierre_notas: e.target.value })}
              />
            </div>
          </div>
        ))}
      </div>

      <p className={`text-sm font-semibold ${sumaOk ? 'text-success' : 'text-danger'}`}>
        Suma de pesos: {total}% {sumaOk ? '✓' : '(debe ser exactamente 100%)'}
      </p>

      {avisos.length > 0 && (
        <Alert tone="warning">
          <ul className="list-disc space-y-0.5 pl-4">
            {avisos.map((aviso) => (
              <li key={aviso}>{aviso}</li>
            ))}
          </ul>
        </Alert>
      )}
    </Drawer>
  );
}
