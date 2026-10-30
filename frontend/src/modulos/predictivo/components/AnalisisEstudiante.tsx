import { useState } from 'react';
import { TarjetaIndicador } from '../../../components/dashboard/TarjetaIndicador';
import { Alert } from '../../../components/ui/Alert';
import { Chip, type Tone } from '../../../components/ui/Badge';
import { Card, CardHeader } from '../../../components/ui/Card';
import { AlertTriangleIcon, BookIcon, CheckCircleIcon, ClipboardListIcon, GraduationCapIcon } from '../../../components/ui/icons';
import { ProgressBar } from '../../../components/ui/ProgressBar';
import type { AnalisisEstudiante as Analisis, RiesgoPromocion } from '../hooks/usePredictivo';
import { nota, ordenarAsignaturas, porcentaje, textoCorte, TONO_DESEMPENO, tonoDeProporcion } from '../lib/presentacion';
import { DetalleAsignaturaDrawer } from './DetalleAsignaturaDrawer';
import { FodaCuadrantes } from './FodaCuadrantes';
import { Desempeno, TarjetaAsignatura } from './TarjetaAsignatura';

const pct = (v: number) => `${v.toLocaleString('es-CO', { maximumFractionDigits: 1 })} %`;

/** Cómo podría terminar el año con la política del colegio (solo personal). */
function RiesgoDePromocion({ riesgo }: { riesgo: RiesgoPromocion }) {
  const filas: { etiqueta: string; valor: number; tono: Tone }[] = [
    { etiqueta: 'Promovido sin recuperación', valor: riesgo.promovido, tono: 'green' },
    { etiqueta: 'Va a recuperación final', valor: riesgo.recuperacion, tono: 'orange' },
    { etiqueta: 'Lo decide la comisión', valor: riesgo.comision, tono: 'blue' },
    { etiqueta: 'No promovido', valor: riesgo.no_promovido, tono: 'red' },
  ];
  return (
    <div className="space-y-2">
      {filas.map((f) => (
        <div key={f.etiqueta}>
          <div className="mb-1 flex justify-between text-sm">
            <span className="text-body">{f.etiqueta}</span>
            <span className="font-semibold text-ink">{porcentaje(f.valor)}</span>
          </div>
          <ProgressBar value={f.valor} max={1} tone={f.tono} label={f.etiqueta} />
        </div>
      ))}
      <p className="text-xs text-muted">
        Se esperan {riesgo.perdidas_esperadas.toLocaleString('es-CO', { maximumFractionDigits: 1 })} asignaturas perdidas antes de la recuperación final. Calculado con
        la política de promoción del colegio sobre {riesgo.simulaciones.toLocaleString('es-CO')} escenarios.
      </p>
    </div>
  );
}

/** Análisis general: indicadores del año, cómo podría terminar (personal) y el FODA general. Va antes que las asignaturas. */
function AnalisisGeneral({ analisis }: { analisis: Analisis }) {
  const { general, decimales } = analisis;
  const conProbabilidad = analisis.ve.probabilidad;
  const enRiesgo = general.asignaturas_en_riesgo;
  const total = analisis.asignaturas.length;
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <TarjetaIndicador
          titulo="Promedio del año"
          icono={GraduationCapIcon}
          tono={general.nivel ? TONO_DESEMPENO[general.nivel] : 'neutral'}
          valor={general.promedio === null ? null : nota(general.promedio, decimales)}
          detalle={<Desempeno nivel={general.nivel} etiqueta={general.desempeno} />}
          vacio="Aún sin notas cerradas."
          tinte
        />
        <TarjetaIndicador
          titulo="Asistencia"
          icono={CheckCircleIcon}
          tono={tonoDeProporcion(general.asistencia.porcentaje)}
          valor={general.asistencia.porcentaje === null ? null : pct(general.asistencia.porcentaje)}
          progreso={general.asistencia.porcentaje === null ? undefined : { value: general.asistencia.porcentaje, max: 100, etiqueta: 'Asistencia' }}
          detalle={`${general.asistencia.fallas} fallas sin excusa en ${general.asistencia.registros} clases.`}
          vacio="Aún no hay planillas de asistencia."
          tinte
        />
        <TarjetaIndicador
          titulo="Cumplimiento de actividades"
          icono={ClipboardListIcon}
          tono={tonoDeProporcion(general.actividades.porcentaje)}
          valor={general.actividades.porcentaje === null ? null : pct(general.actividades.porcentaje)}
          progreso={general.actividades.porcentaje === null ? undefined : { value: general.actividades.porcentaje, max: 100, etiqueta: 'Cumplimiento de actividades' }}
          detalle={`Entregó ${general.actividades.entregadas} de ${general.actividades.vencidas} actividades vencidas.`}
          vacio="Aún no hay actividades vencidas."
          tinte
        />
        {conProbabilidad && enRiesgo !== undefined ? (
          <TarjetaIndicador
            titulo="Asignaturas en riesgo"
            icono={AlertTriangleIcon}
            tono={enRiesgo === 0 ? 'green' : enRiesgo >= 3 ? 'red' : 'orange'}
            valor={`${enRiesgo} de ${total}`}
            detalle={general.asignaturas_perdiendo === 0 ? 'No va perdiendo ninguna por nota.' : `Va perdiendo ${general.asignaturas_perdiendo} por nota.`}
            tinte
          />
        ) : (
          <TarjetaIndicador
            titulo="Asignaturas perdiendo"
            icono={BookIcon}
            tono={general.asignaturas_perdiendo === 0 ? 'green' : 'red'}
            valor={`${general.asignaturas_perdiendo} de ${total}`}
            detalle={general.asignaturas_perdiendo === 0 ? 'Va aprobando todas.' : 'Por debajo de la aprobatoria en los periodos cerrados.'}
            tinte
          />
        )}
      </div>

      <div className={`grid grid-cols-1 gap-4 ${conProbabilidad && general.riesgo ? 'xl:grid-cols-[1fr_20rem]' : ''}`}>
        <Card>
          <CardHeader title="FODA general" subtitle="Fortalezas, oportunidades, debilidades y amenazas del estudiante en el año." />
          <FodaCuadrantes foda={analisis.foda} />
        </Card>
        {conProbabilidad && general.riesgo && (
          <Card>
            <CardHeader title="Cómo podría terminar el año" subtitle="Estimación con la política de promoción del colegio." />
            <RiesgoDePromocion riesgo={general.riesgo} />
          </Card>
        )}
      </div>
    </div>
  );
}

