import { useState } from 'react';
import { EscalasExternasPanel } from '../../components/traslados/EscalasExternasPanel';
import { HomologacionPanel } from '../../components/traslados/HomologacionPanel';
import { TrasladoDrawer } from '../../components/traslados/TrasladoDrawer';
import { Alert, errorMessage } from '../../components/ui/Alert';
import { Chip } from '../../components/ui/Badge';
import { Button } from '../../components/ui/Button';
import { Card } from '../../components/ui/Card';
import { Input } from '../../components/ui/Field';
import { PageHeader } from '../../components/ui/PageHeader';
import { ProgressBar } from '../../components/ui/ProgressBar';
import { Spinner } from '../../components/ui/Spinner';
import { TabPanel, Tabs } from '../../components/ui/Tabs';
import { EmptyRow, Table, TableBody, TableHead, Td, Th } from '../../components/ui/Table';
import { ArrowLeftIcon, PencilIcon, PlusIcon } from '../../components/ui/icons';
import { useAuth } from '../../context/AuthContext';
import { useAnioDeTrabajo } from '../../hooks/useAniosLectivos';
import { useDebouncedValue } from '../../hooks/useDebouncedValue';
import { useDetalleTraslado, useTraslados } from '../../hooks/useTraslados';
import { formatoFechaCalendario } from '../../lib/fechas';

/**
 * Traslados extemporáneos y homologación de notas (M04 → M12): se registra el ingreso del estudiante a mitad de año y se
 * homologan las notas del colegio de procedencia como definitivas de los periodos anteriores, sin que el docente califique nada.
 */
export function TrasladosPage() {
  const { user } = useAuth();
  const { anio, query: aniosQuery } = useAnioDeTrabajo();
  const [pestana, setPestana] = useState('traslados');
  const [busqueda, setBusqueda] = useState('');
  const buscar = useDebouncedValue(busqueda, 300);
  const [abierto, setAbierto] = useState<string | null>(null);
  const [drawer, setDrawer] = useState<'nuevo' | 'editar' | null>(null);

  const lista = useTraslados(anio?._id, buscar);
  const detalle = useDetalleTraslado(abierto);
  const puedeConfigurarEscalas = user?.rol === 'ADMIN' || user?.rol === 'COORDINADOR';

  if (aniosQuery.isLoading) return <Spinner />;
  if (!anio) return <Alert tone="warning">Aún no hay un año lectivo: crea uno en «Año lectivo y periodos».</Alert>;

  const items = [{ key: 'traslados', label: 'Traslados' }, ...(puedeConfigurarEscalas ? [{ key: 'escalas', label: 'Escalas de otras instituciones' }] : [])];

  return (
    <div className="space-y-4">
      <PageHeader
        title="Traslados y homologación de notas"
        subtitle={`Estudiantes que llegaron con el año ${anio.year} empezado y las notas de su colegio de procedencia.`}
        action={
          pestana === 'traslados' && !abierto ? (
            <Button onClick={() => setDrawer('nuevo')}>
              <PlusIcon className="h-4 w-4" /> Registrar traslado
            </Button>
          ) : undefined
        }
      />
      <Tabs items={items} active={pestana} onChange={(k) => { setPestana(k); setAbierto(null); }} />

      <TabPanel active={pestana} tabKey="traslados">
        {abierto ? (
          <div className="space-y-4">
            <div className="flex items-center justify-between gap-3">
              <Button variant="secondary" onClick={() => setAbierto(null)}>
                <ArrowLeftIcon className="h-4 w-4" /> Volver a la lista
              </Button>
              {detalle.data?.editable && (
                <Button variant="soft-edit" onClick={() => setDrawer('editar')}>
                  <PencilIcon className="h-4 w-4" /> Editar datos del traslado
                </Button>
              )}
            </div>
            {detalle.isLoading && <Spinner />}
            {detalle.error && <Alert tone="error">{errorMessage(detalle.error)}</Alert>}
            {detalle.data && (
              <>
                <Card>
                  <div className="flex flex-wrap items-center gap-x-6 gap-y-1 text-sm">
                    <span className="text-h3 text-ink">{detalle.data.estudiante?.apellido}, {detalle.data.estudiante?.nombre}</span>
                    <span className="text-muted">{detalle.data.grupo?.nombre} · {detalle.data.grupo?.sede} · {detalle.data.grupo?.jornada}</span>
                    <span>Ingresó el {formatoFechaCalendario(detalle.data.fecha_ingreso)} (periodo {detalle.data.periodo_ingreso}) desde <strong>{detalle.data.institucion_procedencia.nombre}</strong></span>
                  </div>
                </Card>
                <HomologacionPanel detalle={detalle.data} />
              </>
            )}
          </div>
        ) : (
          <div className="space-y-4">
            <div className="max-w-sm">
              <Input label="Buscar" hideLabel placeholder="Estudiante, documento o colegio de origen" value={busqueda} onChange={(e) => setBusqueda(e.target.value)} />
            </div>
            {lista.error && <Alert tone="error">{errorMessage(lista.error)}</Alert>}
            <Table>
              <TableHead>
                <tr>
                  <Th>Estudiante</Th>
                  <Th>Grupo</Th>
                  <Th>Ingreso</Th>
                  <Th>Procedencia</Th>
                  <Th>Homologación</Th>
                </tr>
              </TableHead>
              <TableBody>
                {lista.isLoading && <EmptyRow colSpan={5}>Cargando…</EmptyRow>}
                {!lista.isLoading && (lista.data ?? []).length === 0 && <EmptyRow colSpan={5}>No hay traslados registrados en este año.</EmptyRow>}
                {(lista.data ?? []).map((t) => {
                  const hechas = t.avance.homologadas + t.avance.exentas;
                  const completa = t.avance.esperadas > 0 && hechas >= t.avance.esperadas;
                  return (
                    <tr key={t._id} className="cursor-pointer hover:bg-soft" onClick={() => setAbierto(t._id)}>
                      <Td>
                        <span className="block font-semibold text-ink">{t.estudiante.apellido}, {t.estudiante.nombre}</span>
                        <span className="block text-xs text-muted">{t.estudiante.numero_documento}</span>
                      </Td>
                      <Td>{t.grupo}</Td>
                      <Td>
                        <span className="block">{formatoFechaCalendario(t.fecha_ingreso)}</span>
                        <span className="block text-xs text-muted">{t.nombre_periodo_ingreso}</span>
                      </Td>
                      <Td>{t.institucion_procedencia}</Td>
                      <Td>
                        {t.avance.esperadas === 0 ? (
                          <Chip tone="neutral">Nada que homologar</Chip>
                        ) : (
                          <div className="w-40 space-y-1">
                            <ProgressBar value={hechas} max={t.avance.esperadas} tone={completa ? 'green' : 'orange'} />
                            <span className="block text-xs text-muted">{t.avance.homologadas} homologadas · {t.avance.exentas} exentas de {t.avance.esperadas}</span>
                          </div>
                        )}
                      </Td>
                    </tr>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        )}
      </TabPanel>

      {puedeConfigurarEscalas && (
        <TabPanel active={pestana} tabKey="escalas">
          <EscalasExternasPanel />
        </TabPanel>
      )}

      <TrasladoDrawer
        open={drawer !== null}
        detalle={drawer === 'editar' ? detalle.data ?? null : null}
        onClose={() => setDrawer(null)}
        onGuardado={(id) => setAbierto(id)}
      />
    </div>
  );
}
