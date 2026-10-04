import { type FormEvent, useState } from 'react';
import { Alert } from '../ui/Alert';
import { Button } from '../ui/Button';
import { Input, Select, Textarea } from '../ui/Field';
import { TIPOS_NECESIDAD_PLAN_APOYO, useGuardarSeccion, type Expediente, type PlanApoyo } from '../../hooks/useInclusion';
import { PieGuardar, Seccion } from './campos';

/**
 * Plan de apoyo pedagógico (dificultades de aprendizaje). Es un plan interno y liviano: no es el PIAR, no lleva anexos del MEN ni
 * categoría de discapacidad. Aun así el rótulo de la necesidad es dato de salud: solo orientación y administración lo ven.
 */
export function PlanApoyoForm({ exp }: { exp: Expediente }) {
  const guardar = useGuardarSeccion(exp._id);
  const soloLectura = !exp.permisos.gestiona || !exp.editable || !exp.consentimiento?.otorgado;
  const [plan, setPlan] = useState<PlanApoyo>(exp.plan_apoyo as PlanApoyo);
  const [nueva, setNueva] = useState('');

  const enviar = async (e: FormEvent) => {
    e.preventDefault();
    await guardar.mutateAsync({ seccion: 'plan-apoyo', cuerpo: plan });
  };

  return (
    <form onSubmit={enviar} className="space-y-6">
      {!exp.consentimiento?.otorgado && <Alert tone="warning">Registra la autorización del responsable legal (pestaña Resumen) para diligenciar el plan.</Alert>}
      <Seccion titulo="Identificación de la necesidad">
        <Select label="Necesidad identificada" disabled={soloLectura} value={plan.tipo_necesidad ?? ''} onChange={(e) => setPlan((p) => ({ ...p, tipo_necesidad: e.target.value || null }))}>
          <option value="">Sin definir</option>
          {TIPOS_NECESIDAD_PLAN_APOYO.map((t) => (
            <option key={t.codigo} value={t.codigo}>
              {t.nombre}
            </option>
          ))}
        </Select>
        <Textarea label="Observación inicial / motivo de acompañamiento" disabled={soloLectura} value={plan.observacion_inicial} onChange={(e) => setPlan((p) => ({ ...p, observacion_inicial: e.target.value }))} maxLength={4000} />
      </Seccion>
      <Seccion titulo="Estrategias para el aula">
        <ul className="space-y-1">
          {plan.pautas_aula.map((p, i) => (
            <li key={i} className="flex items-center justify-between gap-2 rounded-lg bg-soft px-3 py-2 text-sm">
              <span>{p}</span>
              {!soloLectura && (
                <button type="button" className="text-xs font-semibold text-danger" onClick={() => setPlan((x) => ({ ...x, pautas_aula: x.pautas_aula.filter((_, j) => j !== i) }))}>
                  Quitar
                </button>
              )}
            </li>
          ))}
        </ul>
        {!soloLectura && (
          <div className="flex gap-2">
            <div className="flex-1">
              <Input label="Nueva pauta de manejo en clase" value={nueva} onChange={(e) => setNueva(e.target.value)} placeholder="Ej.: fragmentar las actividades largas en metas cortas" />
            </div>
            <Button
              type="button"
              variant="outline"
              className="self-end"
              disabled={nueva.trim().length < 2}
              onClick={() => {
                setPlan((x) => ({ ...x, pautas_aula: [...x.pautas_aula, nueva.trim()] }));
                setNueva('');
              }}
            >
              Agregar
            </Button>
          </div>
        )}
        <Textarea label="Pautas de evaluación en el aula" disabled={soloLectura} value={plan.pautas_evaluacion} onChange={(e) => setPlan((p) => ({ ...p, pautas_evaluacion: e.target.value }))} maxLength={4000} />
      </Seccion>
      <Seccion titulo="Acuerdos básicos con la familia">
        <Textarea label="Compromiso familiar en casa" disabled={soloLectura} value={plan.compromisos_casa} onChange={(e) => setPlan((p) => ({ ...p, compromisos_casa: e.target.value }))} maxLength={4000} />
      </Seccion>
      <PieGuardar mutacion={guardar} soloLectura={soloLectura} />
    </form>
  );
}
