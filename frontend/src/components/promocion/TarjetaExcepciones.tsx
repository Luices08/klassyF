import { Card, CardHeader } from '../ui/Card';
import { Input, Select } from '../ui/Field';
import { MultiSelect } from '../ui/MultiSelect';
import { Switch } from '../ui/Switch';
import { useSubjects } from '../../hooks/useCatalogoAcademico';
import type { CondicionArrastre, ConsecuenciaArrastre, PoliticaPromocion } from '../../hooks/usePromocion';

interface Props {
  valor: PoliticaPromocion;
  onChange: (p: PoliticaPromocion) => void;
  bloqueado: boolean;
  /** Cuántos periodos tiene el año (para elegir el plazo del arrastre). */
  periodos: number;
}

const CONDICIONES: Record<CondicionArrastre, string> = {
  NINGUNA: 'Ninguna condición',
  PLAN_APOYO_PRIMER_PERIODO: 'Presentar y cumplir un plan de apoyo',
  NOTA_MINIMA_PRIMER_PERIODO: 'Sacar una nota mínima',
  NOTA_PARA_APROBAR_ANIO_ANTERIOR: 'Aprobar lo que debe del año anterior',
};
const CONSECUENCIAS: Record<ConsecuenciaArrastre, string> = {
  SOLO_ALERTA: 'Solo se avisa',
  ENVIA_A_COMISION: 'Pasa a la Comisión',
  PIERDE_PROMOCION: 'Pierde la promoción',
};

/** Tarjeta 3: casos especiales. Todo el arrastre vive aquí, completo, en un solo bloque. */
export function TarjetaExcepciones({ valor: b, onChange, bloqueado, periodos }: Props) {
  const asignaturas = useSubjects().data ?? [];
  const opciones = asignaturas.filter((s) => !b.asignaturas_criticas_ids.includes(s._id)).map((s) => ({ value: s._id, label: s.nombre }));
  const a = b.arrastre;
  const cambiarArrastre = (cambios: Partial<PoliticaPromocion['arrastre']>) => onChange({ ...b, arrastre: { ...a, ...cambios } });

  return (
    <Card>
      <CardHeader title="3. Casos especiales" subtitle="Estudiantes con PIAR y pasar de grado debiendo materias." />
      <div className="space-y-5">
        <Switch
          label="Estudiantes con PIAR"
          description="Si un estudiante con PIAR vigente reprueba, no se le aplica la regla automática: la Comisión decide en acta según sus ajustes razonables. El sistema solo sabe que tiene un PIAR, nunca su categoría."
          checked={b.piar.derivar_a_comision}
          disabled={bloqueado}
          onChange={(v) => onChange({ ...b, piar: { derivar_a_comision: v } })}
        />

        <div className="space-y-3">
          <Switch
            label="Pasar de grado debiendo asignaturas (Arrastre)"
            description="Si tras las nivelaciones de fin de año el estudiante sigue debiendo alguna de estas asignaturas permitidas, es promovido con el compromiso de ponerse al día en el siguiente año."
            checked={a.admite}
            disabled={bloqueado}
            onChange={(v) => cambiarArrastre({ admite: v })}
          />
          {a.admite && (
            <div className="space-y-4 rounded-lg bg-soft p-4">
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <Input label="Puede deber hasta (asignaturas)" type="number" min={1} max={20} value={a.max_unidades} disabled={bloqueado} onChange={(e) => cambiarArrastre({ max_unidades: Number(e.target.value) })} />
                <MultiSelect
                  label="Solo de estas asignaturas permitidas (p. ej. Educación Física, Artística)"
                  options={opciones}
                  selected={b.asignaturas_arrastrables_ids}
                  onChange={(v) => !bloqueado && onChange({ ...b, asignaturas_arrastrables_ids: v })}
                  emptyLabel="Elige al menos una"
                />
              </div>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <Select label="Para quedar al día debe" value={a.condicion} disabled={bloqueado} onChange={(e) => cambiarArrastre({ condicion: e.target.value as CondicionArrastre })}>
                  {(Object.keys(CONDICIONES) as CondicionArrastre[]).map((c) => (
                    <option key={c} value={c}>
                      {CONDICIONES[c]}
                    </option>
                  ))}
                </Select>
                {a.condicion === 'NOTA_MINIMA_PRIMER_PERIODO' ? (
                  <Input label="Nota mínima que debe sacar" type="number" step="any" min={0} value={a.nota_minima ?? ''} disabled={bloqueado} onChange={(e) => cambiarArrastre({ nota_minima: e.target.value === '' ? null : Number(e.target.value) })} />
                ) : (
                  <div />
                )}
                <Select label="Antes de terminar el periodo" value={String(a.hasta_periodo)} disabled={bloqueado} onChange={(e) => cambiarArrastre({ hasta_periodo: Number(e.target.value) })}>
                  {Array.from({ length: Math.max(periodos, 1) }, (_, i) => i + 1).map((n) => (
                    <option key={n} value={n}>
                      Periodo {n} del año siguiente
                    </option>
                  ))}
                </Select>
                <Select label="Si no lo cumple" value={a.si_incumple} disabled={bloqueado} onChange={(e) => cambiarArrastre({ si_incumple: e.target.value as ConsecuenciaArrastre })}>
                  {(Object.keys(CONSECUENCIAS) as ConsecuenciaArrastre[]).map((c) => (
                    <option key={c} value={c}>
                      {CONSECUENCIAS[c]}
                    </option>
                  ))}
                </Select>
              </div>
            </div>
          )}
        </div>
      </div>
    </Card>
  );
}
