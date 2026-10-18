import { useEffect, useState } from 'react';
import { Alert, errorMessage } from '../ui/Alert';
import { Chip, type Tone } from '../ui/Badge';
import { Card, CardHeader } from '../ui/Card';
import { Input, Select } from '../ui/Field';
import { Switch } from '../ui/Switch';
import { type CasoSimulado, NOMBRES_RESULTADO, type PoliticaPromocion, type ResultadoPromocion, useSimularCaso } from '../../hooks/usePromocion';

const TONO: Record<ResultadoPromocion, Tone> = {
  PROMOVIDO: 'green',
  PROMOVIDO_POR_RECUPERACION: 'green',
  PROMOVIDO_CON_ARRASTRE: 'green',
  PENDIENTE_RECUPERACION: 'orange',
  EN_COMISION: 'blue',
  NO_PROMOVIDO: 'red',
  RETIRO_PROPUESTO: 'red',
  INCOMPLETO: 'neutral',
};

const num = (v: string, max: number): number => Math.min(max, Math.max(0, Number(v) || 0));

/** «Pruébalo»: un estudiante inventado frente a la política que se está editando (sin guardarla). El resultado lo calcula el motor real. */
export function SimuladorCaso({ academicYearId, politica }: { academicYearId: string; politica: PoliticaPromocion }) {
  const simular = useSimularCaso(academicYearId);
  const [caso, setCaso] = useState<CasoSimulado>({ perdidas_asignaturas: 3, perdidas_areas: 0, incluye_imprescindible: false, inasistencia_pct: 0, tiene_piar: false, momento: 'CIERRE' });
  const conAreas = politica.unidad !== 'ASIGNATURA';
  const conAsignaturas = politica.unidad !== 'AREA';
  const hayImprescindibles = (conAsignaturas && politica.asignaturas_criticas_ids.length > 0) || (conAreas && politica.areas_criticas_ids.length > 0);

  const { mutate } = simular;
  const clave = JSON.stringify([politica, caso]);
  useEffect(() => {
    const t = setTimeout(() => mutate({ politica, caso }), 400);
    return () => clearTimeout(t);
  }, [clave, mutate]);

  const r = simular.data;
  return (
    <Card>
      <CardHeader title="Pruébalo" subtitle="Inventa un estudiante y mira qué le pasaría con las reglas de arriba." />
      <div className="space-y-3">
        <div className="grid grid-cols-2 gap-3">
          {conAsignaturas && (
            <Input label="Materias perdidas" type="number" min={0} max={30} value={caso.perdidas_asignaturas} onChange={(e) => setCaso({ ...caso, perdidas_asignaturas: num(e.target.value, 30) })} />
          )}
          {conAreas && <Input label="Áreas perdidas" type="number" min={0} max={30} value={caso.perdidas_areas} onChange={(e) => setCaso({ ...caso, perdidas_areas: num(e.target.value, 30) })} />}
          <Input label="Inasistencia (%)" type="number" min={0} max={100} value={caso.inasistencia_pct} onChange={(e) => setCaso({ ...caso, inasistencia_pct: num(e.target.value, 100) })} />
          <Select label="Momento" value={caso.momento} onChange={(e) => setCaso({ ...caso, momento: e.target.value as CasoSimulado['momento'] })}>
            <option value="CIERRE">Al cerrar el año</option>
            <option value="TRAS_RECUPERACION">Tras la recuperación</option>
          </Select>
        </div>
        {hayImprescindibles && <Switch label="Entre lo perdido hay una imprescindible" checked={caso.incluye_imprescindible} onChange={(v) => setCaso({ ...caso, incluye_imprescindible: v })} />}
        <Switch label="Tiene PIAR vigente" checked={caso.tiene_piar} onChange={(v) => setCaso({ ...caso, tiene_piar: v })} />

        {simular.isError && <Alert tone="error">{errorMessage(simular.error)}</Alert>}
        {r && !simular.isError && (
          <div className="space-y-2 rounded-lg bg-soft p-3" aria-live="polite">
            <Chip tone={TONO[r.resultado]}>{NOMBRES_RESULTADO[r.resultado]}</Chip>
            <ul className="list-disc space-y-1 pl-5 text-sm text-body">
              {r.motivos.map((m) => (
                <li key={m}>{m}</li>
              ))}
            </ul>
            {r.no_renueva_cupo && <p className="text-xs text-muted">Además, no se le renueva el cupo.</p>}
          </div>
        )}
      </div>
    </Card>
  );
}
