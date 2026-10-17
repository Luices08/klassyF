import { type FormEvent, useState } from 'react';
import { type ConfiguracionComision, useActualizarConfiguracionComision, useConfiguracionComision } from '../../hooks/useComision';
import { Alert, errorMessage } from '../ui/Alert';
import { Button } from '../ui/Button';
import { Card, CardHeader } from '../ui/Card';
import { Input, Select } from '../ui/Field';
import { Spinner } from '../ui/Spinner';

/** Umbrales del tablero y reglas de las sesiones (quórum, mayoría, firmas): del colegio. Solo el ADMIN los cambia; lo ya firmado no cambia. */
export function ConfiguracionComisionCard({ puedeEditar }: { puedeEditar: boolean }) {
  const { data, isLoading, isError, error } = useConfiguracionComision();
  if (isLoading) return <Spinner />;
  if (isError || !data) return <Alert tone="error">{errorMessage(error)}</Alert>;
  return <Formulario key={JSON.stringify(data)} configuracion={data} puedeEditar={puedeEditar} />;
}

function Formulario({ configuracion, puedeEditar }: { configuracion: ConfiguracionComision; puedeEditar: boolean }) {
  const actualizar = useActualizarConfiguracionComision();
  const [c, setC] = useState<ConfiguracionComision>(() => structuredClone(configuracion));
  const [mensaje, setMensaje] = useState<{ tone: 'success' | 'error'; texto: string } | null>(null);
  const bloqueado = !puedeEditar;
  const s = c.semaforo;
  const num = (v: string) => Number(v);

  async function guardar(e: FormEvent) {
    e.preventDefault();
    setMensaje(null);
    try {
      await actualizar.mutateAsync(c);
      setMensaje({ tone: 'success', texto: 'Configuración guardada.' });
    } catch (err) {
      setMensaje({ tone: 'error', texto: errorMessage(err) });
    }
  }

  return (
    <form onSubmit={(e) => void guardar(e)} className="space-y-4">
      {mensaje && <Alert tone={mensaje.tone}>{mensaje.texto}</Alert>}
      <Card>
        <CardHeader title="Semáforo de riesgo" subtitle="Cuántas asignaturas perdidas pasan a cada nivel (deben crecer) y la inasistencia que manda a rojo." />
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-5">
          <Input label="Amarillo desde" type="number" min={1} value={s.amarillo_desde} disabled={bloqueado} onChange={(e) => setC({ ...c, semaforo: { ...s, amarillo_desde: num(e.target.value) } })} />
          <Input label="Naranja desde" type="number" min={1} value={s.naranja_desde} disabled={bloqueado} onChange={(e) => setC({ ...c, semaforo: { ...s, naranja_desde: num(e.target.value) } })} />
          <Input label="Rojo desde" type="number" min={1} value={s.rojo_desde} disabled={bloqueado} onChange={(e) => setC({ ...c, semaforo: { ...s, rojo_desde: num(e.target.value) } })} />
          <Input label="Inasistencia roja (%)" type="number" min={1} max={100} value={s.inasistencia_roja_pct} disabled={bloqueado} onChange={(e) => setC({ ...c, semaforo: { ...s, inasistencia_roja_pct: num(e.target.value) } })} />
          <Select label="Faltas que cuentan" value={s.faltas} disabled={bloqueado} onChange={(e) => setC({ ...c, semaforo: { ...s, faltas: e.target.value as typeof s.faltas } })}>
            <option value="SOLO_INJUSTIFICADAS">Solo injustificadas</option>
            <option value="TODAS">Todas</option>
          </Select>
        </div>
      </Card>
      <Card>
        <CardHeader title="Reprobación masiva" subtitle="Alerta cuando más de este porcentaje de un grupo pierde una asignatura (con un mínimo de evaluados para no alertar por ruido)." />
        <div className="grid grid-cols-2 gap-4">
          <Input label="Porcentaje" type="number" min={1} max={100} value={c.reprobacion_masiva.porcentaje} disabled={bloqueado} onChange={(e) => setC({ ...c, reprobacion_masiva: { ...c.reprobacion_masiva, porcentaje: num(e.target.value) } })} />
          <Input label="Mínimo de estudiantes evaluados" type="number" min={1} value={c.reprobacion_masiva.minimo_estudiantes} disabled={bloqueado} onChange={(e) => setC({ ...c, reprobacion_masiva: { ...c.reprobacion_masiva, minimo_estudiantes: num(e.target.value) } })} />
        </div>
      </Card>
      <Card>
        <CardHeader title="Sesiones y actas" subtitle="Quórum, mayoría y quién firma el acta." />
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <Input label="Quórum (%)" type="number" min={1} max={100} value={c.quorum_porcentaje} disabled={bloqueado} onChange={(e) => setC({ ...c, quorum_porcentaje: num(e.target.value) })} />
          <Select label="Mayoría" value={c.mayoria} disabled={bloqueado} onChange={(e) => setC({ ...c, mayoria: e.target.value as ConfiguracionComision['mayoria'] })}>
            <option value="SIMPLE">Simple: más votos a favor que en contra</option>
            <option value="ABSOLUTA">Absoluta: más de la mitad de quienes pueden votar</option>
          </Select>
          <Select label="Firman el acta" value={c.firmas_requeridas} disabled={bloqueado} onChange={(e) => setC({ ...c, firmas_requeridas: e.target.value as ConfiguracionComision['firmas_requeridas'] })}>
            <option value="TODOS_LOS_ASISTENTES">Todos los asistentes con usuario</option>
            <option value="SOLO_PRESIDENTE">Solo quien preside</option>
          </Select>
        </div>
      </Card>
      {puedeEditar ? (
        <div className="flex justify-end">
          <Button type="submit" isLoading={actualizar.isPending}>
            Guardar
          </Button>
        </div>
      ) : (
        <Alert tone="info">Solo el administrador cambia estos valores.</Alert>
      )}
    </form>
  );
}
