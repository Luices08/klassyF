import { useMemo, useState } from 'react';
import { EntregaEstudianteDrawer } from '../components/actividades/EntregaEstudianteDrawer';
import { Alert, errorMessage } from '../components/ui/Alert';
import { Chip, EstadoEntregaBadge, TipoActividadChip } from '../components/ui/Badge';
import { Button } from '../components/ui/Button';
import { Card } from '../components/ui/Card';
import { Input, Select } from '../components/ui/Field';
import { PageHeader } from '../components/ui/PageHeader';
import { Spinner } from '../components/ui/Spinner';
import { EmptyRow, Table, TableBody, TableHead, Td, Th } from '../components/ui/Table';
import { Tabs } from '../components/ui/Tabs';
import { type ActividadEstudiante, useMisActividades } from '../hooks/useActividades';
import { diasParaEntrega, formatoInstante } from '../lib/actividades';

type Pestana = 'pendientes' | 'entregadas' | 'calificadas' | 'todas';

const PERTENECE: Record<Pestana, (a: ActividadEstudiante) => boolean> = {
  pendientes: (a) => a.estado === 'PROGRAMADA',
  entregadas: (a) => a.estado === 'ENTREGADA' || a.estado === 'ENTREGADA_TARDE',
  calificadas: (a) => a.estado === 'CALIFICADA',
  todas: () => true,
};

/** El día de calendario (Colombia) de un instante, para comparar contra un filtro YYYY-MM-DD. */
const diaDe = (iso: string): string => new Date(new Date(iso).getTime() - 5 * 3_600_000).toISOString().slice(0, 10);

function Plazo({ actividad }: { actividad: ActividadEstudiante }) {
  if (actividad.estado !== 'PROGRAMADA') return null;
  if (actividad.vencida) return <Chip tone="red">{actividad.puede_entregar ? 'Vencida · aún recibe' : 'Vencida'}</Chip>;
  const dias = diasParaEntrega(actividad.fecha_entrega);
  if (dias === 0) return <Chip tone="orange">Vence hoy</Chip>;
  if (dias === 1) return <Chip tone="orange">Vence mañana</Chip>;
  return null;
}

