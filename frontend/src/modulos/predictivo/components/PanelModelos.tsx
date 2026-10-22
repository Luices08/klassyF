import { Alert, errorMessage } from '../../../components/ui/Alert';
import { Chip } from '../../../components/ui/Badge';
import { Button } from '../../../components/ui/Button';
import { Card, CardHeader } from '../../../components/ui/Card';
import { RefreshIcon } from '../../../components/ui/icons';
import { Spinner } from '../../../components/ui/Spinner';
import { EmptyRow, Table, TableBody, TableHead, Td, Th } from '../../../components/ui/Table';
import { formatoFechaHora } from '../../../lib/fechas';
import { type Metricas, type VersionModelo, useActivarModelo, useEntrenarModelo, useModelosPredictivos } from '../hooks/usePredictivo';
import { NOMBRE_ESTADO_MODELO, porcentaje, TONO_ESTADO_MODELO } from '../lib/presentacion';

const dos = (v: number | null | undefined): string => (v === null || v === undefined ? '—' : v.toFixed(2));

function ResumenMetricas({ m }: { m: Metricas }) {
  return (
    <span className="text-sm text-body">
      AUC {dos(m.auc)} · Brier {m.brier.toFixed(3)} (sin modelo {m.brier_referencia.toFixed(3)}) · acierta {porcentaje(m.exactitud)} · detecta {porcentaje(m.sensibilidad)} de
      las perdidas
    </span>
  );
}

function FilaVersion({ m, onActivar, activando }: { m: VersionModelo; onActivar: () => void; activando: boolean }) {
  const detalle = m.motivo_rechazo ?? m.error;
  return (
    <tr>
      <Td className="font-semibold text-ink">v{m.version}</Td>
      <Td>
        <div className="flex flex-wrap gap-1">
          <Chip tone={TONO_ESTADO_MODELO[m.estado]}>{NOMBRE_ESTADO_MODELO[m.estado]}</Chip>
          {m.activo && <Chip tone="blue">En uso</Chip>}
          {m.es_demostracion && m.estado === 'LISTO' && <Chip tone="orange">Demostración</Chip>}
          {!m.vigente && <Chip>Entradas anteriores</Chip>}
        </div>
        {detalle && <p className="mt-1 max-w-sm text-xs text-muted">{detalle}</p>}
      </Td>
      <Td>
        {m.anios_usados.length > 0 ? m.anios_usados.join(', ') : '—'}
        {m.criterio_prueba && (
          <p className="text-xs text-muted">Probado con {m.criterio_prueba === 'ANIO' ? `el año ${m.anio_prueba}` : 'estudiantes apartados'}</p>
        )}
      </Td>
      <Td>{m.metricas ? <ResumenMetricas m={m.metricas} /> : '—'}</Td>
      <Td className="whitespace-nowrap text-sm">{formatoFechaHora(m.createdAt)}</Td>
      <Td>
        {m.estado === 'LISTO' && !m.activo && m.vigente && (
          <Button variant="soft-edit" onClick={onActivar} isLoading={activando}>
            Usar esta versión
          </Button>
        )}
      </Td>
    </tr>
  );
}

/**
 * Entrenar la IA y sus versiones (solo ADMIN). Entrenar corre en segundo plano en el servidor; mientras tanto la lista se refresca sola.
 * Una versión nueva solo reemplaza a la que está en uso si pasa la prueba con años que no vio.
 */
export function PanelModelos() {
  const { data, isLoading, isError, error } = useModelosPredictivos();
  const entrenar = useEntrenarModelo();
  const activar = useActivarModelo();

  if (isLoading) return <Spinner />;
  if (isError || !data) return <Alert tone="error">{errorMessage(error)}</Alert>;
  const enUso = data.modelos.find((m) => m.activo);

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader
          title="Entrenar la IA"
          subtitle="Aprende de los años ya cerrados del colegio (notas, entregas, asistencia y convivencia) y se prueba con un año que no vio."
          action={
            <Button onClick={() => entrenar.mutate()} isLoading={entrenar.isPending} disabled={data.en_cola}>
              <RefreshIcon className="h-4 w-4" aria-hidden />
              Entrenar ahora
            </Button>
          }
        />
        <div className="space-y-2">
          {data.en_cola && <Alert tone="info">Hay un entrenamiento en curso. Puede tardar unos minutos; esta lista se actualiza sola.</Alert>}
          {entrenar.isError && <Alert tone="error">{errorMessage(entrenar.error)}</Alert>}
          {activar.isError && <Alert tone="error">{errorMessage(activar.error)}</Alert>}
          {enUso ? (
            <p className="text-sm text-body">
              En uso: versión {enUso.version}
              {enUso.es_demostracion ? ', marcada como de demostración porque el colegio aún tiene menos de dos años cerrados' : ''}.
            </p>
          ) : data.demostracion.disponible ? (
            <Alert tone="warning">
              Todavía no hay un modelo propio del colegio: se usa el modelo de demostración, entrenado con un colegio simulado. Tómalo como orientación.
            </Alert>
          ) : (
            <Alert tone="warning">Todavía no hay ningún modelo: los análisis muestran las notas y lo que falta, sin el riesgo estimado.</Alert>
          )}
        </div>
      </Card>

      <Table>
        <TableHead>
          <tr>
            <Th>Versión</Th>
            <Th>Estado</Th>
            <Th>Años</Th>
            <Th>Prueba</Th>
            <Th>Solicitada</Th>
            <Th>
              <span className="sr-only">Acciones</span>
            </Th>
          </tr>
        </TableHead>
        <TableBody>
          {data.modelos.length === 0 && <EmptyRow colSpan={6}>Aún no se ha entrenado ninguna versión.</EmptyRow>}
          {data.modelos.map((m) => (
            <FilaVersion key={m._id} m={m} onActivar={() => activar.mutate(m._id)} activando={activar.isPending && activar.variables === m._id} />
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
