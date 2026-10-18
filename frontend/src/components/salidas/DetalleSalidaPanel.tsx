import { useState } from 'react';
import {
  abrirSoporteSalida,
  type BoletinRetiro,
  cargarPdfBoletinRetiro,
  type DetalleSalida,
  MAX_BYTES_SOPORTE_SALIDA,
  NOMBRES_POLITICA_CUPO_SALIDA,
  useBoletinRetiro,
  useCargarSoporteSalida,
} from '../../hooks/useSalidas';
import { formatoFechaCalendario } from '../../lib/fechas';
import { Alert, errorMessage } from '../ui/Alert';
import { Chip } from '../ui/Badge';
import { Button } from '../ui/Button';
import { Card, CardHeader } from '../ui/Card';
import { Dropzone } from '../ui/Dropzone';
import { LineaTiempo } from '../ui/LineaTiempo';
import { Spinner } from '../ui/Spinner';
import { EmptyRow, Table, TableBody, TableHead, Td, Th } from '../ui/Table';
import { TabPanel, Tabs } from '../ui/Tabs';
import { VistaPreviaPdf } from '../ui/VistaPreviaPdf';
import { EstadoPazYSalvoSalidaChip, MatrizPazYSalvoSalida } from './MatrizPazYSalvoSalida';

const Dato = ({ etiqueta, children }: { etiqueta: string; children: React.ReactNode }) => (
  <div>
    <dt className="text-xs text-muted">{etiqueta}</dt>
    <dd className="text-sm text-ink">{children}</dd>
  </div>
);

