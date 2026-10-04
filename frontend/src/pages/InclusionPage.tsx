import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { AbrirExpedienteDrawer } from '../components/inclusion/AbrirExpedienteDrawer';
import { ConfiguracionInclusionPanel } from '../components/inclusion/ConfiguracionInclusionPanel';
import { ReportarEstudianteDrawer } from '../components/inclusion/ReportarEstudianteDrawer';
import { ResolverSolicitudDrawer } from '../components/inclusion/ResolverSolicitudDrawer';
import { Alert, errorMessage } from '../components/ui/Alert';
import { Chip, EstadoExpedienteBadge, EstadoSolicitudApoyoBadge } from '../components/ui/Badge';
import { Button } from '../components/ui/Button';
import { Card } from '../components/ui/Card';
import { Input, Select } from '../components/ui/Field';
import { PageHeader } from '../components/ui/PageHeader';
import { ProgressBar } from '../components/ui/ProgressBar';
import { Spinner } from '../components/ui/Spinner';
import { EmptyRow, Table, TableBody, TableHead, Td, Th } from '../components/ui/Table';
import { TabPanel, Tabs } from '../components/ui/Tabs';
import { useAuth } from '../context/AuthContext';
import {
  ESTADOS_EXPEDIENTE,
  ESTADOS_SOLICITUD_APOYO,
  NOMBRES_ESTADO_EXPEDIENTE,
  NOMBRES_ESTADO_SOLICITUD,
  NOMBRES_ORIGEN,
  NOMBRES_TIPO_EXPEDIENTE,
  type EstadoExpediente,
  type EstadoSolicitudApoyo,
  type SolicitudApoyo,
  useBandejaSolicitudes,
  useExpedientes,
  useValorarSolicitud,
} from '../hooks/useInclusion';
import { formatoFechaCalendario, formatoFechaLocal } from '../lib/fechas';

function Paginador({ pagina, paginas, onChange }: { pagina: number; paginas: number; onChange: (p: number) => void }) {
  if (paginas <= 1) return null;
  return (
    <div className="flex items-center justify-between p-4 text-sm text-muted">
      <span>
        Página {pagina} de {paginas}
      </span>
      <span className="flex gap-2">
        <Button variant="secondary" disabled={pagina <= 1} onClick={() => onChange(pagina - 1)}>
          Anterior
        </Button>
        <Button variant="secondary" disabled={pagina >= paginas} onClick={() => onChange(pagina + 1)}>
          Siguiente
        </Button>
      </span>
    </div>
  );
}

/**
 * Inclusión (M16): bandeja de solicitudes de apoyo y expedientes de las sedes del usuario. Orientación abre y resuelve;
 * coordinación supervisa (no ve lo declarado ni la modalidad). Cada consulta de esta bandeja queda en la auditoría.
 */
export function InclusionPage() {
  const rol = useAuth().user?.rol;
  const esOrientacion = rol === 'ADMIN' || rol === 'ORIENTADOR';
  const [pestana, setPestana] = useState('solicitudes');
  const [nuevo, setNuevo] = useState(false);
  const [reportar, setReportar] = useState(false);

  return (
    <div className="space-y-4">
      <PageHeader
        title="Inclusión"
        subtitle="Solicitudes de apoyo, expedientes PIAR y planes de apoyo pedagógico. Información sensible de menores: cada consulta queda registrada."
        action={
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => setReportar(true)}>
              Reportar estudiante
            </Button>
            {esOrientacion && <Button onClick={() => setNuevo(true)}>Nuevo expediente</Button>}
          </div>
        }
      />
      <Card>
        <Tabs
          items={[
            { key: 'solicitudes', label: 'Solicitudes de apoyo' },
            { key: 'expedientes', label: 'Expedientes' },
            { key: 'configuracion', label: 'Configuración' },
          ]}
          active={pestana}
          onChange={setPestana}
        />
        <TabPanel active={pestana} tabKey="solicitudes">
          <Solicitudes esOrientacion={esOrientacion} />
        </TabPanel>
        <TabPanel active={pestana} tabKey="expedientes">
          <Expedientes />
        </TabPanel>
        <TabPanel active={pestana} tabKey="configuracion">
          <ConfiguracionInclusionPanel puedeEditar={rol === 'ADMIN'} />
        </TabPanel>
      </Card>
      <AbrirExpedienteDrawer open={nuevo} onClose={() => setNuevo(false)} />
      <ReportarEstudianteDrawer open={reportar} onClose={() => setReportar(false)} />
    </div>
  );
}

