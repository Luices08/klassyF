import { useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { CatalogoAsignaturasEstudiante, type AsignaturaEstudianteCard } from '../components/actividades/CatalogoAsignaturasEstudiante';
import { EntregaEstudianteDrawer } from '../components/actividades/EntregaEstudianteDrawer';
import { Alert, errorMessage } from '../components/ui/Alert';
import { Chip, EstadoEntregaBadge, TipoActividadChip } from '../components/ui/Badge';
import { Button } from '../components/ui/Button';
import { Card } from '../components/ui/Card';
import { Input } from '../components/ui/Field';
import { PageHeader } from '../components/ui/PageHeader';
import { Spinner } from '../components/ui/Spinner';
import { EmptyRow, Table, TableBody, TableHead, Td, Th } from '../components/ui/Table';
import { Tabs } from '../components/ui/Tabs';
import { ArrowLeftIcon } from '../components/ui/icons';
import { type ActividadEstudiante, useMisActividades } from '../hooks/useActividades';
import { useAnioDeTrabajo } from '../hooks/useAniosLectivos';
import { useMisNotas } from '../hooks/useNotas';
import { useContadoresDePestana } from '../hooks/useNotificaciones';
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

/**
 * CU-EST-03: La bandeja del estudiante con las actividades publicadas de su grupo.
 * Flujo en dos vistas para máxima claridad de UX:
 * - Vista 1: Catálogo de asignaturas matriculadas con sus tarjetas, iconos temáticos y resumen de actividades.
 * - Vista 2: Gestión y entrega de actividades de la materia seleccionada (filtros por fecha, pestañas y tabla de entregas).
 */
export function MisActividadesPage() {
  const { data = [], isLoading, isError, error } = useMisActividades();
  const { anio } = useAnioDeTrabajo();
  const notasQuery = useMisNotas(1, anio?._id);

  const [searchParams, setSearchParams] = useSearchParams();
  const asignaturaParam = searchParams.get('asignatura') ?? '';

  const [pestana, setPestana] = useState<Pestana>('pendientes');
  const contadorDe = useContadoresDePestana('/mis-actividades', pestana);
  const [desde, setDesde] = useState('');
  const [hasta, setHasta] = useState('');
  const [seleccionada, setSeleccionada] = useState<string | null>(null);

  // Catálogo completo de asignaturas del estudiante (de su matrícula y/o actividades publicadas)
  const asignaturasCatalogo = useMemo<AsignaturaEstudianteCard[]>(() => {
    const mapa = new Map<string, AsignaturaEstudianteCard>();

    // 1. Asignaturas de matrícula
    if (notasQuery.data?.asignaturas) {
      for (const item of notasQuery.data.asignaturas) {
        const asig = item.asignacion?.asignatura;
        if (!asig) continue;
        const doc = item.asignacion?.docente;
        const docenteNombre = doc ? `${doc.nombre} ${doc.apellido}` : undefined;
        const gradoNombre = item.asignacion?.grado?.nombre ?? '';
        const grupoNomenclatura = item.asignacion?.grupo?.nomenclatura ?? '';
        const gradoGrupo = [gradoNombre, grupoNomenclatura ? `Grupo ${grupoNomenclatura}` : ''].filter(Boolean).join(' · ');

        mapa.set(asig._id, {
          id: asig._id,
          nombre: asig.nombre,
          areaNombre: item.asignacion?.area?.nombre,
          docenteNombre,
          gradoGrupo: gradoGrupo || undefined,
          totalActividades: 0,
          pendientes: 0,
          proximas: 0,
        });
      }
    }

    // 2. Sumar datos de actividades reales publicadas
    for (const a of data) {
      const asig = a.asignacion?.asignatura;
      if (!asig) continue;
      const asigId = asig._id;
      if (!mapa.has(asigId)) {
        const doc = a.asignacion?.docente;
        const docenteNombre = doc ? `${doc.nombre} ${doc.apellido}` : undefined;
        const gradoNombre = a.asignacion?.grado?.nombre ?? '';
        const grupoNomenclatura = a.asignacion?.grupo?.nomenclatura ?? '';
        const gradoGrupo = [gradoNombre, grupoNomenclatura ? `Grupo ${grupoNomenclatura}` : ''].filter(Boolean).join(' · ');

        mapa.set(asigId, {
          id: asigId,
          nombre: asig.nombre,
          areaNombre: a.asignacion?.area?.nombre,
          docenteNombre,
          gradoGrupo: gradoGrupo || undefined,
          totalActividades: 0,
          pendientes: 0,
          proximas: 0,
        });
      }

      const card = mapa.get(asigId)!;
      card.totalActividades += 1;
      if (a.estado === 'PROGRAMADA') {
        card.pendientes += 1;
        const dias = diasParaEntrega(a.fecha_entrega);
        if (dias >= 0 && dias <= 3) {
          card.proximas += 1;
        }
      }
    }

    return Array.from(mapa.values()).sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'));
  }, [data, notasQuery.data]);

  // Si hay una asignatura seleccionada en la URL, estamos en Vista 2
  const enVistaDetalle = Boolean(asignaturaParam);
  const materiaActiva = asignaturasCatalogo.find((a) => a.id === asignaturaParam);

  function seleccionarAsignatura(id: string) {
    const nuevosParams = new URLSearchParams(searchParams);
    nuevosParams.set('asignatura', id);
    setSearchParams(nuevosParams);
  }

  function volverACatalogo() {
    const nuevosParams = new URLSearchParams(searchParams);
    nuevosParams.delete('asignatura');
    setSearchParams(nuevosParams);
    setDesde('');
    setHasta('');
  }

  const filtradas = useMemo(
    () =>
      data.filter(
        (a) =>
          (!asignaturaParam || a.asignacion?.asignatura?._id === asignaturaParam) &&
          (!desde || diaDe(a.fecha_entrega) >= desde) &&
          (!hasta || diaDe(a.fecha_entrega) <= hasta)
      ),
    [data, asignaturaParam, desde, hasta]
  );

  const visibles = filtradas.filter(PERTENECE[pestana]);
  const cuenta = (p: Pestana) => filtradas.filter(PERTENECE[p]).length;
  const filtrando = Boolean(desde || hasta);

  // La pestaña de «pendientes» ordena lo más próximo a vencer primero (el servidor ya entrega ordenado por fecha).
  const abierta = data.find((a) => a._id === seleccionada) ?? null;

  return (
    <div className="space-y-4">
      {/* VISTA 1: Catálogo de Asignaturas del Estudiante */}
      {!enVistaDetalle && (
        <>
          <PageHeader
            title="Mis asignaturas"
            subtitle="Selecciona la asignatura que deseas consultar y accede a sus actividades, evaluaciones y proyectos."
          />

          {isLoading ? (
            <div className="flex justify-center p-12">
              <Spinner label="Cargando tus asignaturas y actividades..." />
            </div>
          ) : (
            <CatalogoAsignaturasEstudiante
              asignaturas={asignaturasCatalogo}
              onSeleccionarAsignatura={seleccionarAsignatura}
            />
          )}
        </>
      )}

      {/* VISTA 2: Detalle y Entregas de la Asignatura Seleccionada */}
      {enVistaDetalle && (
        <>
          <div className="flex items-center justify-between gap-3">
            <Button type="button" variant="outline" onClick={volverACatalogo} className="inline-flex items-center gap-2">
              <ArrowLeftIcon className="h-4 w-4" />
              Volver a mis asignaturas
            </Button>
          </div>

          <PageHeader
            title={materiaActiva?.nombre ?? 'Actividades'}
            subtitle={
              materiaActiva?.docenteNombre
                ? `Profe. ${materiaActiva.docenteNombre} · Tareas, evaluaciones y proyectos asignados.`
                : 'Tareas, evaluaciones, trabajos y proyectos de esta asignatura.'
            }
          />

          {/* Filtros de fecha reubicados */}
          <Card>
            <div className="grid grid-cols-1 items-end gap-4 p-4 sm:grid-cols-3">
              <Input label="Entrega desde" type="date" value={desde} max={hasta || undefined} onChange={(e) => setDesde(e.target.value)} />
              <Input label="Entrega hasta" type="date" value={hasta} min={desde || undefined} onChange={(e) => setHasta(e.target.value)} />
              {filtrando && (
                <Button
                  type="button"
                  variant="secondary"
                  onClick={() => {
                    setDesde('');
                    setHasta('');
                  }}
                >
                  Quitar filtros
                </Button>
              )}
            </div>
          </Card>

          {/* Pestañas con contadores en tiempo real */}
          <Tabs
            items={[
              { key: 'pendientes', label: `Pendientes (${cuenta('pendientes')})`, contador: contadorDe('pendientes') },
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
                <Th>Límite de entrega</Th>
                <Th>Estado</Th>
                <Th className="text-right">Acción</Th>
              </TableHead>
              <TableBody>
                {visibles.length === 0 && (
                  <EmptyRow colSpan={4}>
                    {data.length === 0
                      ? 'Tus docentes aún no han publicado actividades.'
                      : pestana === 'pendientes'
                        ? 'No tienes actividades pendientes en esta materia. 🎉'
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
                      <p className="mt-0.5 text-xs text-muted">{a.componente_nombre}</p>
                    </Td>
                    <Td>
                      <p>{formatoInstante(a.fecha_entrega)}</p>
                      <Plazo actividad={a} />
                    </Td>
                    <Td>
                      <div className="flex flex-wrap items-center gap-2">
                        <EstadoEntregaBadge value={a.estado} />
                        {a.estado === 'CALIFICADA' && a.entrega && (
                          <span className="font-semibold text-ink">{a.entrega.calificacion_numerica}</span>
                        )}
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
        </>
      )}
    </div>
  );
}

