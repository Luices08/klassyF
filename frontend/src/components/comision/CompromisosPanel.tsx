import { useState } from 'react';
import {
  type EstadoCompromiso,
  NOMBRES_RESPONSABLE,
  type ResponsableCompromiso,
  type Sesion,
  useActualizarCompromiso,
  useAgregarCompromiso,
} from '../../hooks/useComision';
import { aInputFecha, formatoFechaCalendario } from '../../lib/fechas';
import { Alert, errorMessage } from '../ui/Alert';
import { Chip, type Tone } from '../ui/Badge';
import { Button } from '../ui/Button';
import { Card, CardHeader } from '../ui/Card';
import { Input, Select } from '../ui/Field';

const TONO: Record<EstadoCompromiso, Tone> = { PENDIENTE: 'orange', CUMPLIDO: 'green', INCUMPLIDO: 'red' };
const NOMBRE: Record<EstadoCompromiso, string> = { PENDIENTE: 'Pendiente', CUMPLIDO: 'Cumplido', INCUMPLIDO: 'Incumplido' };

/** Compromisos con responsable y fecha límite. Se pueden agregar hasta con la sesión realizada; su seguimiento sigue aun con el acta firmada. */
export function CompromisosPanel({ sesion, puedeAgregar, puedeSeguir }: { sesion: Sesion; puedeAgregar: boolean; puedeSeguir: boolean }) {
  const agregar = useAgregarCompromiso();
  const seguir = useActualizarCompromiso();
  const estudiantesDeCasos = [...new Set(sesion.casos.map((c) => c.student_id))];
  const [estudiante, setEstudiante] = useState('');
  const [tipo, setTipo] = useState<ResponsableCompromiso>('ACUDIENTE');
  const [quien, setQuien] = useState('');
  const [descripcion, setDescripcion] = useState('');
  const [limite, setLimite] = useState(aInputFecha(new Date(Date.now() + 30 * 86_400_000).toISOString()));
  const [nota, setNota] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);

  const nombreDe = (id: string) => (sesion.estudiantes[id] ? `${sesion.estudiantes[id]!.apellido} ${sesion.estudiantes[id]!.nombre}` : 'Estudiante');

  async function crear() {
    setError(null);
    try {
      await agregar.mutateAsync({ sesionId: sesion._id, student_id: estudiante, responsable_tipo: tipo, responsable_nombre: quien, descripcion, fecha_limite: limite });
      setDescripcion('');
      setQuien('');
    } catch (err) {
      setError(errorMessage(err));
    }
  }

  return (
    <Card>
      <CardHeader title="Compromisos" subtitle="Lo que se acordó con el estudiante, la familia, el docente o la institución. Los avisos de vencimiento llegarán con el módulo de notificaciones." />
      {sesion.compromisos.length === 0 && <p className="text-sm text-muted">Aún no hay compromisos.</p>}
      <div className="space-y-3">
        {sesion.compromisos.map((k) => (
          <div key={k._id} className="rounded-lg border border-border p-3">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div>
                <p className="text-sm font-semibold text-ink">{nombreDe(k.student_id)}</p>
                <p className="text-sm">{k.descripcion}</p>
                <p className="text-xs text-muted">
                  Responde {k.responsable_nombre} ({NOMBRES_RESPONSABLE[k.responsable_tipo].toLowerCase()}) · hasta el {formatoFechaCalendario(k.fecha_limite)}
                </p>
              </div>
              <Chip tone={TONO[k.estado]}>{NOMBRE[k.estado]}</Chip>
            </div>
            {k.seguimientos.length > 0 && (
              <ul className="mt-2 space-y-0.5 text-xs text-muted">
                {k.seguimientos.map((s, i) => (
                  <li key={i}>
                    {formatoFechaCalendario(s.fecha)}: {s.texto}
                  </li>
                ))}
              </ul>
            )}
            {puedeSeguir && sesion.estado !== 'ANULADA' && (
              <div className="mt-3 grid grid-cols-1 items-end gap-2 sm:grid-cols-[1fr_auto_auto_auto]">
                <Input label="Seguimiento" hideLabel placeholder="Anotar un seguimiento…" value={nota[k._id] ?? ''} onChange={(e) => setNota((p) => ({ ...p, [k._id]: e.target.value }))} />
                <Button type="button" variant="secondary" disabled={!(nota[k._id] ?? '').trim()} onClick={() => void seguir.mutateAsync({ sesionId: sesion._id, compromisoId: k._id, seguimiento: nota[k._id] }).then(() => setNota((p) => ({ ...p, [k._id]: '' })))}>
                  Anotar
                </Button>
                <Button type="button" variant="soft-success" disabled={k.estado === 'CUMPLIDO'} onClick={() => void seguir.mutateAsync({ sesionId: sesion._id, compromisoId: k._id, estado: 'CUMPLIDO' })}>
                  Cumplido
                </Button>
                <Button type="button" variant="soft-danger" disabled={k.estado === 'INCUMPLIDO'} onClick={() => void seguir.mutateAsync({ sesionId: sesion._id, compromisoId: k._id, estado: 'INCUMPLIDO' })}>
                  Incumplido
                </Button>
              </div>
            )}
          </div>
        ))}
      </div>
      {seguir.isError && <div className="mt-3"><Alert tone="error">{errorMessage(seguir.error)}</Alert></div>}

      {puedeAgregar && estudiantesDeCasos.length > 0 && (
        <div className="mt-5 space-y-3 border-t border-border pt-4">
          <p className="text-label text-body">Nuevo compromiso</p>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-4">
            <Select label="Estudiante" value={estudiante} onChange={(e) => setEstudiante(e.target.value)}>
              <option value="">Elige</option>
              {estudiantesDeCasos.map((id) => (
                <option key={id} value={id}>
                  {nombreDe(id)}
                </option>
              ))}
            </Select>
            <Select label="Responde" value={tipo} onChange={(e) => setTipo(e.target.value as ResponsableCompromiso)}>
              {(Object.keys(NOMBRES_RESPONSABLE) as ResponsableCompromiso[]).map((t) => (
                <option key={t} value={t}>
                  {NOMBRES_RESPONSABLE[t]}
                </option>
              ))}
            </Select>
            <Input label="Nombre de quien responde" value={quien} maxLength={120} onChange={(e) => setQuien(e.target.value)} />
            <Input label="Fecha límite" type="date" value={limite} onChange={(e) => setLimite(e.target.value)} />
          </div>
          <Input label="Compromiso" value={descripcion} maxLength={1000} onChange={(e) => setDescripcion(e.target.value)} hint="Mínimo 5 caracteres." />
          {error && <Alert tone="error">{error}</Alert>}
          <div className="flex justify-end">
            <Button type="button" onClick={() => void crear()} isLoading={agregar.isPending} disabled={!estudiante || !quien.trim() || descripcion.trim().length < 5}>
              Agregar compromiso
            </Button>
          </div>
        </div>
      )}
    </Card>
  );
}