function Solicitudes({ esOrientacion }: { esOrientacion: boolean }) {
  const navigate = useNavigate();
  const [estado, setEstado] = useState<EstadoSolicitudApoyo | ''>('');
  const [pagina, setPagina] = useState(1);
  const [resolviendo, setResolviendo] = useState<SolicitudApoyo | null>(null);
  const bandeja = useBandejaSolicitudes(estado, pagina);
  const valorar = useValorarSolicitud();
  const { data = [], total = 0, limite = 20 } = bandeja.data ?? {};

  return (
    <div className="space-y-3">
      <div className="sm:w-64">
        <Select
          label="Estado"
          value={estado}
          onChange={(e) => {
            setEstado(e.target.value as EstadoSolicitudApoyo | '');
            setPagina(1);
          }}
        >
          <option value="">Pendientes y en valoración</option>
          {ESTADOS_SOLICITUD_APOYO.map((s) => (
            <option key={s} value={s}>
              {NOMBRES_ESTADO_SOLICITUD[s]}
            </option>
          ))}
        </Select>
      </div>
      {bandeja.isLoading && <Spinner />}
      {bandeja.isError && <Alert tone="error">{errorMessage(bandeja.error)}</Alert>}
      {valorar.isError && <Alert tone="error">{errorMessage(valorar.error)}</Alert>}
      {bandeja.data && (
        <>
          <Table>
            <TableHead>
              <tr>
                <Th>Fecha</Th>
                <Th>Estudiante</Th>
                <Th>Origen</Th>
                <Th>Lo declarado</Th>
                <Th>Estado</Th>
                <Th className="text-right">Acciones</Th>
              </tr>
            </TableHead>
            <TableBody>
              {data.map((s) => (
                <tr key={s._id}>
                  <Td>{formatoFechaLocal(s.createdAt)}</Td>
                  <Td>
                    {s.estudiante.apellido} {s.estudiante.nombre}
                    <span className="block text-xs text-muted">
                      {s.estudiante.numero_documento} · {s.grupo}
                    </span>
                  </Td>
                  <Td>
                    <Chip tone="blue">{NOMBRES_ORIGEN[s.origen]}</Chip>
                    {s.solicitada_por && <span className="mt-1 block text-xs text-muted">{s.solicitada_por}</span>}
                  </Td>
                  <Td className="max-w-sm text-sm">
                    {s.motivo_declarado ?? <span className="text-muted">Reservado a orientación</span>}
                    {s.aporta_soporte && <span className="block text-xs text-muted">Aporta soporte médico</span>}
                  </Td>
                  <Td>
                    <EstadoSolicitudApoyoBadge value={s.estado} />
                  </Td>
                  <Td className="text-right">
                    {esOrientacion && s.estado === 'PENDIENTE' && (
                      <Button variant="soft-edit" className="px-3 py-1 text-xs" isLoading={valorar.isPending} onClick={() => valorar.mutate(s._id)}>
                        Tomar
                      </Button>
                    )}
                    {esOrientacion && s.estado === 'EN_VALORACION' && (
                      <Button variant="soft-success" className="px-3 py-1 text-xs" onClick={() => setResolviendo(s)}>
                        Resolver
                      </Button>
                    )}
                    {s.expediente_id && (
                      <Button variant="soft-edit" className="px-3 py-1 text-xs" onClick={() => navigate(`/inclusion/expedientes/${s.expediente_id}`)}>
                        Abrir expediente
                      </Button>
                    )}
                  </Td>
                </tr>
              ))}
              {data.length === 0 && <EmptyRow colSpan={6}>No hay solicitudes.</EmptyRow>}
            </TableBody>
          </Table>
          <Paginador pagina={pagina} paginas={Math.max(1, Math.ceil(total / limite))} onChange={setPagina} />
        </>
      )}
      <ResolverSolicitudDrawer solicitud={resolviendo} onClose={() => setResolviendo(null)} />
    </div>
  );
}

