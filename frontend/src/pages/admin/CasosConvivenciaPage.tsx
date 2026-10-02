import { useState } from 'react';
import { AbrirCasoDrawer } from '../../components/convivencia/AbrirCasoDrawer';
import { CasoDetalleDrawer } from '../../components/convivencia/CasoDetalleDrawer';
import { Alert, errorMessage } from '../../components/ui/Alert';
import { Chip, EstadoCasoBadge, TipoSituacionBadge } from '../../components/ui/Badge';
import { Button } from '../../components/ui/Button';
import { Card, CardHeader } from '../../components/ui/Card';
import { Select } from '../../components/ui/Field';
import { PageHeader } from '../../components/ui/PageHeader';
import { Spinner } from '../../components/ui/Spinner';
import { EmptyRow, Table, TableBody, TableHead, Td, Th } from '../../components/ui/Table';
import { PlusIcon } from '../../components/ui/icons';
import { useCasosConAlertas } from '../../hooks/useComite';
import { ESTADOS_CASO, NOMBRES_ESTADO_CASO, NOMBRES_ROL_INVOLUCRADO, useCasos, type EstadoCaso } from '../../hooks/useCasos';
import { TIPOS_SITUACION, type TipoSituacion } from '../../hooks/useObservaciones';
import { formatoFechaCalendario } from '../../lib/fechas';

/** Casos de convivencia (M15): solo ADMIN y el coordinador de convivencia de la sede. */
export function CasosConvivenciaPage() {
  const [estado, setEstado] = useState<EstadoCaso | ''>('');
  const [tipo, setTipo] = useState<TipoSituacion | ''>('');
  const [pagina, setPagina] = useState(1);
  const casos = useCasos({ estado, tipo_situacion: tipo, pagina });
  const alertas = useCasosConAlertas();
  const [abriendo, setAbriendo] = useState(false);
  const [abierto, setAbierto] = useState<string | null>(null);

  const { data = [], total = 0, limite = 20 } = casos.data ?? {};
  const paginas = Math.max(1, Math.ceil(total / limite));

  return (
    <div className="space-y-4">
      <PageHeader
        title="Casos de convivencia"
        subtitle="Situaciones tipo I, II y III con su protocolo, descargos, remisiones y decisión. Solo convivencia accede a esta información."
        action={
          <Button onClick={() => setAbriendo(true)}>
            <PlusIcon className="h-4 w-4" /> Abrir caso
          </Button>
        }
      />

      {(alertas.data ?? []).length > 0 && (
        <Alert tone="warning">
          <p className="font-semibold">Casos que requieren atención:</p>
          <ul className="mt-1 space-y-0.5">
            {alertas.data?.map((c) => (
              <li key={c._id}>
                <button type="button" className="underline" onClick={() => setAbierto(c._id)}>
                  {c.codigo}
                </button>{' '}
                · {c.alertas.map((a) => a.mensaje).join(' ')}
              </li>
            ))}
          </ul>
        </Alert>
      )}

      <Card>
        <CardHeader title="Casos" subtitle={`${total} caso(s)`} />
        <div className="grid grid-cols-1 gap-4 p-4 sm:grid-cols-2">
          <Select
            label="Estado"
            value={estado}
            onChange={(e) => {
              setEstado(e.target.value as EstadoCaso | '');
              setPagina(1);
            }}
          >
            <option value="">Todos</option>
            {ESTADOS_CASO.map((s) => (
              <option key={s} value={s}>
                {NOMBRES_ESTADO_CASO[s]}
              </option>
            ))}
          </Select>
          <Select
            label="Tipo de situación"
            value={tipo}
            onChange={(e) => {
              setTipo(e.target.value as TipoSituacion | '');
              setPagina(1);
            }}
          >
            <option value="">Todos</option>
            {TIPOS_SITUACION.map((t) => (
              <option key={t} value={t}>
                Tipo {t}
              </option>
            ))}
          </Select>
        </div>

        {casos.isLoading && <Spinner />}
        {casos.isError && <Alert tone="error">{errorMessage(casos.error)}</Alert>}
        {casos.data && (
          <Table>
            <TableHead>
              <tr>
                <Th>Código</Th>
                <Th>Fecha del hecho</Th>
                <Th>Involucrados</Th>
                <Th>Tipo</Th>
                <Th>Estado</Th>
                <Th className="text-right">Acciones</Th>
              </tr>
            </TableHead>
            <TableBody>
              {data.map((c) => (
                <tr key={c._id}>
                  <Td>
                    {c.codigo}
                    {c.alertas.length > 0 && (
                      <span className="ml-2 align-middle">
                        <Chip tone="red">Alerta</Chip>
                      </span>
                    )}
                  </Td>
                  <Td>{formatoFechaCalendario(c.fecha_hecho)}</Td>
                  <Td>
                    {c.involucrados.map((i, n) => (
                      <span key={n} className="block text-sm">
                        {i.estudiante} <span className="text-xs text-muted">· {NOMBRES_ROL_INVOLUCRADO[i.rol]}</span>
                      </span>
                    ))}
                  </Td>
                  <Td>
                    <TipoSituacionBadge value={c.tipo_situacion} />
                  </Td>
                  <Td>
                    <EstadoCasoBadge value={c.estado} />
                  </Td>
                  <Td className="text-right">
                    <Button variant="soft-edit" className="px-3 py-1 text-xs" onClick={() => setAbierto(c._id)}>
                      Abrir
                    </Button>
                  </Td>
                </tr>
              ))}
              {data.length === 0 && <EmptyRow colSpan={6}>No hay casos con estos filtros.</EmptyRow>}
            </TableBody>
          </Table>
        )}
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

      <AbrirCasoDrawer open={abriendo} onClose={() => setAbriendo(false)} onAbierto={setAbierto} />
      <CasoDetalleDrawer casoId={abierto} onClose={() => setAbierto(null)} />
    </div>
  );
}
