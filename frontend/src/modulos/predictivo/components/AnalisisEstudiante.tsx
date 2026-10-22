import { useState } from 'react';
import { Alert } from '../../../components/ui/Alert';
import { Chip, type Tone } from '../../../components/ui/Badge';
import { Button } from '../../../components/ui/Button';
import { Card, CardHeader } from '../../../components/ui/Card';
import { ProgressBar } from '../../../components/ui/ProgressBar';
import type { NivelDesempeno } from '../../../types/domain';
import type { AnalisisEstudiante as Analisis, AsignaturaAnalizada, RiesgoPromocion } from '../hooks/usePredictivo';
import { NOMBRE_RIESGO, nota, ordenarAsignaturas, porcentaje, textoCorte, textoNotaRequerida, TONO_RIESGO } from '../lib/presentacion';
import { FodaCuadrantes } from './FodaCuadrantes';

const TONO_DESEMPENO: Record<NivelDesempeno, Tone> = { SUPERIOR: 'green', ALTO: 'blue', BASICO: 'orange', BAJO: 'red' };

function Desempeno({ nivel, etiqueta }: { nivel: NivelDesempeno | null; etiqueta: string | null }) {
  if (!nivel || !etiqueta) return null;
  return <Chip tone={TONO_DESEMPENO[nivel]}>{etiqueta}</Chip>;
}

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

function TarjetaAsignatura({ a, conProbabilidad, decimales }: { a: AsignaturaAnalizada; conProbabilidad: boolean; decimales: number }) {
  const [abierta, setAbierta] = useState(false);
  const requerida = textoNotaRequerida(a.nota_requerida, decimales);
  return (
    <Card>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <h3 className="text-h3 text-ink">{a.nombre}</h3>
          <div className="mt-1 flex flex-wrap items-center gap-2 text-sm text-body">
            <span>{a.nota === null ? 'Sin nota cerrada' : `Nota: ${nota(a.nota, decimales)}`}</span>
            <Desempeno nivel={a.nivel} etiqueta={a.desempeno} />
            <Chip tone={requerida.tono}>{requerida.texto}</Chip>
            {conProbabilidad && a.riesgo && (
              <Chip tone={TONO_RIESGO[a.riesgo]}>
                {NOMBRE_RIESGO[a.riesgo]} de perderla · {porcentaje(a.probabilidad)}
              </Chip>
            )}
          </div>
        </div>
        <Button variant="secondary" onClick={() => setAbierta((v) => !v)} aria-expanded={abierta}>
          {abierta ? 'Ocultar FODA' : 'Ver FODA'}
        </Button>
      </div>
      {abierta && (
        <div className="mt-4">
          <FodaCuadrantes foda={a.foda} compacto />
        </div>
      )}
    </Card>
  );
}

/**
 * El análisis de un estudiante. Lo que se ve lo decidió el servidor: al estudiante y a la familia no les llegan la probabilidad ni
 * el riesgo, así que esta vista solo los dibuja si vienen.
 */
export function AnalisisEstudiante({ analisis, paraFamilia = false }: { analisis: Analisis; paraFamilia?: boolean }) {
  const conProbabilidad = analisis.ve.probabilidad;
  const { general } = analisis;
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
        <Alert tone="info">Sin datos suficientes: todavía no hay periodos cerrados en este año ni notas del año anterior para analizar.</Alert>
      ) : (
        <>
          <div className={`grid grid-cols-1 gap-4 ${conProbabilidad && general.riesgo ? 'lg:grid-cols-2' : ''}`}>
            <Card>
              <CardHeader title="Resumen del año" />
              <div className="flex flex-wrap items-center gap-3 text-body">
                <span className="text-h2 text-ink">{general.promedio ?? '—'}</span>
                <Desempeno nivel={general.nivel} etiqueta={general.desempeno} />
              </div>
              <p className="mt-2 text-sm text-body">
                {general.asignaturas_perdiendo === 0
                  ? 'No va perdiendo ninguna asignatura.'
                  : `Va perdiendo ${general.asignaturas_perdiendo} ${general.asignaturas_perdiendo === 1 ? 'asignatura' : 'asignaturas'}.`}
              </p>
            </Card>
            {conProbabilidad && general.riesgo && (
              <Card>
                <CardHeader title="Cómo podría terminar el año" subtitle="Estimación del modelo con la política de promoción del colegio." />
                <RiesgoDePromocion riesgo={general.riesgo} />
              </Card>
            )}
          </div>

          <Card>
            <CardHeader title="FODA general" />
            <FodaCuadrantes foda={analisis.foda} />
          </Card>
        </>
      )}

      {analisis.asignaturas.length > 0 && (
        <div className="space-y-3">
          <h3 className="text-h3 text-ink">Asignaturas</h3>
          {ordenarAsignaturas(analisis.asignaturas, conProbabilidad).map((a) => (
            <TarjetaAsignatura key={a.subject_id} a={a} conProbabilidad={conProbabilidad} decimales={analisis.decimales} />
          ))}
        </div>
      )}
    </div>
  );
}
