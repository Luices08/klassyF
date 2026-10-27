import { type FormEvent, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Alert, errorMessage } from '../../components/ui/Alert';
import { Chip, RolBadge } from '../../components/ui/Badge';
import { Button } from '../../components/ui/Button';
import { Card } from '../../components/ui/Card';
import { Input, Select } from '../../components/ui/Field';
import { DownloadIcon, SearchIcon } from '../../components/ui/icons';
import { PageHeader } from '../../components/ui/PageHeader';
import { SelectBuscable } from '../../components/ui/SelectBuscable';
import { Spinner } from '../../components/ui/Spinner';
import { EmptyRow, Table, TableBody, TableHead, Td, Th } from '../../components/ui/Table';
import { useCatalogoHistorial, useExportarHistorial, useHistorial } from '../../hooks/useHistorial';
import { useUsers } from '../../hooks/useUsers';
import { formatoFechaHora } from '../../lib/fechas';
import { nombreDeUsuario, tonoDeAccion } from '../../lib/historial';
import { opcionesDePersonas } from '../../lib/opcionesBuscables';
import type { FiltrosHistorial } from '../../types/historial';

const SIN_FILTROS: FiltrosHistorial = { modulo: '', accion: '', usuario_id: '', desde: '', hasta: '', texto: '' };

/** M31: la bitácora de todo el sistema, solo lectura y solo para el administrador. */
export function HistorialAccionesPage() {
  const [borrador, setBorrador] = useState<FiltrosHistorial>(SIN_FILTROS);
  const [filtros, setFiltros] = useState<FiltrosHistorial>(SIN_FILTROS);
  const [page, setPage] = useState(1);
  const catalogo = useCatalogoHistorial();
  const usuarios = useUsers();
  const historial = useHistorial(filtros, page);
  const exportar = useExportarHistorial();

  const accionesDelModulo = useMemo(
    () => (catalogo.data?.acciones ?? []).filter((a) => !borrador.modulo || a.modulo === borrador.modulo).sort((a, b) => a.etiqueta.localeCompare(b.etiqueta, 'es')),
    [catalogo.data, borrador.modulo]
  );
  const cambiar = (campo: keyof FiltrosHistorial, valor: string) =>
    setBorrador((b) => ({ ...b, [campo]: valor, ...(campo === 'modulo' ? { accion: '' } : {}) }));

  const aplicar = (e: FormEvent) => {
    e.preventDefault();
    setFiltros(borrador);
    setPage(1);
  };
  const limpiar = () => {
    setBorrador(SIN_FILTROS);
    setFiltros(SIN_FILTROS);
    setPage(1);
  };

  const pagina = historial.data;

  return (
    <div className="space-y-4">
      <PageHeader
        title="Historial de acciones"
        subtitle="Quién hizo qué y cuándo en todo el sistema. La bitácora es de solo escritura: ningún evento se modifica ni se elimina."
        action={
          <Button variant="outline" onClick={() => exportar.mutate(filtros)} isLoading={exportar.isPending}>
            <DownloadIcon className="h-4 w-4" />
            Exportar a Excel
          </Button>
        }
      />

      <Card>
        <form onSubmit={aplicar} className="grid gap-3 md:grid-cols-3 lg:grid-cols-6">
          <Select label="Módulo" value={borrador.modulo} onChange={(e) => cambiar('modulo', e.target.value)}>
            <option value="">Todos los módulos</option>
            {catalogo.data?.modulos.map((m) => (
              <option key={m.clave} value={m.clave}>
                {m.nombre}
              </option>
            ))}
          </Select>
          <Select label="Acción" value={borrador.accion} onChange={(e) => cambiar('accion', e.target.value)}>
            <option value="">Todas las acciones</option>
            {accionesDelModulo.map((a) => (
              <option key={a.accion} value={a.accion}>
                {a.etiqueta}
              </option>
            ))}
          </Select>
          <SelectBuscable
            label="Usuario"
            value={borrador.usuario_id ?? ''}
            onChange={(v) => cambiar('usuario_id', v)}
            opciones={opcionesDePersonas(usuarios.data ?? [])}
            vacioLabel="Todos los usuarios"
          />
          <Input label="Desde" type="date" value={borrador.desde} onChange={(e) => cambiar('desde', e.target.value)} />
          <Input label="Hasta" type="date" value={borrador.hasta} onChange={(e) => cambiar('hasta', e.target.value)} />
          <Input label="Buscar en el detalle" placeholder="Folio, grupo, nombre…" value={borrador.texto} onChange={(e) => cambiar('texto', e.target.value)} />
          <div className="flex gap-2 md:col-span-3 lg:col-span-6">
            <Button type="submit">
              <SearchIcon className="h-4 w-4" />
              Buscar
            </Button>
            <Button type="button" variant="secondary" onClick={limpiar}>
              Limpiar filtros
            </Button>
          </div>
        </form>
      </Card>

      {historial.isError && <Alert tone="error">{errorMessage(historial.error)}</Alert>}
      {exportar.isError && <Alert tone="error">{errorMessage(exportar.error)}</Alert>}

      {historial.isLoading ? (
        <Spinner />
      ) : (
        <Table>
          <TableHead>
            <Th>Fecha y hora</Th>
            <Th>Usuario</Th>
            <Th>Módulo</Th>
            <Th>Acción</Th>
            <Th>Detalle</Th>
            <Th>{''}</Th>
          </TableHead>
          <TableBody>
            {pagina?.data.length === 0 && <EmptyRow colSpan={6}>No hay eventos con esos filtros.</EmptyRow>}
            {pagina?.data.map((ev) => (
              <tr key={ev._id}>
                <Td>
                  <span className="whitespace-nowrap">{formatoFechaHora(ev.fecha)}</span>
                  {ev.ip && <span className="block text-xs text-muted">IP {ev.ip}</span>}
                </Td>
                <Td>
                  <span className="block text-ink">{nombreDeUsuario(ev.usuario)}</span>
                  {ev.usuario && (
                    <span className="mt-1 flex flex-wrap gap-1">
                      {ev.usuario.roles.map((r) => (
                        <RolBadge key={r} value={r} />
                      ))}
                    </span>
                  )}
                </Td>
                <Td>
                  <Chip tone="blue">{ev.modulo_nombre}</Chip>
                </Td>
                <Td>
                  <Chip tone={tonoDeAccion(ev.accion)}>{ev.etiqueta}</Chip>
                </Td>
                <Td>
                  <span className="text-sm">{ev.detalle ?? '—'}</span>
                </Td>
                <Td>
                  {ev.enlace && (
                    <Link to={ev.enlace} className="text-sm font-semibold text-primary hover:underline">
                      Abrir
                    </Link>
                  )}
                </Td>
              </tr>
            ))}
          </TableBody>
        </Table>
      )}

      {pagina && pagina.pages > 1 && (
        <div className="flex items-center justify-between">
          <p className="text-sm text-muted">
            Página {pagina.page} de {pagina.pages} ({pagina.total} eventos)
          </p>
          <div className="flex gap-2">
            <Button variant="secondary" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
              Anterior
            </Button>
            <Button variant="secondary" disabled={page >= pagina.pages} onClick={() => setPage((p) => p + 1)}>
              Siguiente
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
