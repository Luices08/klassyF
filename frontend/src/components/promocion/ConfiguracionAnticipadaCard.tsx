import { type FormEvent, useState } from 'react';
import { Alert, errorMessage } from '../ui/Alert';
import { Button } from '../ui/Button';
import { Card, CardHeader } from '../ui/Card';
import { Input, Select } from '../ui/Field';
import { Spinner } from '../ui/Spinner';
import { Switch } from '../ui/Switch';
import {
  type ConfiguracionAnticipada,
  type CriterioNotas,
  NOMBRES_TRATAMIENTO,
  type TratamientoNotas,
  useActualizarConfiguracionAnticipada,
  useConfiguracionAnticipada,
} from '../../hooks/usePromocionAnticipada';

/** Criterios, pasos exigidos y trato de las notas de la promoción anticipada: del colegio, no del código. Solo el ADMIN los cambia. */
export function ConfiguracionAnticipadaCard({ puedeEditar }: { puedeEditar: boolean }) {
  const { data, isLoading, isError, error } = useConfiguracionAnticipada();
  if (isLoading) return <Spinner />;
  if (isError || !data) return <Alert tone="error">{errorMessage(error)}</Alert>;
  return <Formulario key={JSON.stringify(data)} configuracion={data} puedeEditar={puedeEditar} />;
}

function Criterio({ titulo, valor, onChange, bloqueado }: { titulo: string; valor: CriterioNotas; onChange: (c: CriterioNotas) => void; bloqueado: boolean }) {
  return (
    <div className="space-y-3 rounded-lg border border-border p-4">
      <Switch label={titulo} checked={valor.activo} disabled={bloqueado} onChange={(activo) => onChange({ ...valor, activo })} />
      {valor.activo && (
        <div className="grid grid-cols-2 gap-3">
          <Input label="Promedio mínimo" type="number" step="any" min={0} value={valor.promedio_minimo} disabled={bloqueado} onChange={(e) => onChange({ ...valor, promedio_minimo: Number(e.target.value) })} />
          <Input
            label="Nota mínima por asignatura"
            type="number"
            step="any"
            min={0}
            value={valor.nota_minima_asignatura ?? ''}
            hint="Vacío = no se exige"
            disabled={bloqueado}
            onChange={(e) => onChange({ ...valor, nota_minima_asignatura: e.target.value === '' ? null : Number(e.target.value) })}
          />
        </div>
      )}
    </div>
  );
}

function Formulario({ configuracion, puedeEditar }: { configuracion: ConfiguracionAnticipada; puedeEditar: boolean }) {
  const actualizar = useActualizarConfiguracionAnticipada();
  const [c, setC] = useState<ConfiguracionAnticipada>(() => structuredClone(configuracion));
  const [mensaje, setMensaje] = useState<{ tone: 'success' | 'error'; texto: string } | null>(null);
  const bloqueado = !puedeEditar;

  async function guardar(e: FormEvent) {
    e.preventDefault();
    setMensaje(null);
    try {
      await actualizar.mutateAsync(c);
      setMensaje({ tone: 'success', texto: 'Criterios guardados. Los trámites en curso conservan los que regían cuando se abrieron.' });
    } catch (err) {
      setMensaje({ tone: 'error', texto: errorMessage(err) });
    }
  }

  return (
    <form onSubmit={(e) => void guardar(e)} className="space-y-4">
      {mensaje && <Alert tone={mensaje.tone}>{mensaje.texto}</Alert>}
      <Card>
        <CardHeader title="Cuándo se puede" subtitle="Por norma se decide durante el primer periodo; cada colegio fija qué periodo se evalúa y hasta cuándo se acepta la solicitud." />
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <Switch label="El colegio aplica la promoción anticipada" checked={c.activa} disabled={bloqueado} onChange={(activa) => setC({ ...c, activa })} />
          <Input label="Periodo cuyas notas se evalúan" type="number" min={1} max={12} value={c.periodo_evaluacion} disabled={bloqueado} onChange={(e) => setC({ ...c, periodo_evaluacion: Number(e.target.value) })} />
          <Input label="Días para solicitar tras cerrar ese periodo" type="number" min={0} max={365} value={c.dias_ventana_tras_cierre} disabled={bloqueado} onChange={(e) => setC({ ...c, dias_ventana_tras_cierre: Number(e.target.value) })} />
        </div>
      </Card>

      <Card>
        <CardHeader title="Criterio de notas" subtitle="Se mide con las notas cerradas del periodo de evaluación (promedio simple de las asignaturas)." />
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Criterio titulo="Rendimiento excepcional" valor={c.rendimiento_excepcional} bloqueado={bloqueado} onChange={(rendimiento_excepcional) => setC({ ...c, rendimiento_excepcional })} />
          <Criterio titulo="Reiniciantes" valor={c.reiniciantes} bloqueado={bloqueado} onChange={(reiniciantes) => setC({ ...c, reiniciantes })} />
        </div>
      </Card>

      <Card>
        <CardHeader title="Pasos que se exigen" subtitle="La norma pide concepto de la comisión, consentimiento de los padres y decisión del Consejo Directivo; el colegio puede apagar alguno si su SIEE lo permite." />
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <Switch label="Concepto de la comisión" checked={c.exige.concepto_comision} disabled={bloqueado} onChange={(v) => setC({ ...c, exige: { ...c.exige, concepto_comision: v } })} />
          <Switch label="Consentimiento de la familia" checked={c.exige.consentimiento_familia} disabled={bloqueado} onChange={(v) => setC({ ...c, exige: { ...c.exige, consentimiento_familia: v } })} />
          <Switch label="Decisión del Consejo Directivo" checked={c.exige.decision_consejo_directivo} disabled={bloqueado} onChange={(v) => setC({ ...c, exige: { ...c.exige, decision_consejo_directivo: v } })} />
        </div>
      </Card>

      <Card>
        <CardHeader title="Notas de los periodos que no cursó" subtitle="Qué pasa con los periodos anteriores al cambio de grado." />
        <Select label="Tratamiento" value={c.tratamiento_notas} disabled={bloqueado} onChange={(e) => setC({ ...c, tratamiento_notas: e.target.value as TratamientoNotas })}>
          {(Object.keys(NOMBRES_TRATAMIENTO) as TratamientoNotas[]).map((t) => (
            <option key={t} value={t}>
              {NOMBRES_TRATAMIENTO[t]}
            </option>
          ))}
        </Select>
      </Card>

      {puedeEditar ? (
        <div className="flex justify-end">
          <Button type="submit" isLoading={actualizar.isPending}>
            Guardar
          </Button>
        </div>
      ) : (
        <Alert tone="info">Solo el administrador cambia estos criterios.</Alert>
      )}
    </form>
  );
}
