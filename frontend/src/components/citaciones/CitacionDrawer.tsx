import { type FormEvent, useEffect, useMemo, useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import {
  type CambiosCitacion,
  type DetalleCitacion,
  MAX_DESCRIPCION_CITACION,
  MAX_LUGAR_CITACION,
  MAX_TITULO_CITACION,
  MOTIVOS_CITACION,
  type MotivoCitacion,
  NOMBRES_MOTIVO_CITACION,
  NOMBRES_TIPO_CITACION,
  TIPOS_CITACION,
  type TipoCitacion,
  useActualizarCitacion,
  useCrearCitacion,
  useEstudiantesConvocables,
  useGruposConvocables,
} from '../../hooks/useCitaciones';
import { aInputFechaHora } from '../../lib/fechas';
import { opcionesDePersonas } from '../../lib/opcionesBuscables';
import { Alert, errorMessage } from '../ui/Alert';
import { Drawer } from '../ui/Drawer';
import { Input, Select, Textarea } from '../ui/Field';
import { MultiSelect } from '../ui/MultiSelect';
import { SelectBuscable } from '../ui/SelectBuscable';
import { Switch } from '../ui/Switch';

interface Props {
  open: boolean;
  /** Si se da, se edita esa citación (solo título, motivo, descripción, fecha y lugar); si no, se crea una. */
  citacion?: DetalleCitacion | null;
  onClose: () => void;
  onGuardada: (id: string) => void;
  /** Citar al acudiente de un estudiante ya elegido (p. ej. desde un caso de convivencia): no se piden grupo ni estudiante. */
  estudianteFijo?: { id: string; nombre: string };
  /** Con `estudianteFijo`, enlaza la citación a ese caso de convivencia. */
  casoId?: string;
}

/**
 * Crear o editar una citación (M24). Los grupos y estudiantes que se ofrecen son los que el servidor deja convocar a quien la hace;
 * el servidor lo vuelve a comprobar. Cambiar la fecha o el lugar de una ya enviada pide a los acudientes confirmar de nuevo.
 */
export function CitacionDrawer({ open, citacion, onClose, onGuardada, estudianteFijo, casoId }: Props) {
  const { user } = useAuth();
  const editando = Boolean(citacion);
  const crear = useCrearCitacion();
  const actualizar = useActualizarCitacion();
  // Orientación y convivencia solo citan a los acudientes de un estudiante (nunca a un grupo completo).
  const esBienestar = user?.rol === 'ORIENTADOR' || user?.rol === 'COORDINADOR_CONVIVENCIA';
  const soloParticular = esBienestar || Boolean(estudianteFijo);
  const grupos = useGruposConvocables(open && !editando && !estudianteFijo);

  const [tipo, setTipo] = useState<TipoCitacion>('GENERAL');
  const [motivo, setMotivo] = useState<MotivoCitacion>('ENTREGA_BOLETINES');
  const [titulo, setTitulo] = useState('');
  const [descripcion, setDescripcion] = useState('');
  const [fechaHora, setFechaHora] = useState('');
  const [lugar, setLugar] = useState('');
  const [grupoIds, setGrupoIds] = useState<string[]>([]);
  const [grupoDelEstudiante, setGrupoDelEstudiante] = useState('');
  const [estudianteId, setEstudianteId] = useState('');
  const [todos, setTodos] = useState(false);
  const estudiantes = useEstudiantesConvocables(tipo === 'PARTICULAR' && !estudianteFijo ? grupoDelEstudiante || undefined : undefined);

  useEffect(() => {
    if (!open) return;
    crear.reset();
    actualizar.reset();
    setTipo(citacion?.tipo ?? (soloParticular ? 'PARTICULAR' : 'GENERAL'));
    setMotivo(citacion?.motivo ?? (soloParticular ? 'ORIENTACION_CONVIVENCIA' : 'ENTREGA_BOLETINES'));
    setTitulo(citacion?.titulo ?? (estudianteFijo ? 'Citación de convivencia escolar' : ''));
    setDescripcion(citacion?.descripcion ?? '');
    setFechaHora(citacion ? aInputFechaHora(new Date(citacion.fecha_hora)) : '');
    setLugar(citacion?.lugar ?? '');
    setGrupoIds([]);
    setGrupoDelEstudiante('');
    setEstudianteId('');
    setTodos(false);
  }, [open, citacion?._id]);

  // Un docente solo cita a todo un grupo si lo dirige; para un estudiante concreto basta con que le dicte clase.
  const esDocente = user?.rol === 'DOCENTE';
  const gruposParaGeneral = useMemo(() => (grupos.data ?? []).filter((g) => !esDocente || g.es_director), [grupos.data, esDocente]);
  const etiquetaGrupo = (g: { grado: string; nomenclatura: string }) => `${g.grado} ${g.nomenclatura}`.trim();

  const minimo = aInputFechaHora(new Date());
  const objetivoListo = editando || (tipo === 'GENERAL' ? grupoIds.length > 0 : Boolean(estudianteFijo) || estudianteId !== '');
  const listo = titulo.trim().length >= 3 && lugar.trim().length >= 2 && fechaHora !== '' && objetivoListo;
  const guardando = crear.isPending || actualizar.isPending;
  const error = crear.error ?? actualizar.error;

  async function enviar(e: FormEvent) {
    e.preventDefault();
    if (!listo) return;
    const fecha = new Date(fechaHora).toISOString();
    if (citacion) {
      const cambios: CambiosCitacion = { motivo, titulo: titulo.trim(), descripcion: descripcion.trim(), lugar: lugar.trim() };
      if (fecha !== new Date(citacion.fecha_hora).toISOString()) cambios.fecha_hora = fecha;
      const res = await actualizar.mutateAsync({ id: citacion._id, cambios });
      onGuardada(res._id);
      return;
    }
    const res = await crear.mutateAsync({
      tipo,
      motivo,
      titulo: titulo.trim(),
      descripcion: descripcion.trim() || undefined,
      fecha_hora: fecha,
      lugar: lugar.trim(),
      ...(tipo === 'GENERAL' ? { grupo_ids: grupoIds } : { student_id: estudianteFijo?.id ?? estudianteId, todos_los_acudientes: todos, ...(estudianteFijo && casoId ? { caso_id: casoId } : {}) }),
    });
    onGuardada(res._id);
  }

  return (
    <Drawer
      open={open}
      title={editando ? 'Editar citación' : 'Nueva citación'}
      subtitle="Los acudientes reciben un correo con la fecha, la hora, quién convoca y un botón para confirmar su asistencia."
      onClose={onClose}
      onSubmit={enviar}
      submitLabel={editando ? 'Guardar cambios' : 'Citar'}
      isSubmitting={guardando}
      submitDisabled={!listo}
    >
      {error && <Alert tone="error">{errorMessage(error)}</Alert>}
      {editando && <Alert tone="info">Si cambias la fecha, la hora o el lugar, los acudientes reciben un correo nuevo y deben confirmar de nuevo. Los grupos y estudiantes no se cambian: cancela y crea otra.</Alert>}

      {!editando && !soloParticular && (
        <Select label="Tipo de citación" value={tipo} onChange={(e) => { setTipo(e.target.value as TipoCitacion); setGrupoIds([]); setEstudianteId(''); }}>
          {TIPOS_CITACION.map((t) => (
            <option key={t} value={t}>
              {NOMBRES_TIPO_CITACION[t]}
            </option>
          ))}
        </Select>
      )}

      {!editando && tipo === 'GENERAL' && (
        <>
          <MultiSelect
            label="Grupos convocados"
            options={gruposParaGeneral.map((g) => ({ value: g._id, label: etiquetaGrupo(g) }))}
            selected={grupoIds}
            onChange={setGrupoIds}
            emptyLabel="Elige uno o más grupos"
          />
          {esDocente && gruposParaGeneral.length === 0 && !grupos.isLoading && <Alert tone="warning">Solo puedes citar a todo un grupo si eres su director. Para un estudiante concreto usa la citación particular.</Alert>}
          <p className="text-xs text-muted">Los grupos deben ser de una misma sede, porque la reunión tiene un solo lugar.</p>
        </>
      )}

      {!editando && tipo === 'PARTICULAR' && estudianteFijo && (
        <>
          <Input label="Estudiante" value={estudianteFijo.nombre} disabled readOnly />
          <Switch checked={todos} onChange={setTodos} label="Citar a todos los acudientes" description="Si está apagado, se cita solo al acudiente principal (responsable legal)." />
        </>
      )}

      {!editando && tipo === 'PARTICULAR' && !estudianteFijo && (
        <>
          <Select label="Grupo del estudiante" value={grupoDelEstudiante} onChange={(e) => { setGrupoDelEstudiante(e.target.value); setEstudianteId(''); }}>
            <option value="">{grupos.isLoading ? 'Cargando…' : 'Elige un grupo'}</option>
            {(grupos.data ?? []).map((g) => (
              <option key={g._id} value={g._id}>
                {etiquetaGrupo(g)}
              </option>
            ))}
          </Select>
          <SelectBuscable
            label="Estudiante"
            required
            value={estudianteId}
            onChange={setEstudianteId}
            placeholder={grupoDelEstudiante ? (estudiantes.isLoading ? 'Cargando…' : 'Busca por nombre o documento') : 'Elige primero el grupo'}
            opciones={opcionesDePersonas((estudiantes.data ?? []).map((s) => ({ _id: s.student_id, nombre: s.nombre, apellido: s.apellido, numero_documento: s.numero_documento })))}
          />
          <Switch checked={todos} onChange={setTodos} label="Citar a todos los acudientes" description="Si está apagado, se cita solo al acudiente principal (responsable legal)." />
        </>
      )}

      <Select label="Motivo" value={motivo} onChange={(e) => setMotivo(e.target.value as MotivoCitacion)}>
        {MOTIVOS_CITACION.map((m) => (
          <option key={m} value={m}>
            {NOMBRES_MOTIVO_CITACION[m]}
          </option>
        ))}
      </Select>
      <Input
        label="Título"
        required
        maxLength={MAX_TITULO_CITACION}
        value={titulo}
        onChange={(e) => setTitulo(e.target.value)}
        placeholder="Entrega de boletines del segundo periodo"
        hint={tipo === 'PARTICULAR' ? 'El título viaja por correo: no escribas hechos, diagnósticos ni nombres de otros menores.' : undefined}
      />
      <Input label="Fecha y hora" type="datetime-local" required value={fechaHora} min={minimo} onChange={(e) => setFechaHora(e.target.value)} />
      <Input label="Lugar" required maxLength={MAX_LUGAR_CITACION} value={lugar} onChange={(e) => setLugar(e.target.value)} placeholder="Salón 601 o Coliseo" />
      <Textarea
        label="Descripción (opcional)"
        rows={3}
        maxLength={MAX_DESCRIPCION_CITACION}
        value={descripcion}
        onChange={(e) => setDescripcion(e.target.value)}
        hint={tipo === 'PARTICULAR' ? 'En una citación particular la descripción solo la ve el acudiente dentro del portal: no viaja por correo.' : 'Por ejemplo, qué debe traer el acudiente.'}
      />
    </Drawer>
  );
}
