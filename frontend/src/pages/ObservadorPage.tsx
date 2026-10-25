import { useMemo, useState } from 'react';
import { AccionesObservacion } from '../components/convivencia/AccionesObservacion';
import { FaltaDrawer } from '../components/convivencia/FaltaDrawer';
import { HistorialObservaciones } from '../components/convivencia/HistorialObservaciones';
import { ChipsObservacion } from '../components/convivencia/ObservacionesTimeline';
import { ObservacionDrawer } from '../components/convivencia/ObservacionDrawer';
import { Alert, errorMessage } from '../components/ui/Alert';
import { Chip } from '../components/ui/Badge';
import { Button } from '../components/ui/Button';
import { Card, CardHeader } from '../components/ui/Card';
import { Drawer } from '../components/ui/Drawer';
import { Input } from '../components/ui/Field';
import { PageHeader } from '../components/ui/PageHeader';
import { Spinner } from '../components/ui/Spinner';
import { EmptyRow, Table, TableBody, TableHead, Td, Th } from '../components/ui/Table';
import { TabPanel, Tabs } from '../components/ui/Tabs';
import { useAuth } from '../context/AuthContext';
import {
  type EstudianteObservable,
  useCatalogoConvivencia,
  useEstudiantesObservables,
  useGruposObservables,
  useMisObservaciones,
  useMisReportesUrgentes,
} from '../hooks/useObservaciones';
import { formatoFechaCalendario } from '../lib/fechas';
import { SelectBuscable } from '../components/ui/SelectBuscable';

export function ObservadorPage() {
  const { user } = useAuth();
  const [tab, setTab] = useState('registrar');
  const puedeReportar = user?.rol === 'DOCENTE' || user?.rol === 'COORDINADOR_CONVIVENCIA' || user?.rol === 'ADMIN';

  return (
    <div className="space-y-4">
      <PageHeader
        title="Observador del estudiante"
        subtitle={
          user?.rol === 'DOCENTE'
            ? 'Registra observaciones y faltas de los estudiantes de tu sede y consulta lo que tú registraste.'
            : 'Registra y consulta el seguimiento académico y comportamental de los estudiantes.'
        }
      />
      <Tabs
        items={[
          { key: 'registrar', label: 'Registrar' },
          { key: 'mias', label: 'Mis registros' },
          ...(puedeReportar ? [{ key: 'reportes', label: 'Mis faltas graves' }] : []),
        ]}
        active={tab}
        onChange={setTab}
      />
      <TabPanel active={tab} tabKey="registrar">
        <RegistrarTab
          esDocente={user?.rol === 'DOCENTE'}
          puedeRegistrarFalta={puedeReportar}
        />
      </TabPanel>
      <TabPanel active={tab} tabKey="mias">
        <MisRegistrosTab />
      </TabPanel>
      {puedeReportar && (
        <TabPanel active={tab} tabKey="reportes">
          <MisReportesTab />
        </TabPanel>
      )}
    </div>
  );
}

