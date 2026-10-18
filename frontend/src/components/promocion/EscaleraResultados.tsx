import { Chip } from '../ui/Badge';
import { Input } from '../ui/Field';
import type { PoliticaPromocion } from '../../hooks/usePromocion';

interface Props {
  politica: PoliticaPromocion;
  onChange?: (p: PoliticaPromocion) => void;
  bloqueado?: boolean;
  activaAreas?: boolean;
  onEditandoAreasChange?: (editando: boolean) => void;
}

const num = (v: string): number | null => (v === '' ? null : Number(v));

/**
 * Muestra y permite configurar los umbrales de promoción en una sola estructura integrada.
 * El campo numérico editable se encuentra directamente dentro de la fila de recuperación,
 * y la fila de reprobación se deduce automáticamente en tiempo real.
 */
export function EscaleraResultados({ politica: p, onChange, bloqueado = false, activaAreas, onEditandoAreasChange }: Props) {
  const u = p.umbrales;
  const hasta = u.recuperacion_hasta;
  const unidad = p.unidad === 'AREA' ? 'áreas' : 'asignaturas';
  // Solo se considera desactivada la recuperación si explícitamente se configuró en 0.
  // Mientras el usuario edita o borra el campo numérico, permanece montado.
  const hay = hasta !== 0;
  const mostrarAreas = p.unidad === 'AMBAS' && (activaAreas !== undefined ? activaAreas : u.reprueba_desde_areas !== null);

  return (
    <div className="space-y-2.5" aria-label="Umbrales de promoción y qué pasa según cuántas asignaturas pierde">
      {/* 1. Promovido directamente */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 rounded-xl bg-soft px-4 py-3 border border-border/50">
        <div className="flex flex-wrap items-center gap-3">
          <Chip tone="green">Promovido directamente</Chip>
          <span className="text-sm font-medium text-ink">
            Aprueba todas las {unidad} (0 reprobadas)
          </span>
        </div>
        <span className="text-xs text-muted">Aprobación ordinaria del año escolar</span>
      </div>

      {/* 2. Recuperación final */}
      {hay ? (
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 rounded-xl bg-soft px-4 py-3 border border-amber-500/30">
          <div className="flex flex-wrap items-center gap-2 text-sm font-medium text-ink">
            <Chip tone="orange">Recuperación final</Chip>
            <span>Estudiantes que reprueben hasta</span>
            {onChange ? (
              <div className="w-20 inline-block">
                <Input
                  label={`Cantidad de ${unidad} a nivelar`}
                  hideLabel
                  type="number"
                  min={1}
                  max={20}
                  value={hasta ?? ''}
                  disabled={bloqueado}
                  onChange={(e) => onChange({ ...p, umbrales: { ...u, recuperacion_hasta: num(e.target.value) } })}
                  onBlur={() => {
                    if (hasta === null) {
                      onChange({ ...p, umbrales: { ...u, recuperacion_hasta: 1 } });
                    }
                  }}
                />
              </div>
            ) : (
              <span className="font-bold text-ink underline">{hasta ?? '—'}</span>
            )}
            <span>{unidad} tienen derecho a presentar nivelaciones.</span>
          </div>
        </div>
      ) : (
        <div className="flex items-center justify-between gap-2 rounded-xl bg-soft/60 px-4 py-3 text-muted text-sm border border-border/40">
          <div className="flex items-center gap-3">
            <Chip tone="neutral">Sin recuperación final</Chip>
            <span>El colegio no contempla nivelaciones al cierre de año escolar.</span>
          </div>
        </div>
      )}

      {/* 3. Reprobación directa */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 rounded-xl bg-soft px-4 py-3 border border-border/50">
        <div className="flex flex-wrap items-center gap-3">
          <Chip tone="red">No es promovido</Chip>
          <span className="text-sm font-medium text-ink">
            Estudiantes que reprueben {hay ? (hasta != null ? `${hasta + 1} o más` : 'más de las permitidas') : '1 o más'} {unidad}.
          </span>
        </div>
        <span className="text-xs text-muted">(Calculado automáticamente a partir del tope)</span>
      </div>

      {/* 4. Salvaguarda por áreas (solo si aplica evaluación de ambas) */}
      {mostrarAreas && (
        <div className="flex items-center gap-3 rounded-xl bg-soft px-4 py-3 border border-rose-500/20">
          <Chip tone="red">Reprueba por áreas</Chip>
          <div className="flex items-center gap-2 text-sm font-medium text-ink">
            <span>Quien pierda</span>
            {onChange ? (
              <div className="w-16 inline-block">
                <Input
                  label="Áreas perdidas"
                  hideLabel
                  type="number"
                  min={1}
                  max={20}
                  value={u.reprueba_desde_areas ?? ''}
                  disabled={bloqueado}
                  onFocus={() => onEditandoAreasChange?.(true)}
                  onChange={(e) => {
                    const val = num(e.target.value);
                    if (val === null) onEditandoAreasChange?.(true);
                    onChange({ ...p, umbrales: { ...u, reprueba_desde_areas: val } });
                  }}
                  onBlur={() => {
                    onEditandoAreasChange?.(false);
                    if (u.reprueba_desde_areas === null) {
                      onChange({ ...p, umbrales: { ...u, reprueba_desde_areas: 1 } });
                    }
                  }}
                />
              </div>
            ) : (
              <span className="font-bold text-ink underline">{u.reprueba_desde_areas ?? '—'}</span>
            )}
            <span>o más áreas.</span>
          </div>
        </div>
      )}

      {/* Aclaración de arrastre si está activo */}
      {p.arrastre.admite && (
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 rounded-xl bg-primary-soft/40 px-4 py-2.5 text-xs text-primary border border-primary/20">
          <div className="flex items-center gap-2">
            <span className="font-semibold">Promoción con asignaturas pendientes (Arrastre):</span>
            <span>
              Si tras presentar la nivelación el estudiante aún debe hasta {p.arrastre.max_unidades} asignatura(s) de las permitidas, es promovido al grado siguiente con compromiso de nivelación en el siguiente año.
            </span>
          </div>
        </div>
      )}
    </div>
  );
}
