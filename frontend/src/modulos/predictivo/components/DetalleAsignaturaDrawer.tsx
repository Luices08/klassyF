import type { ReactNode } from 'react';
import { BarrasHorizontales, type FilaBarra } from '../../../components/dashboard/BarrasHorizontales';
import { Chip } from '../../../components/ui/Badge';
import { Drawer } from '../../../components/ui/Drawer';
import type { AnalisisEstudiante, AsignaturaAnalizada } from '../hooks/usePredictivo';
import { NOMBRE_FUENTE, NOMBRE_RIESGO, nota, notaParaEstePeriodo, porcentaje, TONO_RIESGO, tonoDeNota, tonoDeProporcion } from '../lib/presentacion';
import { FodaCuadrantes } from './FodaCuadrantes';
import { Desempeno } from './TarjetaAsignatura';

const pct = (v: number) => `${v.toLocaleString('es-CO', { maximumFractionDigits: 1 })} %`;
const TEXTO_TENDENCIA = { SUBE: 'Va subiendo', BAJA: 'Va bajando', ESTABLE: 'Estable' } as const;

function Seccion({ titulo, children }: { titulo: string; children: ReactNode }) {
  return (
    <section className="space-y-3">
      <h3 className="text-label font-semibold uppercase tracking-wide text-muted">{titulo}</h3>
      {children}
    </section>
  );
}

interface DetalleProps {
  a: AsignaturaAnalizada | null;
  analisis: AnalisisEstudiante;
  onClose: () => void;
}

/** El detalle de una asignatura: estadísticas en barras, notas por periodo, historial de años anteriores y su FODA. */
export function DetalleAsignaturaDrawer({ a, analisis, onClose }: DetalleProps) {
  if (!a) return null;
  const { decimales, escala, periodo_actual: periodoActual } = analisis;
  const conProbabilidad = analisis.ve.probabilidad;
  const e = a.estadisticas;
  const necesita = notaParaEstePeriodo(a.nota_requerida, periodoActual, decimales);

  const estadisticas: FilaBarra[] = [];
  if (conProbabilidad && a.probabilidad !== null && a.probabilidad !== undefined && a.riesgo) {
    estadisticas.push({
      clave: 'riesgo',
      etiqueta: 'Probabilidad de perderla',
      valor: a.probabilidad,
      maximo: 1,
      texto: porcentaje(a.probabilidad),
      tono: TONO_RIESGO[a.riesgo],
      detalle: `${NOMBRE_RIESGO[a.riesgo]}${a.probabilidad_fuente ? ` · ${NOMBRE_FUENTE[a.probabilidad_fuente]}` : ''}`,
    });
  }
  estadisticas.push({
    clave: 'asistencia',
    etiqueta: 'Asistencia',
    valor: e.asistencia.porcentaje ?? 0,
    maximo: 100,
    texto: e.asistencia.porcentaje === null ? 'Sin registros' : pct(e.asistencia.porcentaje),
    tono: tonoDeProporcion(e.asistencia.porcentaje),
    detalle: e.asistencia.registros === 0 ? 'Aún no hay planillas de asistencia de esta asignatura.' : `${e.asistencia.fallas} de ${e.asistencia.registros} clases con falla sin excusa.`,
  });
  estadisticas.push({
    clave: 'actividades',
    etiqueta: 'Cumplimiento de actividades',
    valor: e.actividades.porcentaje ?? 0,
    maximo: 100,
    texto: e.actividades.porcentaje === null ? 'Sin actividades' : pct(e.actividades.porcentaje),
    tono: tonoDeProporcion(e.actividades.porcentaje),
    detalle: e.actividades.vencidas === 0 ? 'Aún no hay actividades con entrega vencidas.' : `Entregó ${e.actividades.entregadas} de ${e.actividades.vencidas} actividades vencidas.`,
  });
  if (a.nota !== null) {
    estadisticas.push({
      clave: 'nota',
      etiqueta: 'Nota actual',
      valor: a.nota - escala.minima,
      maximo: escala.maxima - escala.minima,
      texto: `${nota(a.nota, decimales)} de ${nota(escala.maxima, decimales)}`,
      tono: tonoDeNota(a.nota, escala.aprobatoria),
      detalle: `Aprueba con ${nota(escala.aprobatoria, decimales)}.${a.tendencia ? ` ${TEXTO_TENDENCIA[a.tendencia]}.` : ''}`,
    });
  }

  const periodos: FilaBarra[] = e.periodos.map((p) => ({
    clave: String(p.periodo),
    etiqueta: `Periodo ${p.periodo}`,
    valor: p.nota === null ? 0 : p.nota - escala.minima,
    maximo: escala.maxima - escala.minima,
    texto: p.exento ? 'Exento' : p.nota !== null ? nota(p.nota, decimales) : p.periodo === periodoActual ? 'En curso' : p.cerrado ? 'Sin nota' : 'Por cursar',
    tono: tonoDeNota(p.nota, escala.aprobatoria),
  }));

  const historial: FilaBarra[] = e.historial.map((h) => ({
    clave: String(h.year),
    etiqueta: `${h.year}${h.misma ? '' : ' (promedio del área)'}`,
    valor: h.normalizada,
    maximo: 1,
    texto: `${h.nota.toLocaleString('es-CO', { maximumFractionDigits: 2 })}${h.perdida ? ' · perdida' : ''}`,
    tono: h.perdida ? 'red' : h.normalizada >= 0.7 ? 'green' : 'orange',
  }));

  return (
    <Drawer open title={a.nombre} subtitle={`${analisis.estudiante.nombre} ${analisis.estudiante.apellido} · Grupo ${analisis.estudiante.grupo}`} onClose={onClose} size="lg">
      <div className="flex flex-wrap items-center gap-2">
        <Desempeno nivel={a.nivel} etiqueta={a.desempeno} />
        {conProbabilidad && a.riesgo && <Chip tone={TONO_RIESGO[a.riesgo]}>{NOMBRE_RIESGO[a.riesgo]}</Chip>}
      </div>

      <div className="rounded-xl bg-soft p-4">
        <p className="text-xs text-muted">{necesita.etiqueta}</p>
        {necesita.valor !== null ? (
          <>
            <p className="text-h2 text-ink">{necesita.valor}</p>
            <p className="text-sm text-body">{necesita.detalle}</p>
          </>
        ) : (
          <p className="text-body font-medium text-ink">{necesita.detalle}</p>
        )}
      </div>

      <Seccion titulo="Estadísticas">
        <BarrasHorizontales filas={estadisticas} vacio="Aún no hay estadísticas." />
      </Seccion>

      <Seccion titulo="Notas por periodo">
        <BarrasHorizontales filas={periodos} vacio="El año no tiene periodos." />
      </Seccion>

      <Seccion titulo="Años anteriores">
        <BarrasHorizontales filas={historial} vacio="No hay cierres de años anteriores en el colegio para esta asignatura." />
      </Seccion>

      <Seccion titulo="FODA de la asignatura">
        <FodaCuadrantes foda={a.foda} compacto />
      </Seccion>
    </Drawer>
  );
}
