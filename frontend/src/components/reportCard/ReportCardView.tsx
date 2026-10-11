import { Alert } from '../ui/Alert';
import { Chip, DesempenoBadge } from '../ui/Badge';
import { Card } from '../ui/Card';
import { Table, TableBody, TableHead, Td, Th } from '../ui/Table';
import { formatoFechaCalendario } from '../../lib/fechas';
import type { NivelDesempeno } from '../../types/domain';
import type { ReportCard, ReportCardArea, ReportCardAsignatura } from '../../types/reportCard';
import { ComponentBar } from './ComponentBar';

const NIVEL_NACIONAL: Record<NivelDesempeno, string> = {
  SUPERIOR: 'Desempeño Superior',
  ALTO: 'Desempeño Alto',
  BASICO: 'Desempeño Básico',
  BAJO: 'Desempeño Bajo',
};

function ordinal(n: number): string {
  return `${n}°`;
}

function Detalle({ rotulo, texto }: { rotulo: string; texto: string }) {
  return (
    <p className="text-xs text-body">
      <span className="font-semibold text-muted">{rotulo}: </span>
      {texto}
    </p>
  );
}

function AsignaturaRow({ asignatura }: { asignatura: ReportCardAsignatura }) {
  const tieneTexto = asignatura.descripcion || asignatura.recomendacion || asignatura.observacion_docente;
  return (
    <div className="rounded-lg border border-border p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="text-sm font-semibold text-ink">{asignatura.nombre}</p>
          <p className="text-xs text-muted">{asignatura.porcentaje_en_area}% del área</p>
        </div>
        <div className="flex items-center gap-2">
          {asignatura.nota_asignatura === null || asignatura.desempeno === null ? (
            <Chip tone="neutral">Sin cerrar</Chip>
          ) : (
            <>
              <span className="text-lg font-bold text-ink">{asignatura.nota_asignatura.toFixed(2)}</span>
              <DesempenoBadge value={asignatura.desempeno} />
            </>
          )}
          {asignatura.fallas_asignatura > 0 && (
            <Chip tone="orange">{asignatura.fallas_asignatura} falla(s)</Chip>
          )}
        </div>
      </div>
      {asignatura.componentes.length > 0 && (
        <div className="mt-3 grid grid-cols-1 gap-1.5 sm:grid-cols-2 sm:gap-x-4">
          {asignatura.componentes.map((c) => (
            <ComponentBar key={c.clave} label={`${c.nombre} ${c.porcentaje}%`} value={c.nota} />
          ))}
        </div>
      )}
      {tieneTexto && (
        <div className="mt-3 space-y-1 border-t border-border pt-2">
          {asignatura.descripcion && <Detalle rotulo="Descripción" texto={asignatura.descripcion} />}
          {asignatura.recomendacion && <Detalle rotulo="Recomendación" texto={asignatura.recomendacion} />}
          {asignatura.observacion_docente && <Detalle rotulo="Observación del docente" texto={asignatura.observacion_docente} />}
        </div>
      )}
    </div>
  );
}

function AreaSection({ area }: { area: ReportCardArea }) {
  return (
    <div className="border-t border-border pt-4 first:border-t-0 first:pt-0">
      <div className="mb-3 flex items-center justify-between gap-3">
        <h3 className="text-sm font-bold uppercase tracking-wide text-body">{area.nombre}</h3>
        <div className="flex items-center gap-2">
          {area.nota_area === null || area.desempeno_area === null ? (
            <Chip tone="neutral">Sin calcular</Chip>
          ) : (
            <>
              <span className="text-xl font-bold text-ink">{area.nota_area.toFixed(2)}</span>
              <DesempenoBadge value={area.desempeno_area} />
            </>
          )}
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
  const escala = [...reportCard.escala].sort((a, b) => b.valor_minimo - a.valor_minimo);

  return (
    <div className="space-y-4">
      {!reportCard.completo && (
        <Alert tone="info">
          Este boletín aún no es oficial: solo muestra las asignaturas cuya planilla ya cerró el docente.
          {reportCard.pendientes.length > 0 && <> Faltan: {reportCard.pendientes.join(', ')}.</>}
        </Alert>
      )}
      <Card>
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            {reportCard.institucion.nombre && (
              <p className="text-xs font-medium uppercase tracking-wide text-muted">{reportCard.institucion.nombre}</p>
            )}
            <h1 className="text-h3 text-ink">{estudiante.nombre_completo}</h1>
            <p className="text-sm text-muted">Documento: {estudiante.documento}</p>
            <div className="mt-2 flex flex-wrap gap-2">
              {estudiante.grado && <Chip>{estudiante.grado}</Chip>}
              <Chip>{estudiante.grupo}</Chip>
              <Chip>{estudiante.jornada}</Chip>
              <Chip>{estudiante.sede}</Chip>
              <Chip>
                {reportCard.nombre_periodo || `Periodo ${reportCard.periodo}`} · {reportCard.academic_year}
              </Chip>
            </div>
          </div>
          {reportCard.mostrar_puesto && (
            <div className="text-right">
              <p className="text-xs font-medium uppercase tracking-wide text-muted">Puesto en el grupo</p>
              <p className="text-2xl font-extrabold text-primary">
                {reportCard.puesto_grupo === null ? '—' : ordinal(reportCard.puesto_grupo)}{' '}
                <span className="text-sm font-medium text-muted">de {reportCard.total_estudiantes_grupo}</span>
              </p>
            </div>
          )}
        </div>
      </Card>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Card className="flex items-center justify-between">
          <div>
            <p className="text-xs font-medium uppercase tracking-wide text-muted">Promedio general</p>
            <p className="text-3xl font-extrabold text-ink">
              {reportCard.promedio_general_periodo === null ? '—' : reportCard.promedio_general_periodo.toFixed(2)}
            </p>
          </div>
          {reportCard.desempeno_general && <DesempenoBadge value={reportCard.desempeno_general} />}
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

      {escala.length > 0 && (
        <div className="space-y-2">
          <h2 className="text-h3 text-ink">Escala de valoración</h2>
          <Table>
            <TableHead>
              <Th>Escala del colegio</Th>
              <Th>Rango</Th>
              <Th>Equivale a (nacional)</Th>
            </TableHead>
            <TableBody>
              {escala.map((n) => (
                <tr key={n.nivel}>
                  <Td>{n.etiqueta}</Td>
                  <Td>
                    {n.valor_minimo.toFixed(1)} – {n.valor_maximo.toFixed(1)}
                  </Td>
                  <Td>{NIVEL_NACIONAL[n.nivel]}</Td>
                </tr>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      {(reportCard.fecha_entrega || reportCard.canal_reclamaciones) && (
        <Card>
          {reportCard.fecha_entrega && (
            <div className="mb-3">
              <p className="text-xs font-medium uppercase tracking-wide text-muted">Entrega del informe</p>
              <p className="text-sm text-body">Fecha de entrega a las familias: {formatoFechaCalendario(reportCard.fecha_entrega)}.</p>
            </div>
          )}
          {reportCard.canal_reclamaciones && (
            <div>
              <p className="text-xs font-medium uppercase tracking-wide text-muted">Aclaraciones y reclamaciones</p>
              <p className="whitespace-pre-line text-sm text-body">{reportCard.canal_reclamaciones}</p>
            </div>
          )}
        </Card>
      )}
    </div>
  );
}