function kb(bytes: number): string {
  return bytes < 1024 * 1024 ? `${Math.max(1, Math.round(bytes / 1024))} KB` : `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

function DatosYSoportes({ detalle }: { detalle: DetalleSalida }) {
  const cargar = useCargarSoporteSalida();
  const [archivo, setArchivo] = useState<File | null>(null);
  const salida = detalle.salida;

  async function subir() {
    if (!archivo) return;
    await cargar.mutateAsync({ enrollmentId: detalle.enrollment_id, file: archivo });
    setArchivo(null);
  }

  return (
    <div className="space-y-4">
      {detalle.faltantes.length > 0 && (
        <Alert tone="warning">
          Falta para dejar completo el registro:
          <ul className="ml-4 list-disc">
            {detalle.faltantes.map((f) => (
              <li key={f}>{f}</li>
            ))}
          </ul>
        </Alert>
      )}
      {detalle.legado && (
        <Alert tone="info">Este retiro se registró antes de existir fecha efectiva y soportes. Solo se conserva el motivo: «{detalle.motivo_legado}».</Alert>
      )}

      {salida && (
        <Card>
          <CardHeader title="Datos de la salida" />
          <dl className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <Dato etiqueta="Tipo">{salida.nombre_tipo}</Dato>
            <Dato etiqueta="Fecha efectiva">{formatoFechaCalendario(salida.fecha_efectiva)}</Dato>
            <Dato etiqueta="Registrado por">{salida.registrado_por}</Dato>
            <Dato etiqueta="Motivo">{salida.motivo}</Dato>
            {salida.institucion_receptora && (
              <Dato etiqueta="Institución receptora">
                {salida.institucion_receptora.nombre}
                {(salida.institucion_receptora.municipio || salida.institucion_receptora.codigo_dane) && (
                  <span className="block text-xs text-muted">{[salida.institucion_receptora.municipio, salida.institucion_receptora.codigo_dane && `DANE ${salida.institucion_receptora.codigo_dane}`].filter(Boolean).join(' · ')}</span>
                )}
              </Dato>
            )}
            {salida.observaciones && <Dato etiqueta="Observaciones">{salida.observaciones}</Dato>}
            <Dato etiqueta="Cupo del grupo">
              {salida.cupo_liberado ? (
                <Chip tone="green">Liberado{salida.fecha_cupo_liberado ? ` el ${formatoFechaCalendario(salida.fecha_cupo_liberado)}` : ''}</Chip>
              ) : (
                <Chip tone="orange">Pendiente de liberar</Chip>
              )}
              <span className="mt-1 block text-xs text-muted">Política del colegio: {NOMBRES_POLITICA_CUPO_SALIDA[detalle.politica_cupo].toLowerCase()}.</span>
            </Dato>
          </dl>
        </Card>
      )}

      {salida && (
        <Card>
          <CardHeader title="Soporte documental" subtitle="Carta de retiro, solicitud del acudiente, constancia de la institución receptora… (PDF o imagen)." />
          <ul className="mb-4 divide-y divide-border">
            {salida.soportes.length === 0 && <li className="py-2 text-sm text-muted">Aún no hay soportes cargados.</li>}
            {salida.soportes.map((s) => (
              <li key={s._id} className="flex items-center justify-between gap-3 py-2 text-sm">
                <span>
                  <span className="font-semibold text-ink">{s.nombre}</span>
                  <span className="block text-xs text-muted">
                    {kb(s.tamano)} · {formatoFechaCalendario(s.fecha)}
                  </span>
                </span>
                <Button type="button" variant="secondary" onClick={() => void abrirSoporteSalida(detalle.enrollment_id, s._id)}>
                  Ver
                </Button>
              </li>
            ))}
          </ul>
          {cargar.isError && <Alert tone="error">{errorMessage(cargar.error)}</Alert>}
          <Dropzone extensiones={['.pdf', '.jpg', '.jpeg', '.png', '.webp']} maxBytes={MAX_BYTES_SOPORTE_SALIDA} file={archivo} onFile={setArchivo} hint="PDF, JPG, PNG o WEBP · máximo 5 MB" etiqueta="Soporte de la salida" />
          <div className="mt-3 flex justify-end">
            <Button type="button" disabled={!archivo} isLoading={cargar.isPending} onClick={() => void subir()}>
              Cargar soporte
            </Button>
          </div>
        </Card>
      )}
    </div>
  );
}

function TablaBoletin({ boletin }: { boletin: BoletinRetiro }) {
  return (
    <div className="space-y-3">
      {boletin.advertencias.map((a) => (
        <Alert key={a} tone="warning">
          {a}
        </Alert>
      ))}
      <Table>
        <TableHead>
          <tr>
            <Th>Asignatura</Th>
            {boletin.periodos.map((p) => (
              <Th key={p.numero}>{p.nombre}</Th>
            ))}
            {boletin.periodo_corte && <Th>{boletin.periodo_corte.nombre} (corte)</Th>}
            <Th>Acumulado</Th>
          </tr>
        </TableHead>
        <TableBody>
          {boletin.asignaturas.length === 0 && <EmptyRow colSpan={boletin.periodos.length + 3}>Sin asignaturas en el plan del grupo.</EmptyRow>}
          {boletin.asignaturas.map((a) => (
            <tr key={a.subject_id}>
              <Td>
                <span className="font-semibold text-ink">{a.nombre}</span>
                <span className="block text-xs text-muted">{a.area}</span>
              </Td>
              {a.notas.map((n) => (
                <Td key={n.periodo}>{n.nota === null ? <span className="text-muted">{n.estado === 'EXENTA_POR_TRASLADO' ? 'E' : '—'}</span> : n.nota.toFixed(2)}</Td>
              ))}
              {boletin.periodo_corte && <Td>{a.corte?.nota == null ? <span className="text-muted">—</span> : `${a.corte.nota.toFixed(2)} (parcial)`}</Td>}
              <Td>{a.acumulado === null ? <span className="text-muted">—</span> : <strong>{a.acumulado.toFixed(2)}</strong>}</Td>
            </tr>
          ))}
        </TableBody>
      </Table>
      <p className="text-sm text-body">
        Promedio acumulado: <strong>{boletin.promedio_acumulado === null ? 'sin calcular (faltan notas oficiales)' : boletin.promedio_acumulado.toFixed(2)}</strong>
      </p>
    </div>
  );
}

function BoletinParcial({ detalle, activo }: { detalle: DetalleSalida; activo: boolean }) {
  const boletin = useBoletinRetiro(detalle.enrollment_id, activo);
  const [verPdf, setVerPdf] = useState(false);

  if (boletin.isLoading) return <Spinner />;
  if (boletin.error) return <Alert tone="error">{errorMessage(boletin.error)}</Alert>;
  if (!boletin.data) return null;

  return (
    <div className="space-y-4">
      <Alert tone="info">
        Solo cuentan las definitivas oficiales de los periodos ya cerrados. Las notas del periodo en curso aparecen como corte provisional únicamente si el SIEE del colegio lo permite (Configuración del boletín).
      </Alert>
      <TablaBoletin boletin={boletin.data} />
      {verPdf ? (
        <VistaPreviaPdf
          claveConsulta={['boletin-retiro', detalle.enrollment_id]}
          cargar={() => cargarPdfBoletinRetiro(detalle.enrollment_id)}
          nombreArchivo={`boletin-retiro-${detalle.estudiante.numero_documento}.pdf`}
          titulo="Boletín parcial de retiro"
          onCerrar={() => setVerPdf(false)}
        />
      ) : (
        <Button type="button" variant="outline" onClick={() => setVerPdf(true)}>
          Ver boletín en PDF
        </Button>
      )}
    </div>
  );
}

function Conservado({ detalle }: { detalle: DetalleSalida }) {
  const c = detalle.conservado;
  return (
    <div className="space-y-4">
      <Alert tone="info">Nada de lo registrado a nombre del estudiante se borra al salir: sigue disponible para boletines, certificados y estadísticas. Solo deja de aparecer en las listas del aula.</Alert>
      <Card>
        <CardHeader title="Registros que se conservan" />
        <dl className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          <Dato etiqueta="Notas por asignatura">{c.notas_asignatura}</Dato>
          <Dato etiqueta="Registros de asistencia">{c.registros_asistencia}</Dato>
          <Dato etiqueta="Entregas de actividades">{c.entregas}</Dato>
          <Dato etiqueta="Asistencia posterior a la salida">{c.asistencia_posterior_a_la_salida}</Dato>
        </dl>
        {c.asistencia_posterior_a_la_salida > 0 && (
          <p className="mt-3 text-xs text-muted">Esos registros posteriores a la fecha efectiva se guardan pero no cuentan en el boletín ni en las estadísticas del estudiante.</p>
        )}
      </Card>
      <Card>
        <CardHeader title="Paso por el Libro de Matrícula" subtitle="Cada cambio de grupo y la salida quedan con sus fechas." />
        <dl className="mb-4 grid grid-cols-2 gap-4 sm:grid-cols-4">
          <Dato etiqueta="Folio">{detalle.libro.folio ?? '—'}</Dato>
          <Dato etiqueta="Libro / folio">
            {detalle.libro.numero_libro ?? '—'} / {detalle.libro.numero_folio ?? '—'}
          </Dato>
          <Dato etiqueta="Tipo de ingreso">{detalle.libro.tipo_ingreso}</Dato>
          <Dato etiqueta="Matriculado">{formatoFechaCalendario(detalle.libro.fecha_matricula)}</Dato>
        </dl>
        <LineaTiempo
          vacio="Sin tramos registrados."
          items={[...detalle.trayectoria].reverse().map((t, i) => ({
            key: `${t.desde}-${i}`,
            fecha: `${formatoFechaCalendario(t.desde)} – ${t.hasta ? formatoFechaCalendario(t.hasta) : 'hoy'}`,
            children: <span>Grupo {t.grupo}</span>,
          }))}
        />
      </Card>
    </div>
  );
}

/** Todo lo de una salida en un solo lugar: datos y soportes, paz y salvo, boletín parcial y lo que se conserva. */
export function DetalleSalidaPanel({ detalle }: { detalle: DetalleSalida }) {
  const [pestana, setPestana] = useState('datos');
  const items = [
    { key: 'datos', label: 'Datos y soporte' },
    { key: 'paz', label: 'Paz y salvo' },
    { key: 'boletin', label: 'Boletín parcial' },
    { key: 'historia', label: 'Historia conservada' },
  ];
  return (
    <div className="space-y-4">
      <Card>
        <div className="flex flex-wrap items-center gap-x-6 gap-y-1 text-sm">
          <span className="text-h3 text-ink">
            {detalle.estudiante.apellido}, {detalle.estudiante.nombre}
          </span>
          <span className="text-muted">
            {detalle.estudiante.numero_documento} · {detalle.grupo.nombre} · {detalle.grupo.sede} · {detalle.grupo.jornada} · {detalle.anio.year}
          </span>
          {detalle.salida && <Chip tone={detalle.salida.tipo === 'TRASLADO' ? 'blue' : 'neutral'}>{detalle.salida.nombre_tipo}</Chip>}
          <EstadoPazYSalvoSalidaChip estado={detalle.paz_y_salvo.estado} />
        </div>
      </Card>
      <Tabs items={items} active={pestana} onChange={setPestana} />
      <TabPanel active={pestana} tabKey="datos">
        <DatosYSoportes detalle={detalle} />
      </TabPanel>
      <TabPanel active={pestana} tabKey="paz">
        <MatrizPazYSalvoSalida enrollmentId={detalle.enrollment_id} pazYSalvo={detalle.paz_y_salvo} />
      </TabPanel>
      <TabPanel active={pestana} tabKey="boletin">
        <BoletinParcial detalle={detalle} activo={pestana === 'boletin'} />
      </TabPanel>
      <TabPanel active={pestana} tabKey="historia">
        <Conservado detalle={detalle} />
      </TabPanel>
    </div>
  );
}
