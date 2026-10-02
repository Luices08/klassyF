import { type FormEvent, useState } from 'react';
import { ChipsObservacion } from '../../components/convivencia/ObservacionesTimeline';
import { Alert, errorMessage } from '../../components/ui/Alert';
import { Chip } from '../../components/ui/Badge';
import { Button } from '../../components/ui/Button';
import { Card, CardHeader } from '../../components/ui/Card';
import { Drawer } from '../../components/ui/Drawer';
import { Textarea } from '../../components/ui/Field';
import { PageHeader } from '../../components/ui/PageHeader';
import { Spinner } from '../../components/ui/Spinner';
import { EmptyRow, Table, TableBody, TableHead, Td, Th } from '../../components/ui/Table';
import { type SolicitudEnBandeja, useBandejaCasos, useDescartarSolicitudCaso } from '../../hooks/useObservaciones';
import { formatoFechaCalendario } from '../../lib/fechas';

/** Lo que convivencia tiene por atender: situaciones II/III y disciplinarias que un docente pidió escalar. */
export function SolicitudesCasoPage() {
  const [pagina, setPagina] = useState(1);
  const bandeja = useBandejaCasos(pagina);
  const [descartando, setDescartando] = useState<SolicitudEnBandeja | null>(null);

  const { data = [], total = 0, limite = 20 } = bandeja.data ?? {};
  const paginas = Math.max(1, Math.ceil(total / limite));

  return (
    <div className="space-y-4">
      <PageHeader
        title="Solicitudes de caso"
        subtitle="Situaciones que requieren atención de convivencia. Cada consulta de esta bandeja queda registrada en la auditoría."
      />
      {bandeja.isLoading && <Spinner />}
      {bandeja.isError && <Alert tone="error">{errorMessage(bandeja.error)}</Alert>}
      {bandeja.data && (
        <Card>
          <CardHeader title="Pendientes" subtitle={`${total} solicitud(es) por atender`} />
          <Table>
            <TableHead>
              <tr>
                <Th>Fecha</Th>
                <Th>Estudiante</Th>
                <Th>Hechos</Th>
                <Th>Origen</Th>
                <Th className="text-right">Acciones</Th>
              </tr>
            </TableHead>
            <TableBody>
              {data.map((s) => (
                <tr key={s._id}>
                  <Td>{formatoFechaCalendario(s.fecha_hecho)}</Td>
                  <Td>
                    {s.estudiante}
                    <span className="block text-xs text-muted">
                      {s.numero_documento} · {s.grupo}
                    </span>
                  </Td>
                  <Td className="max-w-md">
                    <div className="mb-1 flex flex-wrap gap-1">
                      <ChipsObservacion obs={s} />
                    </div>
                    <p className="whitespace-pre-line">{s.texto_generado}</p>
                  </Td>
                  <Td>
                    <Chip tone={s.solicitud_caso?.origen === 'AUTOMATICA' ? 'orange' : 'blue'}>
                      {s.solicitud_caso?.origen === 'AUTOMATICA' ? 'Por tipificación' : 'Pedida por docente'}
                    </Chip>
                    <span className="mt-1 block text-xs text-muted">{s.solicitud_caso?.motivo}</span>
                  </Td>
                  <Td className="text-right">
                    <Button variant="soft-danger" className="px-3 py-1 text-xs" onClick={() => setDescartando(s)}>
                      Descartar
                    </Button>
                  </Td>
                </tr>
              ))}
              {data.length === 0 && <EmptyRow colSpan={5}>No hay solicitudes pendientes.</EmptyRow>}
            </TableBody>
          </Table>
          {paginas > 1 && (
            <div className="flex items-center justify-between p-4 text-sm text-muted">
              <span>
                Página {pagina} de {paginas}
              </span>
              <span className="flex gap-2">
                <Button variant="secondary" disabled={pagina <= 1} onClick={() => setPagina((p) => p - 1)}>
                  Anterior
                </Button>
                <Button variant="secondary" disabled={pagina >= paginas} onClick={() => setPagina((p) => p + 1)}>
                  Siguiente
                </Button>
              </span>
            </div>
          )}
        </Card>
      )}
      <DescartarDrawer solicitud={descartando} onClose={() => setDescartando(null)} />
    </div>
  );
}

function DescartarDrawer({ solicitud, onClose }: { solicitud: SolicitudEnBandeja | null; onClose: () => void }) {
  if (!solicitud) return null;
  return <Formulario solicitud={solicitud} onClose={onClose} />;
}

function Formulario({ solicitud, onClose }: { solicitud: SolicitudEnBandeja; onClose: () => void }) {
  const descartar = useDescartarSolicitudCaso();
  const [motivo, setMotivo] = useState('');

  const guardar = async (e: FormEvent) => {
    e.preventDefault();
    await descartar.mutateAsync({ id: solicitud._id, motivo });
    onClose();
  };

  return (
    <Drawer
      open
      title="Descartar solicitud"
      subtitle={solicitud.estudiante}
      onClose={onClose}
      onSubmit={guardar}
      submitLabel="Descartar"
      submitVariant="soft-danger"
      isSubmitting={descartar.isPending}
      submitDisabled={motivo.trim().length < 5}
    >
      {descartar.isError && <Alert tone="error">{errorMessage(descartar.error)}</Alert>}
      <Alert tone="warning">La observación se conserva; solo se cierra la solicitud, con el motivo que escribas.</Alert>
      <Textarea label="Motivo" rows={3} maxLength={500} value={motivo} onChange={(e) => setMotivo(e.target.value)} />
    </Drawer>
  );
}
