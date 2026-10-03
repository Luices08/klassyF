import { type FormEvent, useState } from 'react';
import { Alert, errorMessage } from '../components/ui/Alert';
import { Chip, TipoSituacionBadge } from '../components/ui/Badge';
import { Button } from '../components/ui/Button';
import { Card, CardHeader } from '../components/ui/Card';
import { Drawer } from '../components/ui/Drawer';
import { Input, Select, Textarea } from '../components/ui/Field';
import { PageHeader } from '../components/ui/PageHeader';
import { Spinner } from '../components/ui/Spinner';
import { EmptyRow, Table, TableBody, TableHead, Td, Th } from '../components/ui/Table';
import { useAuth } from '../context/AuthContext';
import {
  ESTADOS_REMISION,
  NOMBRES_ESTADO_REMISION,
  type EstadoRemision,
  useBandejaRemisiones,
  useMarcarAtendida,
  useRegistrarAtencion,
  useRemisionOrientacion,
} from '../hooks/useOrientacion';
import { NOMBRES_ROL_INVOLUCRADO } from '../hooks/useObservaciones';
import { formatoFechaCalendario } from '../lib/fechas';

const hoyLocal = () => new Date().toLocaleDateString('en-CA');
const TONO_ESTADO = { PENDIENTE: 'orange', EN_ATENCION: 'blue', ATENDIDA: 'green' } as const;

