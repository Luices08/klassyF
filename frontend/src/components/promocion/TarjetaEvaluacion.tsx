import { Card, CardHeader } from '../ui/Card';
import { Input, Select } from '../ui/Field';
import { MultiSelect } from '../ui/MultiSelect';
import { OpcionesTarjeta } from '../ui/OpcionesTarjeta';
import { Switch } from '../ui/Switch';
import { useAreas, useSubjects } from '../../hooks/useCatalogoAcademico';
import type { EfectoImprescindibles, PoliticaPromocion } from '../../hooks/usePromocion';

interface Props {
  valor: PoliticaPromocion;
  onChange: (p: PoliticaPromocion) => void;
  bloqueado: boolean;
}

/** Tarjeta 1: qué significa «perder», qué materias son imprescindibles y cuánta inasistencia reprueba. */
export function TarjetaEvaluacion({ valor: b, onChange, bloqueado }: Props) {
  const areas = useAreas().data ?? [];
  const asignaturas = useSubjects().data ?? [];
  const conAreas = b.unidad !== 'ASIGNATURA';
  const conAsignaturas = b.unidad !== 'AREA';
  const hayImprescindibles = (conAsignaturas && b.asignaturas_criticas_ids.length > 0) || (conAreas && b.areas_criticas_ids.length > 0);

  // Una materia imprescindible no puede ser a la vez una de las que se permite deber.
  const opcionesAsignaturas = asignaturas.filter((s) => !b.asignaturas_arrastrables_ids.includes(s._id)).map((s) => ({ value: s._id, label: s.nombre }));
  const opcionesAreas = areas.map((a) => ({ value: a._id, label: a.nombre }));

  return (
    <Card>
      <CardHeader title="1. ¿Qué significa «perder» en tu colegio?" subtitle="Define qué se cuenta como perdido, qué materias no se pueden perder y cuánta inasistencia reprueba." />
      <div className="space-y-5">
        <OpcionesTarjeta
          label="Qué se cuenta como perdido"
          value={b.unidad}
          disabled={bloqueado}
          onChange={(unidad) => onChange({ ...b, unidad, umbrales: unidad === 'AMBAS' ? b.umbrales : { ...b.umbrales, reprueba_desde_areas: null } })}
          options={[
            { value: 'AREA', titulo: 'Por áreas', ejemplo: 'Se promedian las asignaturas de cada área; si el promedio no aprueba, cuenta como 1 área reprobada.' },
            { value: 'ASIGNATURA', titulo: 'Por asignaturas', ejemplo: 'Cada asignatura cuenta por separado (p. ej. Álgebra, Biología, etc.).' },
            { value: 'AMBAS', titulo: 'Por áreas y asignaturas', ejemplo: 'Se evalúan ambas; se recupera por asignaturas y se puede fijar un tope de reprobación por áreas.' },
          ]}
        />

        {conAreas && (
          <Switch
            label="Si reprueba una asignatura del área, el área cuenta como reprobada"
            description="Aunque el promedio ponderado del área alcance la nota aprobatoria."
            checked={b.area_pierde_con_asignatura_perdida}
            disabled={bloqueado}
            onChange={(v) => onChange({ ...b, area_pierde_con_asignatura_perdida: v })}
          />
        )}

        <div className="space-y-3">
          <div>
            <p className="text-label text-body">Áreas y asignaturas imprescindibles</p>
            <p className="text-xs text-muted">Áreas o asignaturas fundamentales que causan pérdida directa del año escolar si no se aprueban (o la consecuencia que definas abajo).</p>
          </div>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            {conAreas && <MultiSelect label="Áreas imprescindibles" options={opcionesAreas} selected={b.areas_criticas_ids} onChange={(v) => !bloqueado && onChange({ ...b, areas_criticas_ids: v })} allLabel="Ninguna" />}
            {conAsignaturas && (
              <MultiSelect
                label="Asignaturas imprescindibles"
                options={opcionesAsignaturas}
                selected={b.asignaturas_criticas_ids}
                onChange={(v) => !bloqueado && onChange({ ...b, asignaturas_criticas_ids: v })}
                allLabel="Ninguna"
              />
            )}
          </div>
          {hayImprescindibles && (
            <>
              <p className="text-sm font-semibold text-ink">Si pierde una imprescindible:</p>
              <OpcionesTarjeta<EfectoImprescindibles>
                label="Qué pasa si pierde una materia imprescindible"
                value={b.imprescindibles.efecto ?? 'NO_PROMUEVE'}
                disabled={bloqueado}
                onChange={(efecto) => onChange({ ...b, imprescindibles: { efecto } })}
                options={[
                  { value: 'NO_PROMUEVE', titulo: 'Pierde el año directamente', ejemplo: 'Reprueba el año sin derecho a recuperación final.' },
                  { value: 'RECUPERA', titulo: 'Va a recuperación como las demás', ejemplo: 'Tiene derecho a nivelar en el periodo de recuperación de fin de año.' },
                  { value: 'COMISION', titulo: 'Lo decide la Comisión', ejemplo: 'El caso pasa a decisión de la Comisión de Evaluación y Promoción en acta.' },
                ]}
              />
            </>
          )}
        </div>

        <div className="space-y-3">
          <Switch
            label="Aplicar pérdida del año por inasistencia"
            description="Por norma suele usarse el 25 %."
            checked={b.inasistencia.activa}
            disabled={bloqueado}
            onChange={(v) => onChange({ ...b, inasistencia: { ...b.inasistencia, activa: v } })}
          />
          {b.inasistencia.activa && (
            <div className="flex flex-wrap items-end gap-3 text-sm text-body">
              <span className="pb-2">Pierde el año quien falte a más del</span>
              <div className="w-24">
                <Input
                  label="Porcentaje máximo de inasistencia"
                  hideLabel
                  type="number"
                  min={0}
                  max={100}
                  step="any"
                  value={b.inasistencia.porcentaje ?? ''}
                  disabled={bloqueado}
                  onChange={(e) => {
                    const val = e.target.value === '' ? ('' as any) : Number(e.target.value);
                    onChange({ ...b, inasistencia: { ...b.inasistencia, porcentaje: val } });
                  }}
                  onBlur={() => {
                    if (typeof b.inasistencia.porcentaje !== 'number' || isNaN(b.inasistencia.porcentaje)) {
                      onChange({ ...b, inasistencia: { ...b.inasistencia, porcentaje: 25 } });
                    }
                  }}
                />
              </div>
              <span className="pb-2">% de las clases,</span>
              <div className="w-52">
                <Select
                  label="Qué inasistencias cuentan"
                  hideLabel
                  value={b.inasistencia.faltas}
                  disabled={bloqueado}
                  onChange={(e) => onChange({ ...b, inasistencia: { ...b.inasistencia, faltas: e.target.value as PoliticaPromocion['inasistencia']['faltas'] } })}
                >
                  <option value="SOLO_INJUSTIFICADAS">sin justificar</option>
                  <option value="TODAS">contando todas</option>
                </Select>
              </div>
            </div>
          )}
        </div>
      </div>
    </Card>
  );
}
