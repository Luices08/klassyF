import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { CitacionDrawer } from '../components/citaciones/CitacionDrawer';
import { DetalleCitacionPanel } from '../components/citaciones/DetalleCitacionPanel';
import { EstadoCitacionChip } from '../components/citaciones/chipsCitacion';
import { Alert, errorMessage } from '../components/ui/Alert';
import { Button } from '../components/ui/Button';
import { Chip } from '../components/ui/Badge';
import { FiltrosRapidos } from '../components/ui/FiltrosRapidos';
import { Input } from '../components/ui/Field';
import { PageHeader } from '../components/ui/PageHeader';
import { Spinner } from '../components/ui/Spinner';
import { EmptyRow, Table, TableBody, TableHead, Td, Th } from '../components/ui/Table';
import { ArrowLeftIcon, PlusIcon } from '../components/ui/icons';
import { useAnioDeTrabajo } from '../hooks/useAniosLectivos';
import { type EstadoCitacion, NOMBRES_MOTIVO_CITACION, useCitaciones, useDetalleCitacion } from '../hooks/useCitaciones';
import { useDebouncedValue } from '../hooks/useDebouncedValue';
import { formatoFechaHora } from '../lib/fechas';

type Filtro = 'TODAS' | EstadoCitacion;

/**
 * Reuniones y citaciones a acudientes (M24). Se cita a uno o varios grupos (entrega de boletines) o a un estudiante (comportamiento o
 * rendimiento); el correo sale en segundo plano y cada acudiente confirma desde el correo o desde su portal.
 */
export function CitacionesPage() {
  const { anio, query: aniosQuery } = useAnioDeTrabajo();
  const [parametros, setParametros] = useSearchParams();
  const abierta = parametros.get('citacion');
  const [filtro, setFiltro] = useState<Filtro>('TODAS');
  const [busqueda, setBusqueda] = useState('');
  const buscar = useDebouncedValue(busqueda, 300);
  const [drawer, setDrawer] = useState<'crear' | 'editar' | null>(null);

  const lista = useCitaciones(anio?._id, { estado: filtro === 'TODAS' ? undefined : filtro, search: buscar || undefined });
  const detalle = useDetalleCitacion(abierta);

  const abrir = (id: string | null) => setParametros(id ? { citacion: id } : {}, { replace: false });

  if (aniosQuery.isLoading) return <Spinner />;
  if (!anio) return <Alert tone="warning">Aún no hay un año lectivo: crea uno en «Año lectivo y periodos».</Alert>;

  return (
    <div className="space-y-4">
      <PageHeader
        title="Reuniones y citaciones"
        subtitle="Cita a los acudientes de un grupo o de un estudiante y sigue quién confirmó su asistencia."
        action={
          !abierta ? (
            <Button onClick={() => setDrawer('crear')}>
              <PlusIcon className="h-4 w-4" /> Nueva citación
            </Button>
          ) : undefined
        }
      />

      {abierta ? (
        <div className="space-y-4">
          <Button variant="secondary" onClick={() => abrir(null)}>
            <ArrowLeftIcon className="h-4 w-4" /> Volver a la lista
          </Button>
          {detalle.isLoading && <Spinner />}
          {detalle.error && <Alert tone="error">{errorMessage(detalle.error)}</Alert>}
          {detalle.data && <DetalleCitacionPanel detalle={detalle.data} onEditar={() => setDrawer('editar')} />}
        </div>
      ) : (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center gap-3">
            <div className="w-full max-w-sm">
              <Input label="Buscar" hideLabel placeholder="Título de la citación" value={busqueda} onChange={(e) => setBusqueda(e.target.value)} />
            </div>
            <FiltrosRapidos
              ariaLabel="Estado de la citación"
              valor={filtro}
              onChange={(k) => setFiltro(k as Filtro)}
              items={[
                { clave: 'TODAS', etiqueta: 'Todas' },
                { clave: 'PROGRAMADA', etiqueta: 'Programadas' },
                { clave: 'REALIZADA', etiqueta: 'Realizadas' },
                { clave: 'CANCELADA', etiqueta: 'Canceladas' },
              ]}
            />
          </div>
          {lista.error && <Alert tone="error">{errorMessage(lista.error)}</Alert>}
          <Table>
            <TableHead>
              <tr>
                <Th>Citación</Th>
                <Th>Fecha y lugar</Th>
                <Th>Convoca</Th>
                <Th>Respuestas</Th>
                <Th>Estado</Th>
              </tr>
            </TableHead>
            <TableBody>
              {lista.isLoading && <EmptyRow colSpan={5}>Cargando…</EmptyRow>}
              {!lista.isLoading && (lista.data ?? []).length === 0 && <EmptyRow colSpan={5}>No hay citaciones en este año.</EmptyRow>}
              {(lista.data ?? []).map((c) => (
                <tr key={c._id} className="cursor-pointer hover:bg-soft" onClick={() => abrir(c._id)}>
                  <Td>
                    <span className="block font-semibold text-ink">{c.titulo}</span>
                    <span className="block text-xs text-muted">
                      {NOMBRES_MOTIVO_CITACION[c.motivo]} · {c.tipo === 'GENERAL' ? 'General' : 'Particular'}
                    </span>
                  </Td>
                  <Td>
                    {formatoFechaHora(c.fecha_hora)}
                    <span className="block text-xs text-muted">{c.lugar}</span>
                  </Td>
                  <Td>{c.convocante}</Td>
                  <Td>
                    <div className="flex flex-wrap gap-1">
                      <Chip tone="green">{c.confirmados} asistirán</Chip>
                      {c.no_asistiran > 0 && <Chip tone="red">{c.no_asistiran} no</Chip>}
                      {c.pendientes > 0 && <Chip>{c.pendientes} sin responder</Chip>}
                    </div>
                  </Td>
                  <Td>
                    <EstadoCitacionChip estado={c.estado} />
                  </Td>
                </tr>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      <CitacionDrawer
        open={drawer !== null}
        citacion={drawer === 'editar' ? detalle.data : null}
        onClose={() => setDrawer(null)}
        onGuardada={(id) => {
          setDrawer(null);
          abrir(id);
        }}
      />
    </div>
  );
}