/** Los estudiantes que convivencia remitió a orientación. Lo que se escribe aquí es confidencial de quien lo escribe. */
export function OrientacionPage() {
  const [estado, setEstado] = useState<EstadoRemision | ''>('');
  const [pagina, setPagina] = useState(1);
  const [abierta, setAbierta] = useState<string | null>(null);
  const bandeja = useBandejaRemisiones(estado, pagina);

  const { data = [], total = 0, limite = 20 } = bandeja.data ?? {};
  const paginas = Math.max(1, Math.ceil(total / limite));

  return (
    <div className="space-y-4">
      <PageHeader
        title="Remisiones a orientación"
        subtitle="Estudiantes que convivencia remitió desde un caso. Cada consulta de esta bandeja queda registrada en la auditoría."
      />
      {bandeja.isLoading && <Spinner />}
      {bandeja.isError && <Alert tone="error">{errorMessage(bandeja.error)}</Alert>}
      {bandeja.data && (
        <Card>
          <CardHeader title="Remisiones" subtitle={`${total} remisión(es)`} />
          <div className="p-4 sm:w-64">
            <Select
              label="Estado"
              value={estado}
              onChange={(e) => {
                setEstado(e.target.value as EstadoRemision | '');
                setPagina(1);
              }}
            >
              <option value="">Todas</option>
              {ESTADOS_REMISION.map((s) => (
                <option key={s} value={s}>
                  {NOMBRES_ESTADO_REMISION[s]}
                </option>
              ))}
            </Select>
          </div>
          <Table>
            <TableHead>
              <tr>
                <Th>Fecha</Th>
                <Th>Estudiante</Th>
                <Th>Motivo de la remisión</Th>
                <Th>Estado</Th>
                <Th className="text-right">Acciones</Th>
              </tr>
            </TableHead>
            <TableBody>
              {data.map((r) => (
                <tr key={r._id}>
                  <Td>{formatoFechaCalendario(r.createdAt)}</Td>
                  <Td>
                    {r.estudiante}
                    <span className="block text-xs text-muted">
                      {r.numero_documento} · {r.grupo} · {NOMBRES_ROL_INVOLUCRADO[r.rol]}
                    </span>
                  </Td>
                  <Td className="max-w-md">
                    <TipoSituacionBadge value={r.tipo_situacion} />
                    <span className="mt-1 block text-sm">
                      {r.origen === 'MEDIDA' ? 'Medida' : r.origen === 'PASO' ? 'Paso del protocolo' : 'Remisión de convivencia'}: {r.origen_detalle}
                    </span>
                  </Td>
                  <Td>
                    <Chip tone={TONO_ESTADO[r.estado]}>{NOMBRES_ESTADO_REMISION[r.estado]}</Chip>
                  </Td>
                  <Td className="text-right">
                    <Button variant="soft-edit" className="px-3 py-1 text-xs" onClick={() => setAbierta(r._id)}>
                      Abrir
                    </Button>
                  </Td>
                </tr>
              ))}
              {data.length === 0 && <EmptyRow colSpan={5}>No hay remisiones.</EmptyRow>}
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
      <RemisionDrawer id={abierta} onClose={() => setAbierta(null)} />
    </div>
  );
}

function RemisionDrawer({ id, onClose }: { id: string | null; onClose: () => void }) {
  const remision = useRemisionOrientacion(id);
  if (!id) return null;
  return (
    <Drawer open size="lg" title={remision.data?.estudiante ?? 'Remisión'} subtitle="Lo que registres aquí es confidencial: solo tú y la administración lo leen." onClose={onClose}>
      {remision.isLoading && <Spinner />}
      {remision.isError && <Alert tone="error">{errorMessage(remision.error)}</Alert>}
      {remision.data && <Contenido id={id} />}
    </Drawer>
  );
}

function Contenido({ id }: { id: string }) {
  const rol = useAuth().user?.rol;
  const remision = useRemisionOrientacion(id).data!;
  const registrar = useRegistrarAtencion();
  const atender = useMarcarAtendida();
  const [fecha, setFecha] = useState(hoyLocal());
  const [descripcion, setDescripcion] = useState('');
  const puedeAtender = rol === 'ORIENTADOR' && remision.estado !== 'ATENDIDA';

  const guardar = async (e: FormEvent) => {
    e.preventDefault();
    await registrar.mutateAsync({ id, fecha, descripcion });
    setDescripcion('');
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <Chip tone={TONO_ESTADO[remision.estado]}>{NOMBRES_ESTADO_REMISION[remision.estado]}</Chip>
        <TipoSituacionBadge value={remision.tipo_situacion} />
        <Chip tone="neutral">{remision.caso_codigo}</Chip>
      </div>
      <div>
        <p className="text-label text-muted">Hechos del caso</p>
        <p className="mt-0.5 whitespace-pre-line text-sm text-body">{remision.hechos}</p>
      </div>
      <div>
        <p className="text-label text-muted">Atenciones</p>
        <ul className="mt-1 space-y-2">
          {remision.atenciones.map((a) => (
            <li key={a._id} className="rounded-lg border border-border p-3 text-sm text-body">
              <p className="mb-1 text-xs text-muted">
                {formatoFechaCalendario(a.fecha)}
                {a.por_nombre ? ` · ${a.por_nombre}` : ''}
              </p>
              {a.descripcion === null ? <p className="text-muted">Registrada por otro profesional de orientación.</p> : <p className="whitespace-pre-line">{a.descripcion}</p>}
            </li>
          ))}
          {remision.atenciones.length === 0 && <li className="text-sm text-muted">Todavía no hay atenciones registradas.</li>}
        </ul>
      </div>

      {puedeAtender && (
        <form onSubmit={guardar} className="space-y-3 rounded-xl border border-border p-4">
          {registrar.isError && <Alert tone="error">{errorMessage(registrar.error)}</Alert>}
          {atender.isError && <Alert tone="error">{errorMessage(atender.error)}</Alert>}
          <Input label="Fecha de la atención" type="date" max={hoyLocal()} value={fecha} onChange={(e) => setFecha(e.target.value)} required />
          <Textarea label="Descripción de la atención" rows={4} maxLength={4000} value={descripcion} onChange={(e) => setDescripcion(e.target.value)} hint="Confidencial: no se copia al caso ni a la auditoría." />
          <div className="flex flex-wrap gap-2">
            <Button type="submit" isLoading={registrar.isPending} disabled={descripcion.trim().length < 5}>
              Registrar atención
            </Button>
            <Button type="button" variant="soft-success" isLoading={atender.isPending} disabled={remision.atenciones.length === 0} onClick={() => atender.mutate(id)}>
              Dar por atendida
            </Button>
          </div>
        </form>
      )}
    </div>
  );
}
