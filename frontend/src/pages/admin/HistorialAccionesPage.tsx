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
import { nombreDeUsuario, tonoDeAccion, tonoDeTipo } from '../../lib/historial';
import { opcionesDePersonas } from '../../lib/opcionesBuscables';
import type { FiltrosHistorial } from '../../types/historial';

const SIN_FILTROS: FiltrosHistorial = { modulo: '', tipo: '', accion: '', usuario_id: '', desde: '', hasta: '', texto: '' };

/**
 * M31: lo que se creó, editó, matriculó y eliminó en el sistema, solo lectura y solo para el administrador.
 * Las consultas, descargas e inicios de sesión se guardan en la bitácora pero no se muestran aquí.
 */
export function HistorialAccionesPage() {
  const [borrador, setBorrador] = useState<FiltrosHistorial>(SIN_FILTROS);
  const [filtros, setFiltros] = useState<FiltrosHistorial>(SIN_FILTROS);
  const [page, setPage] = useState(1);
  const catalogo = useCatalogoHistorial();
  const usuarios = useUsers();
  const historial = useHistorial(filtros, page);
  const exportar = useExportarHistorial();

  // La lista de acciones sigue al módulo y al tipo elegidos: así no se ofrece una combinación que no devolvería nada.
  const accionesDelModulo = useMemo(
    () =>
      (catalogo.data?.acciones ?? [])
        .filter((a) => (!borrador.modulo || a.modulo === borrador.modulo) && (!borrador.tipo || a.tipo === borrador.tipo))
        .sort((a, b) => a.etiqueta.localeCompare(b.etiqueta, 'es')),
    [catalogo.data, borrador.modulo, borrador.tipo]
  );
  const cambiar = (campo: keyof FiltrosHistorial, valor: string) =>
    setBorrador((b) => ({ ...b, [campo]: valor, ...(campo === 'modulo' || campo === 'tipo' ? { accion: '' } : {}) }));

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
        subtitle="Quién creó, editó, matriculó o eliminó algo en el sistema, y cuándo. Solo lectura: ningún evento se modifica ni se elimina."
        action={
          <Button variant="outline" onClick={() => exportar.mutate(filtros)} isLoading={exportar.isPending}>
            <DownloadIcon className="h-4 w-4" />
            Exportar a Excel
          </Button>
        }
      />

      <Card>
        <form onSubmit={aplicar} className="grid gap-3 md:grid-cols-3 lg:grid-cols-4">
          <Select label="Tipo de evento" value={borrador.tipo} onChange={(e) => cambiar('tipo', e.target.value)}>
            <option value="">Todos los tipos</option>
            {catalogo.data?.tipos.map((t) => (
              <option key={t.clave} value={t.clave}>
                {t.nombre}
              </option>
            ))}
          </Select>
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
          <div className="flex gap-2 md:col-span-3 lg:col-span-4">
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
            <Th>Tipo</Th>
            <Th>Módulo</Th>
            <Th>Acción</Th>
            <Th>Detalle</Th>
            <Th>{''}</Th>
          </TableHead>
          <TableBody>
            {pagina?.data.length === 0 && <EmptyRow colSpan={7}>No hay eventos con esos filtros.</EmptyRow>}
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
                  <Chip tone={tonoDeTipo(ev.tipo)}>{ev.tipo_nombre}</Chip>
                </Td>
                <Td>
                  <span className="text-sm text-body">{ev.modulo_nombre}</span>
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
