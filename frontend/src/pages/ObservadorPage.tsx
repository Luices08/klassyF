import { useMemo, useState } from 'react';
import { AccionesObservacion } from '../components/convivencia/AccionesObservacion';
import { HistorialObservaciones } from '../components/convivencia/HistorialObservaciones';
import { ChipsObservacion } from '../components/convivencia/ObservacionesTimeline';
import { ObservacionDrawer } from '../components/convivencia/ObservacionDrawer';
import { Alert, errorMessage } from '../components/ui/Alert';
import { Button } from '../components/ui/Button';
import { Card, CardHeader } from '../components/ui/Card';
import { Drawer } from '../components/ui/Drawer';
import { Input, Select } from '../components/ui/Field';
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
} from '../hooks/useObservaciones';
import { formatoFechaCalendario } from '../lib/fechas';

export function ObservadorPage() {
  const { user } = useAuth();
  const [tab, setTab] = useState('registrar');

  return (
    <div className="space-y-4">
      <PageHeader
        title="Observador del estudiante"
        subtitle={
          user?.rol === 'DOCENTE'
            ? 'Registra observaciones de tus estudiantes y consulta lo que tú registraste.'
            : 'Registra y consulta el seguimiento académico y comportamental de los estudiantes.'
        }
      />
      <Tabs
        items={[
          { key: 'registrar', label: 'Registrar' },
          { key: 'mias', label: 'Mis registros' },
        ]}
        active={tab}
        onChange={setTab}
      />
      <TabPanel active={tab} tabKey="registrar">
        <RegistrarTab esDocente={user?.rol === 'DOCENTE'} />
      </TabPanel>
      <TabPanel active={tab} tabKey="mias">
        <MisRegistrosTab />
      </TabPanel>
    </div>
  );
}

function RegistrarTab({ esDocente }: { esDocente: boolean }) {
  const grupos = useGruposObservables();
  const catalogo = useCatalogoConvivencia();
  const [grupoId, setGrupoId] = useState('');
  const [busqueda, setBusqueda] = useState('');
  const estudiantes = useEstudiantesObservables({ group_id: grupoId || undefined, q: busqueda });
  const [seleccion, setSeleccion] = useState<Set<string>>(new Set());
  const [registrando, setRegistrando] = useState(false);
  const [historialDe, setHistorialDe] = useState<EstudianteObservable | null>(null);

  const lista = estudiantes.data ?? [];
  const grupoPorId = useMemo(() => new Map((grupos.data ?? []).map((g) => [g._id, g])), [grupos.data]);
  // El docente solo consulta el historial de los grupos que dirige; coordinación, el de sus sedes.
  const puedeVerHistorial = (e: EstudianteObservable) => !esDocente || Boolean(grupoPorId.get(e.group_id)?.es_director);
  const elegidos = lista.filter((e) => seleccion.has(e.student_id));

  const alternar = (id: string) =>
    setSeleccion((previa) => {
      const siguiente = new Set(previa);
      if (siguiente.has(id)) siguiente.delete(id);
      else siguiente.add(id);
      return siguiente;
    });

  if (grupos.isLoading || catalogo.isLoading) return <Spinner />;
  if (catalogo.isError) return <Alert tone="error">{errorMessage(catalogo.error)}</Alert>;

  return (
    <Card>
      <CardHeader
        title="Estudiantes"
        subtitle="Elige un grupo o busca por nombre o documento (mínimo 3 letras)."
        action={
          <Button disabled={elegidos.length === 0} onClick={() => setRegistrando(true)}>
            Registrar observación{elegidos.length > 0 ? ` (${elegidos.length})` : ''}
          </Button>
        }
      />
      <div className="grid grid-cols-1 gap-4 p-4 sm:grid-cols-2">
        <Select
          label="Grupo"
          value={grupoId}
          onChange={(e) => {
            setGrupoId(e.target.value);
            setSeleccion(new Set());
          }}
        >
          <option value="">Todos mis grupos (usa la búsqueda)</option>
          {(grupos.data ?? []).map((g) => (
            <option key={g._id} value={g._id}>
              {g.grado} · {g.nomenclatura}
              {g.es_director ? ' (director)' : ''}
            </option>
          ))}
        </Select>
        <Input label="Buscar" value={busqueda} onChange={(e) => setBusqueda(e.target.value)} placeholder="Nombre o documento" />
      </div>
      {(grupos.data ?? []).length === 0 && (
        <div className="px-4 pb-4">
          <Alert tone="info">
            No hay grupos disponibles: se necesita un año lectivo en curso y tener grupos asignados (clases o dirección de grupo).
          </Alert>
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
                  onChange={() => alternar(e.student_id)}
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
        <ObservacionDrawer
          open={registrando}
          onClose={() => {
            setRegistrando(false);
            setSeleccion(new Set());
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

function MisRegistrosTab() {
  const [pagina, setPagina] = useState(1);
  const mias = useMisObservaciones(pagina);
  const catalogo = useCatalogoConvivencia();

  if (mias.isLoading) return <Spinner />;
  if (mias.isError) return <Alert tone="error">{errorMessage(mias.error)}</Alert>;
  const { data = [], total = 0, limite = 20 } = mias.data ?? {};
  const paginas = Math.max(1, Math.ceil(total / limite));

  return (
    <Card>
      <CardHeader title="Mis registros" subtitle="Puedes enmendar o anular tus observaciones dentro del plazo que define la institución." />
      <Table>
        <TableHead>
          <tr>
            <Th>Fecha</Th>
            <Th>Estudiante</Th>
            <Th>Tipo</Th>
            <Th>Observación</Th>
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
              <Td className="max-w-md whitespace-pre-line">{o.texto_generado}</Td>
              <Td className="text-right">
                <AccionesObservacion observacion={o} catalogo={catalogo.data} />
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