/** CU-EST-03: la bandeja del estudiante con las actividades publicadas de su grupo, filtrables por asignatura y fecha. */
export function MisActividadesPage() {
  const { data = [], isLoading, isError, error } = useMisActividades();
  const [pestana, setPestana] = useState<Pestana>('pendientes');
  const [asignatura, setAsignatura] = useState('');
  const [desde, setDesde] = useState('');
  const [hasta, setHasta] = useState('');
  const [seleccionada, setSeleccionada] = useState<string | null>(null);

  const asignaturas = useMemo(() => {
    const unicas = new Map<string, string>();
    for (const a of data) if (a.asignacion?.asignatura) unicas.set(a.asignacion.asignatura._id, a.asignacion.asignatura.nombre);
    return [...unicas.entries()].sort((a, b) => a[1].localeCompare(b[1], 'es'));
  }, [data]);

  const filtradas = useMemo(
    () =>
      data.filter(
        (a) =>
          (!asignatura || a.asignacion?.asignatura?._id === asignatura) &&
          (!desde || diaDe(a.fecha_entrega) >= desde) &&
          (!hasta || diaDe(a.fecha_entrega) <= hasta)
      ),
    [data, asignatura, desde, hasta]
  );
  const visibles = filtradas.filter(PERTENECE[pestana]);
  const cuenta = (p: Pestana) => filtradas.filter(PERTENECE[p]).length;
  const filtrando = Boolean(asignatura || desde || hasta);

  // La pestaña de «pendientes» ordena lo más próximo a vencer primero (el servidor ya entrega ordenado por fecha).
  const abierta = data.find((a) => a._id === seleccionada) ?? null;

  return (
    <div className="space-y-4">
      <PageHeader title="Mis actividades" subtitle="Tareas, evaluaciones, trabajos y proyectos que tus docentes publicaron para tu grupo." />

      <Card>
        <div className="grid grid-cols-1 items-end gap-4 p-4 sm:grid-cols-4">
          <Select label="Asignatura" value={asignatura} onChange={(e) => setAsignatura(e.target.value)}>
            <option value="">Todas</option>
            {asignaturas.map(([id, nombre]) => (
              <option key={id} value={id}>
                {nombre}
              </option>
            ))}
          </Select>
          <Input label="Entrega desde" type="date" value={desde} max={hasta || undefined} onChange={(e) => setDesde(e.target.value)} />
          <Input label="Entrega hasta" type="date" value={hasta} min={desde || undefined} onChange={(e) => setHasta(e.target.value)} />
          {filtrando && (
            <Button
              type="button"
              variant="secondary"
              onClick={() => {
                setAsignatura('');
                setDesde('');
                setHasta('');
              }}
            >
              Quitar filtros
            </Button>
          )}
        </div>
      </Card>

      <Tabs
        items={[
          { key: 'pendientes', label: `Pendientes (${cuenta('pendientes')})` },
          { key: 'entregadas', label: `Entregadas (${cuenta('entregadas')})` },
          { key: 'calificadas', label: `Calificadas (${cuenta('calificadas')})` },
          { key: 'todas', label: `Todas (${cuenta('todas')})` },
        ]}
        active={pestana}
        onChange={(k) => setPestana(k as Pestana)}
      />

      {isError && <Alert tone="error">{errorMessage(error)}</Alert>}
      {isLoading ? (
        <div className="flex justify-center p-8">
          <Spinner />
        </div>
      ) : (
        <Table>
          <TableHead>
            <Th>Actividad</Th>
            <Th>Asignatura</Th>
            <Th>Límite de entrega</Th>
            <Th>Estado</Th>
            <Th className="text-right">Acción</Th>
          </TableHead>
          <TableBody>
            {visibles.length === 0 && (
              <EmptyRow colSpan={5}>
                {data.length === 0
                  ? 'Tus docentes aún no han publicado actividades.'
                  : pestana === 'pendientes'
                    ? 'No tienes actividades pendientes. 🎉'
                    : 'No hay actividades en esta lista.'}
              </EmptyRow>
            )}
            {visibles.map((a) => (
              <tr key={a._id}>
                <Td>
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-semibold text-ink">{a.titulo}</span>
                    <TipoActividadChip value={a.tipo} />
                  </div>
                </Td>
                <Td>
                  <p>{a.asignacion?.asignatura?.nombre ?? '—'}</p>
                  <p className="text-xs text-muted">{a.asignacion?.docente ? `${a.asignacion.docente.nombre} ${a.asignacion.docente.apellido}` : ''}</p>
                </Td>
                <Td>
                  <p>{formatoInstante(a.fecha_entrega)}</p>
                  <Plazo actividad={a} />
                </Td>
                <Td>
                  <div className="flex flex-wrap items-center gap-2">
                    <EstadoEntregaBadge value={a.estado} />
                    {a.estado === 'CALIFICADA' && a.entrega && <span className="font-semibold text-ink">{a.entrega.calificacion_numerica}</span>}
                  </div>
                </Td>
                <Td className="text-right">
                  <Button
                    type="button"
                    variant={a.puede_entregar ? 'primary' : 'outline'}
                    onClick={() => setSeleccionada(a._id)}
                  >
                    {a.puede_entregar ? (a.entrega?.fecha_entrega ? 'Ver o reemplazar' : 'Entregar') : 'Ver'}
                  </Button>
                </Td>
              </tr>
            ))}
          </TableBody>
        </Table>
      )}

      <EntregaEstudianteDrawer actividad={abierta} onClose={() => setSeleccionada(null)} />
    </div>
  );
}
