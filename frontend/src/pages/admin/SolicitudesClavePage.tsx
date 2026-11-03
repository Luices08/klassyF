import { useState } from 'react';
import { Alert, errorMessage } from '../../components/ui/Alert';
import { RolBadge } from '../../components/ui/Badge';
import { Button } from '../../components/ui/Button';
import { Card } from '../../components/ui/Card';
import { Drawer } from '../../components/ui/Drawer';
import { Input } from '../../components/ui/Field';
import { FiltrosRapidos } from '../../components/ui/FiltrosRapidos';
import { IconButton } from '../../components/ui/IconButton';
import { PageHeader } from '../../components/ui/PageHeader';
import { Spinner } from '../../components/ui/Spinner';
import { EmptyRow, Table, TableBody, TableHead, Td, Th } from '../../components/ui/Table';
import { CheckCircleIcon, XCircleIcon } from '../../components/ui/icons';
import {
  type SolicitudClave,
  type VistaSolicitudClave,
  useAprobarSolicitudClave,
  useRechazarSolicitudClave,
  useSolicitudesClave,
} from '../../hooks/useRecuperacionClave';
import { formatoFechaHora } from '../../lib/fechas';

/** Quién pidió una clave nueva y aún no la tiene. Se atiende en persona: la secretaría verifica a la persona y entrega la clave temporal. */
export function SolicitudesClavePage() {
  const [vista, setVista] = useState<VistaSolicitudClave>('PENDIENTES');
  const lista = useSolicitudesClave(vista);
  const aprobar = useAprobarSolicitudClave();
  const rechazar = useRechazarSolicitudClave();

  const [aprobando, setAprobando] = useState<SolicitudClave | null>(null);
  const [rechazando, setRechazando] = useState<SolicitudClave | null>(null);
  const [motivo, setMotivo] = useState('');
  const [claveEntregada, setClaveEntregada] = useState<{ nombre: string; documento: string; clave: string } | null>(null);
  const [copiada, setCopiada] = useState(false);

  async function copiarClave(clave: string) {
    try {
      await navigator.clipboard.writeText(clave);
      setCopiada(true);
    } catch {
      setCopiada(false);
    }
  }

  function cerrarClave() {
    setClaveEntregada(null);
    setCopiada(false);
  }

  function cerrarRechazo() {
    setRechazando(null);
    setMotivo('');
  }

  return (
    <div className="space-y-4">
      <PageHeader
        title="Solicitudes de contraseña"
        subtitle="Personas que olvidaron su contraseña. Verifica quién es antes de aprobar: la clave temporal se muestra una sola vez y la persona deberá cambiarla al entrar."
      />

      {aprobar.isError && <Alert tone="error">{errorMessage(aprobar.error)}</Alert>}
      {rechazar.isError && <Alert tone="error">{errorMessage(rechazar.error)}</Alert>}

      <Card>
        <div className="mb-3">
          <FiltrosRapidos
            ariaLabel="Estado de las solicitudes"
            valor={vista}
            onChange={(k) => setVista(k as VistaSolicitudClave)}
            items={[
              { clave: 'PENDIENTES', etiqueta: 'Pendientes' },
              { clave: 'ATENDIDAS', etiqueta: 'Atendidas' },
            ]}
          />
        </div>
        {lista.isLoading && <Spinner />}
        {lista.isError && <Alert tone="error">{errorMessage(lista.error)}</Alert>}
        {lista.data && (
          <Table>
            <TableHead>
              <tr>
                <Th>Persona</Th>
                <Th>Perfil</Th>
                <Th>Grupo</Th>
                <Th>Nota</Th>
                <Th>{vista === 'PENDIENTES' ? 'Pedida' : 'Atendida'}</Th>
                <Th className="text-right">{vista === 'PENDIENTES' ? 'Acciones' : 'Resultado'}</Th>
              </tr>
            </TableHead>
            <TableBody>
              {lista.data.map((s) => (
                <tr key={s._id}>
                  <Td>
                    <span className="font-medium text-ink">
                      {s.usuario.nombre} {s.usuario.apellido}
                    </span>
                    <span className="block text-xs text-muted">{s.usuario.numero_documento}</span>
                  </Td>
                  <Td>
                    <div className="flex flex-wrap gap-1">
                      {s.usuario.roles.map((r) => (
                        <RolBadge key={r} value={r} />
                      ))}
                    </div>
                  </Td>
                  <Td>{s.usuario.grupo ?? '—'}</Td>
                  <Td>{s.nota ?? '—'}</Td>
                  <Td>{formatoFechaHora(vista === 'PENDIENTES' ? s.createdAt : (s.atendida_en ?? s.createdAt))}</Td>
                  <Td>
                    {vista === 'PENDIENTES' ? (
                      <div className="flex justify-end gap-2">
                        <IconButton tone="success" label="Aprobar y generar clave" icon={<CheckCircleIcon />} onClick={() => setAprobando(s)} />
                        <IconButton tone="danger" label="Rechazar solicitud" icon={<XCircleIcon />} onClick={() => setRechazando(s)} />
                      </div>
                    ) : (
                      <div className="text-right text-sm">
                        <span className="font-medium text-ink">{s.estado === 'ATENDIDA' ? 'Clave entregada' : 'Rechazada'}</span>
                        <span className="block text-xs text-muted">{s.atendida_por ? `por ${s.atendida_por}` : ''}</span>
                        {s.motivo_rechazo && <span className="block text-xs text-muted">{s.motivo_rechazo}</span>}
                      </div>
                    )}
                  </Td>
                </tr>
              ))}
              {lista.data.length === 0 && <EmptyRow colSpan={6}>{vista === 'PENDIENTES' ? 'No hay solicitudes pendientes.' : 'Aún no se ha atendido ninguna solicitud.'}</EmptyRow>}
            </TableBody>
          </Table>
        )}
      </Card>

      <Drawer
        open={aprobando !== null}
        title="Aprobar y generar clave"
        subtitle={aprobando ? `${aprobando.usuario.nombre} ${aprobando.usuario.apellido} · ${aprobando.usuario.numero_documento}` : undefined}
        onClose={() => setAprobando(null)}
        onSubmit={(e) => {
          e.preventDefault();
          if (!aprobando) return;
          const objetivo = aprobando;
          aprobar.mutate(objetivo._id, {
            onSuccess: ({ password_temporal }) => {
              setAprobando(null);
              setClaveEntregada({ nombre: `${objetivo.usuario.nombre} ${objetivo.usuario.apellido}`, documento: objetivo.usuario.numero_documento, clave: password_temporal });
            },
          });
        }}
        submitLabel="Generar clave"
        isSubmitting={aprobar.isPending}
      >
        <Alert tone="warning">
          Hazlo solo después de confirmar que quien está frente a ti es esta persona. Se cerrarán sus sesiones abiertas y su clave anterior dejará de servir.
        </Alert>
      </Drawer>

      <Drawer
        open={claveEntregada !== null}
        title="Clave temporal"
        subtitle={claveEntregada ? `${claveEntregada.nombre} · ${claveEntregada.documento}` : undefined}
        onClose={cerrarClave}
        onSubmit={(e) => {
          e.preventDefault();
          cerrarClave();
        }}
        submitLabel="Listo"
      >
        {claveEntregada && (
          <div className="space-y-4">
            <Alert tone="info">Entrégasela a la persona ahora: no se vuelve a mostrar. Al entrar con ella el sistema le pedirá elegir una contraseña nueva.</Alert>
            <div className="flex items-center justify-between gap-3 rounded-lg border border-border bg-soft p-4">
              <code className="text-h3 font-semibold tracking-wider text-ink">{claveEntregada.clave}</code>
              <Button type="button" variant="outline" onClick={() => void copiarClave(claveEntregada.clave)}>
                {copiada ? 'Copiada' : 'Copiar'}
              </Button>
            </div>
          </div>
        )}
      </Drawer>

      <Drawer
        open={rechazando !== null}
        title="Rechazar solicitud"
        subtitle={rechazando ? `${rechazando.usuario.nombre} ${rechazando.usuario.apellido} · ${rechazando.usuario.numero_documento}` : undefined}
        onClose={cerrarRechazo}
        onSubmit={(e) => {
          e.preventDefault();
          if (!rechazando) return;
          rechazar.mutate({ id: rechazando._id, motivo: motivo.trim() }, { onSuccess: cerrarRechazo });
        }}
        submitLabel="Rechazar"
        submitVariant="soft-danger"
        isSubmitting={rechazar.isPending}
      >
        <Input label="Motivo (opcional)" maxLength={300} value={motivo} onChange={(e) => setMotivo(e.target.value)} />
      </Drawer>
    </div>
  );
}
