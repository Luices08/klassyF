import { Chip, DesempenoBadge } from '../ui/Badge';
import { Card } from '../ui/Card';
import type { ReportCard, ReportCardArea, ReportCardAsignatura } from '../../types/reportCard';
import { ComponentBar } from './ComponentBar';

function ordinal(n: number): string {
  return `${n}°`;
}

function AsignaturaRow({ asignatura }: { asignatura: ReportCardAsignatura }) {
  return (
    <div className="rounded-lg border border-border p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="text-sm font-semibold text-ink">{asignatura.nombre}</p>
          <p className="text-xs text-muted">{asignatura.porcentaje_en_area}% del área</p>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-lg font-bold text-ink">{asignatura.nota_asignatura.toFixed(2)}</span>
          <DesempenoBadge value={asignatura.desempeno} />
          {asignatura.fallas_asignatura > 0 && (
            <Chip tone="orange">{asignatura.fallas_asignatura} falla(s)</Chip>
          )}
        </div>
      </div>
      <div className="mt-3 grid grid-cols-1 gap-1.5 sm:grid-cols-3 sm:gap-4">
        <ComponentBar label="Saber" value={asignatura.componentes.saber} />
        <ComponentBar label="Hacer" value={asignatura.componentes.hacer} />
        <ComponentBar label="Ser" value={asignatura.componentes.ser} />
      </div>
    </div>
  );
}

function AreaSection({ area }: { area: ReportCardArea }) {
  return (
    <div className="border-t border-border pt-4 first:border-t-0 first:pt-0">
      <div className="mb-3 flex items-center justify-between gap-3">
        <h3 className="text-sm font-bold uppercase tracking-wide text-body">{area.nombre}</h3>
        <div className="flex items-center gap-2">
          <span className="text-xl font-bold text-ink">{area.nota_area.toFixed(2)}</span>
          <DesempenoBadge value={area.desempeno_area} />
        </div>
      </div>
      <div className="space-y-2">
        {area.asignaturas.map((a) => (
          <AsignaturaRow key={a.subject_id} asignatura={a} />
        ))}
      </div>
    </div>
  );
}

export function ReportCardView({ reportCard }: { reportCard: ReportCard }) {
  const { estudiante, asistencia_periodo: asistencia } = reportCard;

  return (
    <div className="space-y-6">
      <Card>
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="text-h3 text-ink">{estudiante.nombre_completo}</h1>
            <p className="text-sm text-muted">Documento: {estudiante.documento}</p>
            <div className="mt-2 flex flex-wrap gap-2">
              <Chip>{estudiante.grupo}</Chip>
              <Chip>{estudiante.jornada}</Chip>
              <Chip>{estudiante.sede}</Chip>
              <Chip>
                Periodo {reportCard.periodo} · {reportCard.academic_year}
              </Chip>
            </div>
          </div>
          <div className="text-right">
            <p className="text-xs font-medium uppercase tracking-wide text-muted">Puesto en el grupo</p>
            <p className="text-2xl font-extrabold text-primary">
              {ordinal(reportCard.puesto_grupo)}{' '}
              <span className="text-sm font-medium text-muted">de {reportCard.total_estudiantes_grupo}</span>
            </p>
          </div>
        </div>
      </Card>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Card className="flex items-center justify-between">
          <div>
            <p className="text-xs font-medium uppercase tracking-wide text-muted">Promedio general</p>
            <p className="text-3xl font-extrabold text-ink">{reportCard.promedio_general_periodo.toFixed(2)}</p>
          </div>
          <DesempenoBadge value={reportCard.desempeno_general} />
        </Card>

        <Card>
          <p className="mb-2 text-xs font-medium uppercase tracking-wide text-muted">Asistencia del periodo</p>
          <div className="flex gap-4 text-sm">
            <div>
              <p className="text-lg font-bold text-warning">{asistencia.total_fallas_justificadas}</p>
              <p className="text-xs text-muted">Justificadas</p>
            </div>
            <div>
              <p className="text-lg font-bold text-danger">{asistencia.total_fallas_injustificadas}</p>
              <p className="text-xs text-muted">Injustificadas</p>
            </div>
            <div>
              <p className="text-lg font-bold text-body">{asistencia.total_retardos}</p>
              <p className="text-xs text-muted">Retardos</p>
            </div>
          </div>
        </Card>
      </div>

      <Card>
        <h2 className="mb-4 text-h3 text-ink">Áreas y asignaturas</h2>
        {reportCard.areas.length === 0 ? (
          <p className="text-sm text-muted">
            No hay malla curricular configurada para el grado de este estudiante en este año lectivo.
          </p>
        ) : (
          <div className="space-y-4">
            {reportCard.areas.map((area) => (
              <AreaSection key={area.area_id} area={area} />
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}
