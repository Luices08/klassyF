import { type FormEvent, useEffect, useState } from 'react';
import { useAnioDeTrabajo } from '../../hooks/useAniosLectivos';
import {
  MAX_LONGITUD_MOTIVO_SALIDA,
  MAX_LONGITUD_OBSERVACION_SALIDA,
  MIN_LONGITUD_MOTIVO_SALIDA,
  NOMBRES_TIPO_SALIDA,
  TIPOS_SALIDA,
  type TipoSalida,
  useMatriculasParaSalida,
  useRegistrarSalida,
} from '../../hooks/useSalidas';
import { opcionesDePersonas } from '../../lib/opcionesBuscables';
import { Alert, errorMessage } from '../ui/Alert';
import { Drawer } from '../ui/Drawer';
import { Input, Select, Textarea } from '../ui/Field';
import { SelectBuscable } from '../ui/SelectBuscable';

const hoy = () => new Date(Date.now() - 5 * 60 * 60 * 1000).toISOString().slice(0, 10);

interface Props {
  open: boolean;
  /** Si se da, la matrícula ya está elegida (se abrió desde su expediente); si no, se elige entre las activas del año. */
  matriculaId?: string;
  /** Texto con el estudiante cuando la matrícula viene fija. */
  descripcionMatricula?: string;
  onClose: () => void;
  onRegistrado: (enrollmentId: string) => void;
}

/**
 * Registro de la salida de un estudiante durante el año (M04): retiro o traslado a otra institución, con fecha efectiva, motivo y,
 * si aplica, la institución receptora. El soporte documental se carga después, en el detalle de la salida.
 */
export function RegistrarSalidaDrawer({ open, matriculaId, descripcionMatricula, onClose, onRegistrado }: Props) {
  const { anio } = useAnioDeTrabajo();
  const matriculas = useMatriculasParaSalida(anio?._id, open && !matriculaId);
  const registrar = useRegistrarSalida();

  const [matricula, setMatricula] = useState('');
  const [tipo, setTipo] = useState<TipoSalida>('RETIRO');
  const [fecha, setFecha] = useState(hoy());
  const [motivo, setMotivo] = useState('');
  const [observaciones, setObservaciones] = useState('');
  const [receptora, setReceptora] = useState('');
  const [dane, setDane] = useState('');
  const [municipio, setMunicipio] = useState('');

  useEffect(() => {
    if (!open) return;
    registrar.reset();
    setMatricula(matriculaId ?? '');
    setTipo('RETIRO');
    setFecha(hoy());
    setMotivo('');
    setObservaciones('');
    setReceptora('');
    setDane('');
    setMunicipio('');
  }, [open, matriculaId]);

  const esTraslado = tipo === 'TRASLADO';
  const listo = matricula !== '' && motivo.trim().length >= MIN_LONGITUD_MOTIVO_SALIDA && (!esTraslado || receptora.trim().length >= 2);

  async function enviar(e: FormEvent) {
    e.preventDefault();
    if (!listo) return;
    const resultado = await registrar.mutateAsync({
      enrollment_id: matricula,
      tipo,
      fecha_efectiva: fecha || undefined,
      motivo: motivo.trim(),
      observaciones: observaciones.trim() || undefined,
      institucion_receptora: esTraslado ? { nombre: receptora.trim(), codigo_dane: dane.trim() || undefined, municipio: municipio.trim() || undefined } : null,
    });
    onRegistrado(resultado.enrollment_id);
  }

  return (
    <Drawer
      open={open}
      title="Registrar retiro o traslado"
      subtitle="El estudiante sale de las listas de asistencia, actividades y notas desde la fecha efectiva; lo registrado antes se conserva."
      onClose={onClose}
      onSubmit={enviar}
      submitLabel="Registrar salida"
      submitVariant="soft-danger"
      isSubmitting={registrar.isPending}
      submitDisabled={!listo}
    >
      {registrar.isError && <Alert tone="error">{errorMessage(registrar.error)}</Alert>}
      <Alert tone="warning">
        No se puede deshacer: la matrícula queda como retirada, se abre el paz y salvo de salida y el cupo se libera según la política del colegio.
      </Alert>

      {matriculaId ? (
        <p className="text-sm text-body">{descripcionMatricula}</p>
      ) : (
        <SelectBuscable
          label="Estudiante"
          required
          value={matricula}
          onChange={setMatricula}
          placeholder={matriculas.isLoading ? 'Cargando…' : 'Busca por nombre o documento'}
          opciones={(matriculas.data ?? []).map((m) => ({ ...opcionesDePersonas([m.estudiante])[0], detalle: `${m.estudiante.numero_documento} · ${m.grupo}` }))}
        />
      )}

      <Select label="Tipo de salida" value={tipo} onChange={(e) => setTipo(e.target.value as TipoSalida)}>
        {TIPOS_SALIDA.map((t) => (
          <option key={t} value={t}>
            {NOMBRES_TIPO_SALIDA[t]}
          </option>
        ))}
      </Select>

      <Input label="Fecha efectiva" type="date" required value={fecha} max={hoy()} onChange={(e) => setFecha(e.target.value)} hint="Desde ese día el estudiante deja de aparecer en las listas del aula. No puede ser futura." />

      <Textarea
        label="Motivo"
        required
        rows={3}
        maxLength={MAX_LONGITUD_MOTIVO_SALIDA}
        value={motivo}
        onChange={(e) => setMotivo(e.target.value)}
        hint={`${motivo.length}/${MAX_LONGITUD_MOTIVO_SALIDA}`}
      />

      {esTraslado && (
        <div className="space-y-3 rounded-xl border border-border p-3">
          <p className="text-label text-ink">Institución receptora</p>
          <Input label="Nombre" required value={receptora} onChange={(e) => setReceptora(e.target.value)} />
          <div className="grid grid-cols-2 gap-3">
            <Input label="Código DANE" value={dane} onChange={(e) => setDane(e.target.value)} />
            <Input label="Municipio" value={municipio} onChange={(e) => setMunicipio(e.target.value)} />
          </div>
        </div>
      )}

      <Textarea label="Observaciones" rows={2} maxLength={MAX_LONGITUD_OBSERVACION_SALIDA} value={observaciones} onChange={(e) => setObservaciones(e.target.value)} />
    </Drawer>
  );
}