/**
 * El análisis de un estudiante: primero el análisis general (indicadores y FODA), luego una tarjeta por asignatura; al abrir una se ven
 * sus estadísticas y su FODA. Lo que se ve lo decidió el servidor: al estudiante y a la familia no les llegan la probabilidad ni el
 * riesgo, así que esta vista solo los dibuja si vienen.
 */
export function AnalisisEstudiante({ analisis, paraFamilia = false }: { analisis: Analisis; paraFamilia?: boolean }) {
  const [abierta, setAbierta] = useState<string | null>(null);
  const conProbabilidad = analisis.ve.probabilidad;
  const asignaturas = ordenarAsignaturas(analisis.asignaturas, conProbabilidad);
  return (
    <div className="space-y-4">
      {!paraFamilia && (
        <Card>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-h3 text-ink">
                {analisis.estudiante.nombre} {analisis.estudiante.apellido}
              </h2>
              <p className="text-sm text-muted">
                Grupo {analisis.estudiante.grupo} · Año {analisis.anio.year}
                {analisis.periodo_actual !== null && ` · Periodo ${analisis.periodo_actual} en curso`}
              </p>
            </div>
            {analisis.modelo.origen === 'ENTRENADO' && <Chip tone="blue">Modelo versión {analisis.modelo.version}</Chip>}
            {analisis.modelo.origen === 'DEMOSTRACION' && <Chip tone="orange">Modelo de demostración</Chip>}
          </div>
        </Card>
      )}

      <p className="text-sm text-muted">{textoCorte(analisis)}</p>
      {conProbabilidad && analisis.modelo.aviso && <Alert tone="warning">{analisis.modelo.aviso}</Alert>}

      {analisis.estado === 'SIN_DATOS' ? (
        <Alert tone="info">Sin datos suficientes: todavía no hay notas, asistencia, entregas ni años anteriores con qué analizar.</Alert>
      ) : (
        <AnalisisGeneral analisis={analisis} />
      )}

      {asignaturas.length > 0 && (
        <div className="space-y-3">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h3 className="text-h3 text-ink">Asignaturas</h3>
            <p className="text-sm text-muted">Toca una asignatura para ver sus estadísticas y su FODA.</p>
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {asignaturas.map((a) => (
              <TarjetaAsignatura
                key={a.subject_id}
                a={a}
                conProbabilidad={conProbabilidad}
                decimales={analisis.decimales}
                periodoActual={analisis.periodo_actual}
                onAbrir={() => setAbierta(a.subject_id)}
              />
            ))}
          </div>
        </div>
      )}

      <DetalleAsignaturaDrawer a={analisis.asignaturas.find((x) => x.subject_id === abierta) ?? null} analisis={analisis} onClose={() => setAbierta(null)} />
    </div>
  );
}
