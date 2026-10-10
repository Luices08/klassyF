import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Alert, errorMessage } from '../components/ui/Alert';
import { Chip, DesempenoBadge, EstadoEntregaBadge, TipoActividadChip } from '../components/ui/Badge';
import { Card } from '../components/ui/Card';
import { Select } from '../components/ui/Field';
import { PageHeader } from '../components/ui/PageHeader';
import { Spinner } from '../components/ui/Spinner';
import { type AsignaturaDeMisNotas, useMisNotas } from '../hooks/useNotas';
import { useAnioDeTrabajo } from '../hooks/useAniosLectivos';
import { formatoDiaCorto } from '../lib/actividades';

const formatoNota = (nota: number | null): string => (nota === null ? '—' : nota.toFixed(2));

/** Rojo solo cuando la nota está por debajo de la aprobatoria del colegio; el resto va en el color de título. */
const colorDeNota = (nota: number | null, aprobatoria: number): string => (nota !== null && aprobatoria > 0 && nota < aprobatoria ? 'text-danger' : 'text-ink');

function TarjetaAsignatura({ asignatura, aprobatoria }: { asignatura: AsignaturaDeMisNotas; aprobatoria: number }) {
  const definitiva = asignatura.estado === 'CERRADO' || asignatura.estado === 'DEFINITIVO';
  const docente = asignatura.asignacion?.docente;
  return (
    <Card>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-h3 text-ink">{asignatura.asignacion?.asignatura?.nombre ?? 'Asignatura'}</h2>
          {docente && (
            <p className="text-sm text-muted">
              {docente.nombre} {docente.apellido}
            </p>
          )}
        </div>
        <div className="flex flex-wrap items-center justify-end gap-2">
          {asignatura.desempeno && <DesempenoBadge value={asignatura.desempeno} />}
          <Chip tone={definitiva ? 'blue' : 'orange'}>{definitiva ? 'Nota final' : asignatura.nota_asignatura === null ? 'Sin notas aún' : 'Provisional'}</Chip>
          <span className={`text-h2 ${colorDeNota(asignatura.nota_asignatura, aprobatoria)}`}>{formatoNota(asignatura.nota_asignatura)}</span>
        </div>
      </div>
      {asignatura.parcial && (
        <p className="mt-2 text-xs text-muted">Esta nota se calcula con lo calificado hasta ahora; puede cambiar cuando tu docente califique el resto.</p>
      )}

      <div className="mt-4 space-y-4">
        {asignatura.bloques.map((bloque) => (
          <div key={bloque.clave} className="rounded-lg border border-border">
            <div className="flex items-center justify-between gap-3 rounded-t-lg bg-primary-soft px-4 py-2">
              <p className="text-sm font-semibold text-ink">
                {bloque.nombre} <span className="font-normal text-muted">· vale {bloque.porcentaje}% de la nota</span>
              </p>
              <p className={`text-sm font-semibold ${colorDeNota(bloque.nota, aprobatoria)}`}>{formatoNota(bloque.nota)}</p>
            </div>
            {bloque.casillas.length === 0 ? (
              <p className="px-4 py-3 text-sm text-muted">Tu docente aún no ha registrado notas en este bloque.</p>
            ) : (
              <ul className="divide-y divide-border">
                {bloque.casillas.map((casilla) => (
                  <li key={casilla.id} className="flex flex-wrap items-center justify-between gap-3 px-4 py-2.5">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-sm font-medium text-ink">{casilla.titulo}</span>
                        {casilla.tipo_actividad && <TipoActividadChip value={casilla.tipo_actividad} />}
                        {casilla.entrega && casilla.nota === null && <EstadoEntregaBadge value={casilla.entrega} />}
                      </div>
                      <p className="text-xs text-muted">
                        Pesa {casilla.peso_efectivo}% del bloque
                        {casilla.fecha_entrega ? ` · entrega ${formatoDiaCorto(casilla.fecha_entrega)}` : ''}
                      </p>
                    </div>
                    <span className={`text-sm font-semibold ${casilla.nota === null ? 'text-muted' : colorDeNota(casilla.nota, aprobatoria)}`}>
                      {casilla.nota === null ? 'Sin calificar' : formatoNota(casilla.nota)}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        ))}
      </div>
    </Card>
  );
}

/**
 * Las notas del estudiante por asignatura y periodo: cada bloque del molde del colegio con las actividades y notas que lo forman.
 * Mientras el periodo está abierto son provisionales; la nota final es la que el docente cierra y la que lleva el boletín.
 */
export function MisNotasPage() {
  const { anio } = useAnioDeTrabajo();
  const [periodoElegido, setPeriodoElegido] = useState<number | null>(null);
  const periodoAbierto = anio?.periodos.find((p) => p.estado === 'ABIERTO' || p.estado === 'EN_DIGITACION')?.numero ?? 1;
  const periodo = periodoElegido ?? periodoAbierto;
  const { data, isLoading, isError, error } = useMisNotas(anio ? periodo : undefined, anio?._id);

  return (
    <div className="space-y-4">
      <PageHeader
        title="Mis notas"
        subtitle="Tus calificaciones por asignatura: de qué bloque viene cada nota y cuánto pesa. Para entregar tareas ve a «Mis actividades»."
        action={
          <Link to="/report-card" className="text-sm font-semibold text-primary hover:underline">
            Ver mi boletín
          </Link>
        }
      />

      {anio && (
        <Card>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <Select label="Periodo" value={periodo} onChange={(e) => setPeriodoElegido(Number(e.target.value))}>
              {anio.periodos.map((p) => (
                <option key={p.numero} value={p.numero}>
                  {p.nombre}
                </option>
              ))}
            </Select>
          </div>
        </Card>
      )}

      {isError && <Alert tone="error">{errorMessage(error)}</Alert>}
      {isLoading && (
        <div className="flex justify-center p-12">
          <Spinner />
        </div>
      )}
      {data && data.asignaturas.length === 0 && <Alert tone="info">No tienes asignaturas con matrícula activa en este año lectivo.</Alert>}
      {data?.asignaturas.map((a) => (
        <TarjetaAsignatura key={a.teacher_assignment_id} asignatura={a} aprobatoria={data.nota_aprobatoria} />
      ))}
    </div>
  );
}