function RegistrarTab({ esDocente, puedeRegistrarFalta }: { esDocente: boolean; puedeRegistrarFalta: boolean }) {
  const grupos = useGruposObservables();
  const catalogo = useCatalogoConvivencia();
  const [grupoId, setGrupoId] = useState('');
  const [busqueda, setBusqueda] = useState('');
  const estudiantes = useEstudiantesObservables({ group_id: grupoId || undefined, q: busqueda });
  // La selección sobrevive al cambio de grupo y de búsqueda: un incidente puede ser entre estudiantes de grupos o grados distintos.
  const [seleccion, setSeleccion] = useState<Map<string, EstudianteObservable>>(new Map());
  const [registrando, setRegistrando] = useState(false);
  const [registrandoFalta, setRegistrandoFalta] = useState(false);
  const [aviso, setAviso] = useState<string | null>(null);
  const [historialDe, setHistorialDe] = useState<EstudianteObservable | null>(null);

  const lista = estudiantes.data ?? [];
  const grupoPorId = useMemo(() => new Map((grupos.data ?? []).map((g) => [g._id, g])), [grupos.data]);
  // El docente solo consulta el historial de los grupos que dirige; coordinación, el de sus sedes.
  const puedeVerHistorial = (e: EstudianteObservable) => !esDocente || Boolean(grupoPorId.get(e.group_id)?.es_director);
  const elegidos = [...seleccion.values()];

  const alternar = (estudiante: EstudianteObservable) =>
    setSeleccion((previa) => {
      const siguiente = new Map(previa);
      if (siguiente.has(estudiante.student_id)) siguiente.delete(estudiante.student_id);
      else siguiente.set(estudiante.student_id, estudiante);
      return siguiente;
    });
  const quitar = (id: string) =>
    setSeleccion((previa) => {
      const siguiente = new Map(previa);
      siguiente.delete(id);
      return siguiente;
    });

  if (grupos.isLoading || catalogo.isLoading) return <Spinner />;
  if (catalogo.isError) return <Alert tone="error">{errorMessage(catalogo.error)}</Alert>;

  return (
    <Card>
      <CardHeader
        title="Estudiantes"
        subtitle="Para registrar no hace falta marcar a nadie aquí: el formulario te deja elegir grupo y estudiantes de toda tu sede. El historial solo lo ve el director de cada grupo."
        action={
          <div className="flex flex-wrap gap-2">
            {puedeRegistrarFalta && (
              <Button variant="outline" onClick={() => setRegistrandoFalta(true)}>
                Registrar falta{elegidos.length > 0 ? ` (${elegidos.length})` : ''}
              </Button>
            )}
            <Button onClick={() => setRegistrando(true)}>
              Registrar observación{elegidos.length > 0 ? ` (${elegidos.length})` : ''}
            </Button>
          </div>
        }
      />
      <div className="grid grid-cols-1 gap-4 p-4 sm:grid-cols-2">
        <SelectBuscable
          label="Grupo"
          value={grupoId}
          onChange={(id) => {
            setGrupoId(id);
          }}
          placeholder="Buscar grupo…"
          vacioLabel="Toda la sede (usa la búsqueda)"
          opciones={(grupos.data ?? []).map((g) => ({ value: g._id, label: `${g.grado} · ${g.nomenclatura}${g.es_director ? ' (director)' : ''}` }))}
        />
        <Input label="Buscar" value={busqueda} onChange={(e) => setBusqueda(e.target.value)} placeholder="Nombre o documento" />
      </div>
      {elegidos.length > 0 && (
        <div className="flex flex-wrap items-center gap-2 px-4 pb-4">
          <span className="text-label text-body">Seleccionados ({elegidos.length}):</span>
          {elegidos.map((s) => (
            <span key={s.student_id} className="inline-flex items-center gap-1.5 rounded-full bg-primary-soft px-3 py-1 text-xs text-primary">
              {s.apellido} {s.nombre} · {s.grupo}
              <button type="button" className="font-semibold hover:text-ink" aria-label={`Quitar a ${s.nombre} ${s.apellido}`} onClick={() => quitar(s.student_id)}>
                ×
              </button>
            </span>
          ))}
          <Button variant="secondary" className="px-3 py-1 text-xs" onClick={() => setSeleccion(new Map())}>
            Quitar a todos
          </Button>
          {new Set(elegidos.map((s) => s.group_id)).size > 1 && <span className="text-xs text-muted">De grupos distintos: cada registro queda en el grupo de su estudiante.</span>}
        </div>
      )}
      {(grupos.data ?? []).length === 0 && (
        <div className="px-4 pb-4">
          <Alert tone="info">
            No hay grupos disponibles: se necesita un año lectivo en curso y tener una sede asignada con grupos.
          </Alert>
        </div>
      )}
      {aviso && (
        <div className="px-4 pb-4">
          <Alert tone="success">{aviso}</Alert>
        </div>
      )}
      {estudiantes.isError && (
        <div className="px-4 pb-4">
          <Alert tone="error">{errorMessage(estudiantes.error)}</Alert>
        </div>
      )}
      <Table>
        <TableHead>
          <tr>
            <Th className="w-10" />
            <Th>Estudiante</Th>
            <Th>Documento</Th>
            <Th>Grupo</Th>
            <Th className="text-right">Observador</Th>
          </tr>
        </TableHead>
        <TableBody>
          {lista.map((e) => (
            <tr key={e.student_id}>
              <Td>
                <input
                  type="checkbox"
                  aria-label={`Seleccionar a ${e.nombre} ${e.apellido}`}
                  className="h-4 w-4 rounded border-border text-primary focus:ring-primary"
                  checked={seleccion.has(e.student_id)}
                  onChange={() => alternar(e)}
                />
              </Td>
              <Td>
                {e.apellido} {e.nombre}
              </Td>
              <Td>{e.numero_documento}</Td>
              <Td>{e.grupo}</Td>
              <Td className="text-right">
                {puedeVerHistorial(e) && (
                  <Button variant="soft-edit" className="px-3 py-1 text-xs" onClick={() => setHistorialDe(e)}>
                    Ver historial
                  </Button>
                )}
              </Td>
            </tr>
          ))}
          {lista.length === 0 && (
            <EmptyRow colSpan={5}>
              {estudiantes.isFetching ? 'Buscando…' : 'Elige un grupo o escribe al menos 3 letras para buscar.'}
            </EmptyRow>
          )}
        </TableBody>
      </Table>

      {catalogo.data && (
        <FaltaDrawer
          open={registrandoFalta}
          onClose={() => {
            setRegistrandoFalta(false);
            setSeleccion(new Map());
          }}
          catalogo={catalogo.data}
          estudiantes={elegidos}
          onRegistrada={(r) =>
            setAviso(
              r.grave
                ? 'La falta se envió a coordinación de convivencia, que abre el caso. Puedes seguir su estado en «Mis faltas graves».'
                : r.escalada
                  ? 'La falta quedó registrada y se escaló a coordinación de convivencia.'
                  : 'La falta quedó registrada en el Observador.'
            )
          }
        />
      )}
      {catalogo.data && (
        <ObservacionDrawer
          open={registrando}
          onClose={() => {
            setRegistrando(false);
            setSeleccion(new Map());
          }}
          catalogo={catalogo.data}
          estudiantes={elegidos}
        />
      )}
      <Drawer
        open={Boolean(historialDe)}
        size="lg"
        title={historialDe ? `${historialDe.nombre} ${historialDe.apellido}` : ''}
        subtitle="Historial de convivencia · cada consulta queda registrada en la auditoría"
        onClose={() => setHistorialDe(null)}
      >
        {historialDe && <HistorialObservaciones studentId={historialDe.student_id} />}
      </Drawer>
    </Card>
  );
}

