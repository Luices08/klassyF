import { type FormEvent, useState } from 'react';
import {
  type DetalleCitacion,
  MAX_MOTIVO_CANCELACION,
  NOMBRES_ESTADO_CITACION,
  useCancelarCitacion,
  useMarcarRealizada,
  useReenviarCorreoCitacion,
} from '../../hooks/useCitaciones';
import { formatoFechaHora } from '../../lib/fechas';
import { Alert, errorMessage } from '../ui/Alert';
import { Button } from '../ui/Button';
import { Card } from '../ui/Card';
import { Drawer } from '../ui/Drawer';
import { Textarea } from '../ui/Field';
import { EmptyRow, Table, TableBody, TableHead, Td, Th } from '../ui/Table';
import { CorreoChip, EstadoCitacionChip, RespuestaChip } from './chipsCitacion';

interface Props {
  detalle: DetalleCitacion;
  onEditar: () => void;
}

/** Una citación con la respuesta de cada acudiente y el estado de su correo. Desde aquí se edita, se cancela, se marca realizada y se reenvía un correo. */
export function DetalleCitacionPanel({ detalle, onEditar }: Props) {
  const cancelar = useCancelarCitacion();
  const realizada = useMarcarRealizada();
  const reenviar = useReenviarCorreoCitacion();
  const [cancelando, setCancelando] = useState(false);
  const [motivo, setMotivo] = useState('');

  const confirmados = detalle.destinatarios.filter((d) => d.respuesta === 'CONFIRMADA').length;
  const noAsisten = detalle.destinatarios.filter((d) => d.respuesta === 'NO_ASISTIRA').length;
  const pendientes = detalle.destinatarios.length - confirmados - noAsisten;
  const accionError = cancelar.error ?? realizada.error ?? reenviar.error;

  async function confirmarCancelacion(e: FormEvent) {
    e.preventDefault();
    await cancelar.mutateAsync({ id: detalle._id, motivo: motivo.trim() });
    setCancelando(false);
    setMotivo('');
  }

  return (
    <div className="space-y-4">
      {detalle.advertencia_correo && <Alert tone="warning">La citación se creó, pero no se enviarán correos: {detalle.advertencia_correo} Los acudientes con portal la ven allí.</Alert>}
      {!detalle.correo_disponible && !detalle.advertencia_correo && detalle.estado === 'PROGRAMADA' && <Alert tone="warning">{detalle.motivo_correo_no_disponible}</Alert>}
      {accionError && <Alert tone="error">{errorMessage(accionError)}</Alert>}
      {detalle.estado === 'CANCELADA' && detalle.cancelacion && (
        <Alert tone="info">
          Cancelada el {formatoFechaHora(detalle.cancelacion.fecha)}. Motivo: {detalle.cancelacion.motivo}
        </Alert>
      )}

      <Card>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-h3 text-ink">{detalle.titulo}</h2>
            <p className="text-sm text-muted">
              {detalle.nombre_motivo} · {detalle.tipo === 'GENERAL' ? `Grupos ${detalle.grupos.join(', ')}` : 'Citación particular'}
            </p>
          </div>
          <EstadoCitacionChip estado={detalle.estado} />
        </div>
        <dl className="mt-3 grid gap-3 text-sm sm:grid-cols-3">
          <div>
            <dt className="text-label text-muted">Fecha y hora</dt>
            <dd className="font-semibold text-ink">{formatoFechaHora(detalle.fecha_hora)}</dd>
          </div>
          <div>
            <dt className="text-label text-muted">Lugar</dt>
            <dd className="font-semibold text-ink">{detalle.lugar}</dd>
          </div>
          <div>
            <dt className="text-label text-muted">Convoca</dt>
            <dd className="font-semibold text-ink">{detalle.convocante}</dd>
          </div>
        </dl>
        {detalle.descripcion && <p className="mt-3 whitespace-pre-line text-sm text-body">{detalle.descripcion}</p>}
        <div className="mt-4 flex flex-wrap items-center gap-2">
          {detalle.puede.editar && (
            <Button variant="soft-edit" onClick={onEditar}>
              Editar
            </Button>
          )}
          {detalle.puede.marcar_realizada && (
            <Button variant="soft-success" onClick={() => realizada.mutate(detalle._id)} disabled={realizada.isPending}>
              Marcar como realizada
            </Button>
          )}
          {detalle.puede.cancelar && (
            <Button variant="soft-danger" onClick={() => { cancelar.reset(); setCancelando(true); }}>
              Cancelar citación
            </Button>
          )}
        </div>
      </Card>

      <div className="grid gap-3 sm:grid-cols-3">
        <Card>
          <p className="text-label text-muted">Asistirán</p>
          <p className="text-h2 text-success">{confirmados}</p>
        </Card>
        <Card>
          <p className="text-label text-muted">No asistirán</p>
          <p className="text-h2 text-danger">{noAsisten}</p>
        </Card>
        <Card>
          <p className="text-label text-muted">Sin responder</p>
          <p className="text-h2 text-ink">{pendientes}</p>
        </Card>
      </div>

      <Table>
        <TableHead>
          <tr>
            <Th>Estudiante</Th>
            <Th>Acudiente</Th>
            <Th>Respuesta</Th>
            <Th>Correo</Th>
            <Th>Acciones</Th>
          </tr>
        </TableHead>
        <TableBody>
          {detalle.destinatarios.length === 0 && <EmptyRow colSpan={5}>Sin acudientes.</EmptyRow>}
          {detalle.destinatarios.map((d) => (
            <tr key={d._id}>
              <Td>
                <span className="block font-semibold text-ink">
                  {d.estudiante.apellido}, {d.estudiante.nombre}
                </span>
                <span className="block text-xs text-muted">{d.estudiante.numero_documento}</span>
              </Td>
              <Td>
                {d.acudiente}
                <span className="block text-xs text-muted">{d.email || 'Sin correo'}{d.tiene_portal ? ' · con portal' : ''}</span>
              </Td>
              <Td>
                <RespuestaChip respuesta={d.respuesta} />
                {d.respondida_en && (
                  <span className="mt-1 block text-xs text-muted">
                    {formatoFechaHora(d.respondida_en)} · {d.canal_respuesta === 'CORREO' ? 'desde el correo' : 'desde el portal'}
                  </span>
                )}
              </Td>
              <Td>
                <CorreoChip situacion={d.correo} />
                {d.error_correo && <span className="mt-1 block text-xs text-danger">{d.error_correo}</span>}
              </Td>
              <Td>
                {detalle.puede.reenviar && d.email && (d.correo === 'FALLIDO' || d.correo === 'NO_ENVIADO' || d.correo === 'ENVIADO') && (
                  <Button variant="secondary" disabled={reenviar.isPending || !detalle.correo_disponible} onClick={() => reenviar.mutate({ id: detalle._id, destinatarioId: d._id })}>
                    {d.correo === 'ENVIADO' ? 'Reenviar' : 'Enviar'}
                  </Button>
                )}
              </Td>
            </tr>
          ))}
        </TableBody>
      </Table>
      <p className="text-xs text-muted">
        Estado de la citación: {NOMBRES_ESTADO_CITACION[detalle.estado].toLowerCase()}. Los correos salen en segundo plano: no hace falta esperar a que terminen.
      </p>

      <Drawer
        open={cancelando}
        title="Cancelar citación"
        subtitle="Se avisa por correo a quienes ya habían recibido la invitación, y a los acudientes con portal en su campanita."
        onClose={() => setCancelando(false)}
        onSubmit={confirmarCancelacion}
        submitLabel="Cancelar citación"
        submitVariant="soft-danger"
        isSubmitting={cancelar.isPending}
        submitDisabled={motivo.trim().length < 5}
      >
        {cancelar.isError && <Alert tone="error">{errorMessage(cancelar.error)}</Alert>}
        <Textarea label="Motivo de la cancelación" required rows={3} maxLength={MAX_MOTIVO_CANCELACION} value={motivo} onChange={(e) => setMotivo(e.target.value)} hint="Los acudientes lo leen en el aviso." />
      </Drawer>
    </div>
  );
}
