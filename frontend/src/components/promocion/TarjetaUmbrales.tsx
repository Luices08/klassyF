import { useState } from 'react';
import { Card, CardHeader } from '../ui/Card';
import { OpcionesTarjeta } from '../ui/OpcionesTarjeta';
import { Switch } from '../ui/Switch';
import type { EfectoNotaRecuperacion, PoliticaPromocion } from '../../hooks/usePromocion';
import { EscaleraResultados } from './EscaleraResultados';

interface Props {
  valor: PoliticaPromocion;
  onChange: (p: PoliticaPromocion) => void;
  bloqueado: boolean;
  notaAprobatoria: number;
}

/** Tarjeta 2: cuántas materias puede perder y qué pasa en cada caso. Configuración visual e interactiva integrada. */
export function TarjetaUmbrales({ valor: b, onChange, bloqueado, notaAprobatoria }: Props) {
  const u = b.umbrales;
  const hay = u.recuperacion_hasta !== 0;
  const [editandoAreas, setEditandoAreas] = useState<boolean>(false);
  const activaAreas = u.reprueba_desde_areas !== null || editandoAreas;

  return (
    <Card>
      <CardHeader
        title="2. ¿Cuántas asignaturas o áreas puede perder y qué pasa?"
        subtitle="Configura los umbrales de aprobación, nivelación final y reprobación directa del año."
      />
      <div className="space-y-6">
        {/* Interruptor de recuperación */}
        <Switch
          label="Habilitar recuperación de fin de año"
          description="Permite a los estudiantes con asignaturas perdidas presentar nivelaciones finales."
          checked={hay}
          disabled={bloqueado}
          onChange={(v) => onChange({ ...b, umbrales: { ...u, recuperacion_hasta: v ? 2 : 0 } })}
        />

        {/* Escalera interactiva de resultados */}
        <div className="space-y-2">
          <p className="text-label text-body">Umbrales de fin de año</p>
          <EscaleraResultados
            politica={b}
            onChange={onChange}
            bloqueado={bloqueado}
            activaAreas={activaAreas}
            onEditandoAreasChange={setEditandoAreas}
          />
        </div>

        {/* Salvaguarda adicional por áreas si evalúa AMBAS */}
        {b.unidad === 'AMBAS' && (
          <div className="pt-2 border-t border-border/40">
            <Switch
              label="También reprobar el año directamente por áreas perdidas"
              description="Activa un umbral de áreas que causa pérdida directa independientemente de las asignaturas."
              checked={activaAreas}
              disabled={bloqueado}
              onChange={(v) => {
                setEditandoAreas(false);
                onChange({ ...b, umbrales: { ...u, reprueba_desde_areas: v ? (u.reprueba_desde_areas ?? 2) : null } });
              }}
            />
          </div>
        )}

        {/* Efecto de la nota de recuperación */}
        {hay && (
          <div className="space-y-3 pt-2 border-t border-border/40">
            <div>
              <p className="text-sm font-semibold text-ink">Si aprueba la recuperación, su nota definitiva queda en:</p>
              <p className="text-xs text-muted mt-0.5">
                Nota mínima aprobatoria tomada de la escala institucional del año lectivo: <strong className="text-ink font-semibold">{notaAprobatoria.toFixed(1)} (Básico)</strong>.
              </p>
            </div>
            <OpcionesTarjeta<EfectoNotaRecuperacion>
              label="Nota al aprobar la recuperación"
              value={u.efecto_nota_recuperacion}
              disabled={bloqueado}
              onChange={(efecto) => onChange({ ...b, umbrales: { ...u, efecto_nota_recuperacion: efecto } })}
              options={[
                {
                  value: 'LIMITA_A_APROBATORIA',
                  titulo: `La mínima aprobatoria: ${notaAprobatoria.toFixed(1)}`,
                  ejemplo: `Aunque el estudiante obtenga una nota superior en el examen de recuperación, su nota definitiva se fija en la mínima aprobatoria (${notaAprobatoria.toFixed(1)} / Básico).`,
                },
                {
                  value: 'REEMPLAZA',
                  titulo: 'La nota real que saque',
                  ejemplo: 'Queda registrada la calificación exacta obtenida en la recuperación, incluso si es Superior o Alto.',
                },
              ]}
            />
            <p className="text-xs text-muted bg-primary-soft/50 text-primary p-2.5 rounded-lg">
              ℹ️ Este ajuste sincroniza automáticamente la política de «Recuperaciones de fin de año» en el módulo de Recuperaciones.
            </p>
          </div>
        )}
      </div>
    </Card>
  );
}