function Expedientes() {
  const navigate = useNavigate();
  const [estado, setEstado] = useState<EstadoExpediente | ''>('');
  const [q, setQ] = useState('');
  const [pagina, setPagina] = useState(1);
  const lista = useExpedientes({ estado, q }, pagina);
  const { data = [], total = 0, limite = 20 } = lista.data ?? {};

  return (
    <div className="space-y-3">
      <div className="grid gap-3 sm:grid-cols-2">
        <Select
          label="Estado"
          value={estado}
          onChange={(e) => {
            setEstado(e.target.value as EstadoExpediente | '');
            setPagina(1);
          }}
        >
          <option value="">Todos</option>
          {ESTADOS_EXPEDIENTE.map((s) => (
            <option key={s} value={s}>
              {NOMBRES_ESTADO_EXPEDIENTE[s]}
            </option>
          ))}
        </Select>
        <Input
          label="Estudiante"
          placeholder="Nombre o documento"
          value={q}
          onChange={(e) => {
            setQ(e.target.value);
            setPagina(1);
          }}
        />
      </div>
      {lista.isLoading && <Spinner />}
      {lista.isError && <Alert tone="error">{errorMessage(lista.error)}</Alert>}
      {lista.data && (
        <>
          <Table>
            <TableHead>
              <tr>
                <Th>Estudiante</Th>
                <Th>Grupo</Th>
                <Th>Estado</Th>
                <Th>Ajustes de los docentes</Th>
                <Th>Plazo</Th>
                <Th className="text-right">Acciones</Th>
              </tr>
            </TableHead>
            <TableBody>
              {data.map((x) => (
                <tr key={x._id}>
                  <Td>
                    {x.estudiante.apellido} {x.estudiante.nombre}
                    <span className="block text-xs text-muted">
                      {x.estudiante.numero_documento}
                      {x.tipo ? ` · ${NOMBRES_TIPO_EXPEDIENTE[x.tipo]}` : ''}
                    </span>
                  </Td>
                  <Td>
                    {x.grado} — {x.grupo}
                  </Td>
                  <Td>
                    <EstadoExpedienteBadge value={x.estado} />
                  </Td>
                  <Td className="w-48">
                    {x.tipo === 'PLAN_APOYO' ? (
                      <span className="text-xs text-muted">No aplica</span>
                    ) : (
                      <>
                        <ProgressBar value={x.porcentaje_ajustes} max={100} tone={x.porcentaje_ajustes === 100 ? 'green' : 'orange'} label={`${x.porcentaje_ajustes}%`} />
                        {x.sin_docente > 0 && <span className="mt-1 block text-xs text-danger">{x.sin_docente} asignatura(s) sin docente</span>}
                      </>
                    )}
                  </Td>
                  <Td>
                    {x.plazo_vencido ? <Chip tone="red">Vencido</Chip> : <span className="text-sm">{formatoFechaCalendario(x.fecha_limite_elaboracion)}</span>}
                  </Td>
                  <Td className="text-right">
                    <Button variant="soft-edit" className="px-3 py-1 text-xs" onClick={() => navigate(`/inclusion/expedientes/${x._id}`)}>
                      Abrir
                    </Button>
                  </Td>
                </tr>
              ))}
              {data.length === 0 && <EmptyRow colSpan={6}>No hay expedientes.</EmptyRow>}
            </TableBody>
          </Table>
          <Paginador pagina={pagina} paginas={Math.max(1, Math.ceil(total / limite))} onChange={setPagina} />
        </>
      )}
    </div>
  );
}

