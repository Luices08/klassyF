import { type FormEvent, useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import {
  type AccionPazYSalvoSalida,
  type DependenciaPazYSalvo,
  type EstadoPazYSalvoSalida,
  MAX_LONGITUD_MOTIVO_SALIDA,
  NOMBRES_ACCION_PAZ_Y_SALVO_SALIDA,
  NOMBRES_ESTADO_PAZ_Y_SALVO_SALIDA,
  type PazYSalvoSalida,
  useActuarSobreDependencia,
} from '../../hooks/useSalidas';
import { formatoFechaHora } from '../../lib/fechas';
import { Alert, errorMessage } from '../ui/Alert';
import { Chip, type Tone } from '../ui/Badge';
import { Button } from '../ui/Button';
import { Card } from '../ui/Card';
import { Drawer } from '../ui/Drawer';
import { Textarea } from '../ui/Field';
import { LineaTiempo } from '../ui/LineaTiempo';
import { EmptyRow, Table, TableBody, TableHead, Td, Th } from '../ui/Table';

export const TONO_ESTADO_PAZ_Y_SALVO_SALIDA: Record<EstadoPazYSalvoSalida, Tone> = {
  PENDIENTE: 'orange',
  BLOQUEADO: 'red',
  APROBADO: 'green',
};

export function EstadoPazYSalvoSalidaChip({ estado }: { estado: EstadoPazYSalvoSalida }) {
  return <Chip tone={TONO_ESTADO_PAZ_Y_SALVO_SALIDA[estado]}>{NOMBRES_ESTADO_PAZ_Y_SALVO_SALIDA[estado]}</Chip>;
}

type AccionElegible = Exclude<AccionPazYSalvoSalida, 'APERTURA'>;

const TITULO_ACCION: Record<AccionElegible, string> = {
  APROBACION: 'Aprobar dependencia',
  BLOQUEO: 'Bloquear por deuda o material',
  EXCEPCION: 'Autorizar excepción',
  ANULACION: 'Anular la aprobación',
};

const ETIQUETA_MOTIVO: Record<AccionElegible, string> = {
  APROBACION: 'Observación (opcional)',
  BLOQUEO: 'Qué deuda o material está pendiente',
  EXCEPCION: 'Motivo de la excepción',
  ANULACION: 'Motivo de la anulación',
};

/**
 * Matriz de paz y salvo de salida (M26): una fila por dependencia del colegio con su estado. Aprobar y bloquear lo hace quien verifica;
 * la excepción (aprobar pese a una deuda) y anular una aprobación son solo de Rectoría y Secretaría, y todo queda en el historial.
 */
export function MatrizPazYSalvoSalida({ enrollmentId, pazYSalvo }: { enrollmentId: string; pazYSalvo: PazYSalvoSalida }) {
  const { user } = useAuth();
  const puedeAutorizar = user?.rol === 'ADMIN' || user?.rol === 'SECRETARIA';
  const actuar = useActuarSobreDependencia();
  const [accion, setAccion] = useState<{ dependencia: DependenciaPazYSalvo; accion: AccionElegible } | null>(null);
  const [historial, setHistorial] = useState<DependenciaPazYSalvo | null>(null);
  const [motivo, setMotivo] = useState('');

  function abrir(dependencia: DependenciaPazYSalvo, a: AccionElegible) {
    actuar.reset();
    setMotivo('');
    setAccion({ dependencia, accion: a });
  }

  async function confirmar(e: FormEvent) {
    e.preventDefault();
    if (!accion) return;
    await actuar.mutateAsync({ enrollmentId, clave: accion.dependencia.clave, accion: accion.accion, motivo: motivo.trim() || undefined });
    setAccion(null);
  }

  const pendientes = pazYSalvo.dependencias.filter((d) => d.estado !== 'APROBADO').length;

  return (
    <div className="space-y-4">
      {pazYSalvo.sin_dependencias ? (
        <Alert tone="info">El colegio no tenía dependencias activas al registrar la salida: no hay nada que verificar. Las dependencias se configuran en «Certificados → Paz y salvo».</Alert>
      ) : (
        <Alert tone={pazYSalvo.estado === 'APROBADO' ? 'success' : pazYSalvo.estado === 'BLOQUEADO' ? 'error' : 'warning'}>
          Paz y salvo: <strong>{NOMBRES_ESTADO_PAZ_Y_SALVO_SALIDA[pazYSalvo.estado]}</strong>
          {pendientes > 0 ? ` · faltan ${pendientes} de ${pazYSalvo.dependencias.length} dependencias. Los documentos de salida no se expiden hasta que todas queden aprobadas.` : '. Ya se pueden expedir los documentos de salida.'}
        </Alert>
      )}

      {!pazYSalvo.sin_dependencias && (
        <Table>
          <TableHead>
            <tr>
              <Th>Dependencia</Th>
              <Th>Estado</Th>
              <Th>Detalle</Th>
              <Th>Revisó</Th>
              <Th>Acciones</Th>
            </tr>
          </TableHead>
          <TableBody>
            {pazYSalvo.dependencias.length === 0 && <EmptyRow colSpan={5}>Sin dependencias.</EmptyRow>}
            {pazYSalvo.dependencias.map((d) => (
              <tr key={d.clave}>
                <Td>
                  <span className="font-semibold text-ink">{d.nombre}</span>
                </Td>
                <Td>
                  <div className="space-y-1">
                    <EstadoPazYSalvoSalidaChip estado={d.estado} />
                    {d.excepcion && <span className="block text-xs text-warning">Excepción autorizada</span>}
                  </div>
                </Td>
                <Td>{d.excepcion ? d.excepcion.motivo : d.detalle || <span className="text-muted">—</span>}</Td>
                <Td>
                  {d.excepcion ? d.excepcion.autorizada_por : d.revisado_por ?? <span className="text-muted">—</span>}
                  {d.fecha_revision && <span className="block text-xs text-muted">{formatoFechaHora(d.fecha_revision)}</span>}
                </Td>
                <Td>
                  <div className="flex flex-wrap gap-2">
                    {d.estado !== 'APROBADO' && (
                      <Button type="button" variant="soft-success" onClick={() => abrir(d, 'APROBACION')}>
                        Aprobar
                      </Button>
                    )}
                    {d.estado === 'PENDIENTE' && (
                      <Button type="button" variant="soft-danger" onClick={() => abrir(d, 'BLOQUEO')}>
                        Bloquear
                      </Button>
                    )}
                    {d.estado === 'BLOQUEADO' && puedeAutorizar && (
                      <Button type="button" variant="outline" onClick={() => abrir(d, 'EXCEPCION')}>
                        Excepción
                      </Button>
                    )}
                    {d.estado === 'APROBADO' && puedeAutorizar && (
                      <Button type="button" variant="secondary" onClick={() => abrir(d, 'ANULACION')}>
                        Anular aprobación
                      </Button>
                    )}
                    <Button type="button" variant="secondary" onClick={() => setHistorial(d)}>
                      Historial
                    </Button>
                  </div>
                </Td>
              </tr>
            ))}
          </TableBody>
        </Table>
      )}
      {!puedeAutorizar && !pazYSalvo.sin_dependencias && (
        <p className="text-xs text-muted">La excepción por deuda y la anulación de una aprobación las autorizan solo Rectoría o Secretaría.</p>
      )}

      <Drawer
        open={accion !== null}
        title={accion ? `${TITULO_ACCION[accion.accion]}: ${accion.dependencia.nombre}` : ''}
        onClose={() => setAccion(null)}
        onSubmit={confirmar}
        submitLabel="Confirmar"
        submitVariant={accion?.accion === 'BLOQUEO' || accion?.accion === 'ANULACION' ? 'soft-danger' : 'primary'}
        isSubmitting={actuar.isPending}
        submitDisabled={accion !== null && accion.accion !== 'APROBACION' && motivo.trim().length < 5}
      >
        {actuar.isError && <Alert tone="error">{errorMessage(actuar.error)}</Alert>}
        {accion?.accion === 'EXCEPCION' && <Alert tone="warning">Se aprueba la dependencia aunque la deuda o el material sigan pendientes. Queda a tu nombre en el historial.</Alert>}
        {accion && (
          <Textarea
            label={ETIQUETA_MOTIVO[accion.accion]}
            required={accion.accion !== 'APROBACION'}
            rows={3}
            maxLength={MAX_LONGITUD_MOTIVO_SALIDA}
            value={motivo}
            onChange={(e) => setMotivo(e.target.value)}
          />
        )}
      </Drawer>

      <Drawer open={historial !== null} title={historial ? `Historial: ${historial.nombre}` : ''} onClose={() => setHistorial(null)}>
        {historial && (
          <Card className="border-0 p-0 shadow-none">
            <LineaTiempo
              vacio="Sin movimientos."
              items={[...historial.historial]
                .reverse()
                .map((h, i) => ({
                  key: `${h.fecha}-${i}`,
                  fecha: formatoFechaHora(h.fecha),
                  encabezado: (
                    <>
                      <Chip tone="blue">{NOMBRES_ACCION_PAZ_Y_SALVO_SALIDA[h.accion]}</Chip>
                      <EstadoPazYSalvoSalidaChip estado={h.estado_resultante} />
                    </>
                  ),
                  children: (
                    <>
                      {h.por && <span className="block text-xs text-muted">{h.por}</span>}
                      {h.motivo || <span className="text-muted">Sin observación.</span>}
                    </>
                  ),
                }))}
            />
          </Card>
        )}
      </Drawer>
    </div>
  );
}
