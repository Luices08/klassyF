import { type FormEvent, useState } from 'react';
import { useActualizarEvento, useCrearEvento } from '../../hooks/useAniosLectivos';
import { aInputFecha } from '../../lib/fechas';
import {
  NOMBRES_TIPO_EVENTO,
  TIPOS_EVENTO_CALENDARIO,
  type AcademicYear,
  type EventoCalendario,
  type TipoEventoCalendario,
} from '../../types/domain';
import { Alert, errorMessage } from '../ui/Alert';
import { Drawer } from '../ui/Drawer';
import { Input, Select } from '../ui/Field';

interface EventoDrawerProps {
  open: boolean;
  anio: AcademicYear;
  /** null = evento nuevo; con valor = edición. */
  evento: EventoCalendario | null;
  onClose: () => void;
}

const AYUDA_TIPO: Record<TipoEventoCalendario, string> = {
  RECESO: 'Días sin clase: asistencia no exigible y no cuentan como semanas lectivas.',
  VACACIONES: 'Días sin clase: asistencia no exigible y no cuentan como semanas lectivas.',
  DESARROLLO_INSTITUCIONAL: 'Sin estudiantes, pero los docentes sí operan en la plataforma.',
  RECUPERACION_PERIODO: 'Ventana de refuerzo y nivelación de un periodo (M18).',
  RECUPERACION_FINAL: 'Ventana de recuperación de fin de año (M18).',
};

/** Receso, vacaciones, jornada institucional o ventana de recuperación del calendario del año lectivo. */
export function EventoDrawer(props: EventoDrawerProps) {
  if (!props.open) return null;
  return <FormularioEvento {...props} />;
}

function FormularioEvento({ anio, evento, onClose }: EventoDrawerProps) {
  const crear = useCrearEvento();
  const actualizar = useActualizarEvento();
  const mutacion = evento ? actualizar : crear;

  const [tipo, setTipo] = useState<TipoEventoCalendario>(evento?.tipo ?? 'RECESO');
  const [nombre, setNombre] = useState(evento?.nombre ?? '');
  const [fechaInicio, setFechaInicio] = useState(aInputFecha(evento?.fecha_inicio));
  const [fechaFin, setFechaFin] = useState(aInputFecha(evento?.fecha_fin));
  const [periodo, setPeriodo] = useState(evento?.periodo_numero ?? anio.periodos[0]?.numero ?? 1);
  const [limite, setLimite] = useState(aInputFecha(evento?.fecha_limite_resultados));

  const esRecuperacion = tipo === 'RECUPERACION_PERIODO' || tipo === 'RECUPERACION_FINAL';

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    mutacion.reset();
    const datos = {
      anioId: anio._id,
      tipo,
      nombre: nombre.trim(),
      fecha_inicio: fechaInicio,
      fecha_fin: fechaFin,
      periodo_numero: tipo === 'RECUPERACION_PERIODO' ? periodo : null,
      fecha_limite_resultados: esRecuperacion && limite ? limite : null,
    };
    if (evento) await actualizar.mutateAsync({ ...datos, eventoId: evento._id });
    else await crear.mutateAsync(datos);
    onClose();
  }

  return (
    <Drawer
      open
      title={evento ? 'Editar evento del calendario' : 'Nuevo evento del calendario'}
      subtitle={anio.nombre}
      onClose={onClose}
      onSubmit={handleSubmit}
      submitLabel={evento ? 'Guardar cambios' : 'Agregar evento'}
      isSubmitting={mutacion.isPending}
    >
      {mutacion.isError && <Alert tone="error">{errorMessage(mutacion.error)}</Alert>}

      <Select label="Tipo" value={tipo} onChange={(e) => setTipo(e.target.value as TipoEventoCalendario)} hint={AYUDA_TIPO[tipo]}>
        {TIPOS_EVENTO_CALENDARIO.map((t) => (
          <option key={t} value={t}>
            {NOMBRES_TIPO_EVENTO[t]}
          </option>
        ))}
      </Select>
      <Input
        label="Nombre"
        required
        placeholder="Ej. Semana Santa"
        value={nombre}
        onChange={(e) => setNombre(e.target.value)}
      />
      <div className="grid grid-cols-2 gap-3">
        <Input label="Desde" type="date" required value={fechaInicio} onChange={(e) => setFechaInicio(e.target.value)} />
        <Input label="Hasta" type="date" required value={fechaFin} onChange={(e) => setFechaFin(e.target.value)} />
      </div>

      {tipo === 'RECUPERACION_PERIODO' && (
        <Select label="Periodo que se recupera" value={periodo} onChange={(e) => setPeriodo(Number(e.target.value))}>
          {anio.periodos.map((p) => (
            <option key={p.numero} value={p.numero}>
              {p.nombre}
            </option>
          ))}
        </Select>
      )}

      {esRecuperacion && (
        <Input
          label="Plazo para registrar resultados (opcional)"
          type="date"
          value={limite}
          onChange={(e) => setLimite(e.target.value)}
          hint="Fecha límite para que los docentes registren el resultado de la nivelación."
        />
      )}
    </Drawer>
  );
}