const ESTADO_REPORTE = { PENDIENTE: { tono: 'orange', texto: 'En revisión de coordinación' }, CONVERTIDA: { tono: 'blue', texto: 'Caso abierto' }, DESCARTADA: { tono: 'neutral', texto: 'No ameritó caso' } } as const;

/** Lo que el docente reportó y qué pasó con ello: nunca el expediente del caso, solo su código y estado. */
function MisReportesTab() {
  const [pagina, setPagina] = useState(1);
  const reportes = useMisReportesUrgentes(pagina);

  if (reportes.isLoading) return <Spinner />;
  if (reportes.isError) return <Alert tone="error">{errorMessage(reportes.error)}</Alert>;
  const { data = [], total = 0, limite = 20 } = reportes.data ?? {};
  const paginas = Math.max(1, Math.ceil(total / limite));

  return (
    <Card>
      <CardHeader title="Mis faltas graves" subtitle="Las faltas Tipo II y III que enviaste a coordinación de convivencia y en qué van." />
      <Table>
        <TableHead>
          <tr>
            <Th>Fecha</Th>
            <Th>Estudiantes</Th>
            <Th>Lo que reportaste</Th>
            <Th>Estado</Th>
          </tr>
        </TableHead>
        <TableBody>
          {data.map((r) => (
            <tr key={r._id}>
              <Td>{formatoFechaCalendario(r.fecha_hecho)}</Td>
              <Td>{r.estudiantes.join(', ')}</Td>
              <Td className="max-w-md">
                {r.falta && (
                  <p className="mb-1 text-xs font-semibold text-ink">
                    Tipo {r.falta.gravedad} · {r.falta.codigo} · {r.falta.descripcion}
                  </p>
                )}
                <p className="whitespace-pre-line">{r.hechos}</p>
                <p className="mt-1 whitespace-pre-line text-xs text-muted">Contención: {r.acciones_contencion}</p>
              </Td>
              <Td>
                <Chip tone={ESTADO_REPORTE[r.estado].tono}>{ESTADO_REPORTE[r.estado].texto}</Chip>
                {r.caso && <span className="mt-1 block text-xs text-muted">{r.caso.codigo}</span>}
                {r.estado === 'DESCARTADA' && r.motivo_resolucion && <span className="mt-1 block text-xs text-muted">{r.motivo_resolucion}</span>}
              </Td>
            </tr>
          ))}
          {data.length === 0 && <EmptyRow colSpan={4}>Todavía no has enviado faltas graves a coordinación.</EmptyRow>}
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
  );
}

function MisRegistrosTab() {
  const [pagina, setPagina] = useState(1);
  const mias = useMisObservaciones(pagina);

  if (mias.isLoading) return <Spinner />;
  if (mias.isError) return <Alert tone="error">{errorMessage(mias.error)}</Alert>;
  const { data = [], total = 0, limite = 20 } = mias.data ?? {};
  const paginas = Math.max(1, Math.ceil(total / limite));

  return (
    <Card>
      <CardHeader title="Mis registros" subtitle="Puedes editar o anular tus observaciones dentro del plazo que define la institución." />
      <Table>
        <TableHead>
          <tr>
            <Th>Fecha</Th>
            <Th>Estudiante</Th>
            <Th>Tipo</Th>
            <Th>Descripción</Th>
            <Th className="text-right">Acciones</Th>
          </tr>
        </TableHead>
        <TableBody>
          {data.map((o) => (
            <tr key={o._id} className={o.estado === 'ANULADA' ? 'opacity-60' : ''}>
              <Td>{formatoFechaCalendario(o.fecha_hecho)}</Td>
              <Td>{o.estudiante}</Td>
              <Td>
                <div className="flex flex-wrap gap-1">
                  <ChipsObservacion obs={o} />
                </div>
              </Td>
              <Td className="max-w-md whitespace-pre-line">{o.descripcion}</Td>
              <Td className="text-right">
                <AccionesObservacion observacion={o} />
              </Td>
            </tr>
          ))}
          {data.length === 0 && <EmptyRow colSpan={5}>Todavía no has registrado observaciones.</EmptyRow>}
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
  );
}
