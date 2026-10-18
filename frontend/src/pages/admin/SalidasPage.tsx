import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { DetalleSalidaPanel } from '../../components/salidas/DetalleSalidaPanel';
import { EstadoPazYSalvoSalidaChip } from '../../components/salidas/MatrizPazYSalvoSalida';
import { RegistrarSalidaDrawer } from '../../components/salidas/RegistrarSalidaDrawer';
import { Alert, errorMessage } from '../../components/ui/Alert';
import { Chip } from '../../components/ui/Badge';
import { Button } from '../../components/ui/Button';
import { FiltrosRapidos } from '../../components/ui/FiltrosRapidos';
import { Input } from '../../components/ui/Field';
import { PageHeader } from '../../components/ui/PageHeader';
import { Spinner } from '../../components/ui/Spinner';
import { EmptyRow, Table, TableBody, TableHead, Td, Th } from '../../components/ui/Table';
import { ArrowLeftIcon, PlusIcon } from '../../components/ui/icons';
import { useAnioDeTrabajo } from '../../hooks/useAniosLectivos';
import { useDebouncedValue } from '../../hooks/useDebouncedValue';
import { type EstadoPazYSalvoSalida, NOMBRES_TIPO_SALIDA, useDetalleSalida, useSalidas } from '../../hooks/useSalidas';
import { formatoFechaCalendario } from '../../lib/fechas';

type FiltroPaz = 'TODOS' | EstadoPazYSalvoSalida;

/**
 * Retiros y traslados durante el año (M04 → M11/M13/M17/M26): se registra la salida con su fecha efectiva, se verifica el paz y salvo por
 * dependencia y se genera el boletín parcial. El estudiante deja de aparecer en el aula, pero nada de lo registrado se borra.
 */
export function SalidasPage() {
  const { anio, query: aniosQuery } = useAnioDeTrabajo();
  const [parametros, setParametros] = useSearchParams();
  const abierto = parametros.get('matricula');
  const [busqueda, setBusqueda] = useState('');
  const buscar = useDebouncedValue(busqueda, 300);
  const [filtroPaz, setFiltroPaz] = useState<FiltroPaz>('TODOS');
  const [drawer, setDrawer] = useState(false);

  const lista = useSalidas(anio?._id, { search: buscar || undefined, estado_paz_y_salvo: filtroPaz === 'TODOS' ? undefined : filtroPaz });
  const detalle = useDetalleSalida(abierto);

  const abrir = (id: string | null) => setParametros(id ? { matricula: id } : {}, { replace: false });

  if (aniosQuery.isLoading) return <Spinner />;
  if (!anio) return <Alert tone="warning">Aún no hay un año lectivo: crea uno en «Año lectivo y periodos».</Alert>;

  return (
    <div className="space-y-4">
      <PageHeader
        title="Retiros y traslados"
        subtitle={`Estudiantes que salieron durante el año ${anio.year}, su paz y salvo y su boletín parcial.`}
        action={
          !abierto ? (
            <Button onClick={() => setDrawer(true)}>
              <PlusIcon className="h-4 w-4" /> Registrar salida
            </Button>
          ) : undefined
        }
      />

      {abierto ? (
        <div className="space-y-4">
          <Button variant="secondary" onClick={() => abrir(null)}>
            <ArrowLeftIcon className="h-4 w-4" /> Volver a la lista
          </Button>
          {detalle.isLoading && <Spinner />}
          {detalle.error && <Alert tone="error">{errorMessage(detalle.error)}</Alert>}
          {detalle.data && <DetalleSalidaPanel detalle={detalle.data} />}
        </div>
      ) : (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center gap-3">
            <div className="w-full max-w-sm">
              <Input label="Buscar" hideLabel placeholder="Estudiante, documento o institución receptora" value={busqueda} onChange={(e) => setBusqueda(e.target.value)} />
            </div>
            <FiltrosRapidos
              ariaLabel="Estado del paz y salvo"
              valor={filtroPaz}
              onChange={(k) => setFiltroPaz(k as FiltroPaz)}
              items={[
                { clave: 'TODOS', etiqueta: 'Todos' },
                { clave: 'PENDIENTE', etiqueta: 'Pendientes' },
                { clave: 'BLOQUEADO', etiqueta: 'Bloqueados' },
                { clave: 'APROBADO', etiqueta: 'Aprobados' },
              ]}
            />
          </div>
          {lista.error && <Alert tone="error">{errorMessage(lista.error)}</Alert>}
          <Table>
            <TableHead>
              <tr>
                <Th>Estudiante</Th>
                <Th>Grupo</Th>
                <Th>Salida</Th>
                <Th>Paz y salvo</Th>
                <Th>Cupo</Th>
              </tr>
            </TableHead>
            <TableBody>
              {lista.isLoading && <EmptyRow colSpan={5}>Cargando…</EmptyRow>}
              {!lista.isLoading && (lista.data ?? []).length === 0 && <EmptyRow colSpan={5}>No hay retiros ni traslados registrados en este año.</EmptyRow>}
              {(lista.data ?? []).map((f) => (
                <tr key={f.enrollment_id} className="cursor-pointer hover:bg-soft" onClick={() => abrir(f.enrollment_id)}>
                  <Td>
                    <span className="block font-semibold text-ink">
                      {f.estudiante.apellido}, {f.estudiante.nombre}
                    </span>
                    <span className="block text-xs text-muted">{f.estudiante.numero_documento}</span>
                  </Td>
                  <Td>
                    {f.grupo}
                    <span className="block text-xs text-muted">{f.sede}</span>
                  </Td>
                  <Td>
                    <div className="flex flex-wrap items-center gap-2">
                      <Chip tone={f.tipo === 'TRASLADO' ? 'blue' : 'neutral'}>{NOMBRES_TIPO_SALIDA[f.tipo]}</Chip>
                      {f.legado && <Chip tone="orange">Sin fecha efectiva</Chip>}
                    </div>
                    <span className="block text-xs text-muted">{f.fecha_efectiva ? formatoFechaCalendario(f.fecha_efectiva) : 'Anterior al módulo'}</span>
                    {f.institucion_receptora && <span className="block text-xs text-muted">→ {f.institucion_receptora}</span>}
                  </Td>
                  <Td>
                    <EstadoPazYSalvoSalidaChip estado={f.estado_paz_y_salvo} />
                    {f.dependencias_pendientes > 0 && <span className="mt-1 block text-xs text-muted">{f.dependencias_pendientes} dependencia(s) sin aprobar</span>}
                  </Td>
                  <Td>{f.cupo_liberado ? <Chip tone="green">Liberado</Chip> : <Chip tone="orange">Pendiente</Chip>}</Td>
                </tr>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      <RegistrarSalidaDrawer open={drawer} onClose={() => setDrawer(false)} onRegistrado={(id) => { setDrawer(false); abrir(id); }} />
    </div>
  );
}
