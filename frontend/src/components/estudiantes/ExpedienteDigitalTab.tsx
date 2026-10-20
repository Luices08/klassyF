import { useEffect, useMemo, useState } from 'react';
import { NOMBRES_CATEGORIA_EXPEDIENTE, descargarArchivoDeExpediente, useExpedienteDigital, type CategoriaExpediente, type ItemExpediente } from '../../hooks/useExpedienteDigital';
import { formatoFechaHora } from '../../lib/fechas';
import { Alert, errorMessage } from '../ui/Alert';
import { Chip } from '../ui/Badge';
import { Button } from '../ui/Button';
import { Card, CardHeader } from '../ui/Card';
import { FiltrosRapidos } from '../ui/FiltrosRapidos';
import { Spinner } from '../ui/Spinner';
import { EmptyRow, Table, TableBody, TableHead, Td, Th } from '../ui/Table';
import { VisorDocumento } from '../ui/VisorDocumento';

/**
 * Expediente digital del estudiante (M29): todo lo que cada módulo guarda de él, en un solo lugar y filtrable por tipo. No guarda nada propio y
 * no mueve archivos: cada documento se abre con la sesión por el endpoint de su módulo, que decide quién puede verlo.
 */
export function ExpedienteDigitalTab({ studentId, activa }: { studentId: string; activa: boolean }) {
  const expediente = useExpedienteDigital(studentId, activa);
  const [categoria, setCategoria] = useState<'TODOS' | CategoriaExpediente>('TODOS');
  const [visor, setVisor] = useState<{ url: string; titulo: string } | null>(null);
  const [abriendo, setAbriendo] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Cada archivo es un blob en memoria: se libera al reemplazarlo o al salir.
  useEffect(() => {
    const url = visor?.url;
    return () => {
      if (url) URL.revokeObjectURL(url);
    };
  }, [visor?.url]);

  const items = expediente.data?.items ?? [];
  const cuentas = useMemo(() => {
    const c = new Map<CategoriaExpediente, number>();
    for (const i of items) c.set(i.categoria, (c.get(i.categoria) ?? 0) + 1);
    return c;
  }, [items]);
  const visibles = categoria === 'TODOS' ? items : items.filter((i) => i.categoria === categoria);

  const abrir = async (item: ItemExpediente) => {
    if (!item.descarga) return;
    setError(null);
    setAbriendo(item.descarga);
    try {
      const { url } = await descargarArchivoDeExpediente(item.descarga);
      setVisor({ url, titulo: `${item.titulo}${item.codigo ? ` · ${item.codigo}` : ''}` });
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setAbriendo(null);
    }
  };

  return (
    <div className="space-y-4">
      <Card className="space-y-4">
        <CardHeader title="Expediente digital" subtitle="Documentos del estudiante reunidos desde matrículas, retiros, traslados, servicio social, inclusión y certificados. No se copia nada: cada archivo se abre desde su módulo." />
        {expediente.isLoading && <Spinner />}
        {expediente.isError && <Alert tone="error">{errorMessage(expediente.error)}</Alert>}
        {error && <Alert tone="error">{error}</Alert>}
        {expediente.data && (
          <>
            <FiltrosRapidos
              ariaLabel="Tipo de documento"
              valor={categoria}
              onChange={(k) => setCategoria(k as 'TODOS' | CategoriaExpediente)}
              items={[
                { clave: 'TODOS', etiqueta: 'Todos', cantidad: items.length },
                ...(Object.keys(NOMBRES_CATEGORIA_EXPEDIENTE) as CategoriaExpediente[])
                  .filter((c) => cuentas.has(c))
                  .map((c) => ({ clave: c, etiqueta: NOMBRES_CATEGORIA_EXPEDIENTE[c], cantidad: cuentas.get(c) })),
              ]}
            />
            <Table>
              <TableHead>
                <tr>
                  <Th>Documento</Th>
                  <Th>Tipo</Th>
                  <Th>Año</Th>
                  <Th>Fecha</Th>
                  <Th>Estado</Th>
                  <Th>Ver</Th>
                </tr>
              </TableHead>
              <TableBody>
                {visibles.map((i, n) => (
                  <tr key={`${i.categoria}-${i.descarga ?? n}-${i.codigo ?? ''}`}>
                    <Td>
                      <span className="block font-semibold text-ink">{i.titulo}</span>
                      {i.detalle && <span className="block text-xs text-muted">{i.detalle}</span>}
                      {i.codigo && (
                        <span className="block font-mono text-xs text-muted">
                          {i.codigo} · clave {i.huella}
                        </span>
                      )}
                    </Td>
                    <Td className="text-xs">{NOMBRES_CATEGORIA_EXPEDIENTE[i.categoria]}</Td>
                    <Td>{i.anio ?? '—'}</Td>
                    <Td>{i.fecha ? formatoFechaHora(i.fecha) : '—'}</Td>
                    <Td>{i.estado ? <Chip tone={i.estado === 'ANULADO' || i.estado === 'RECHAZADO' ? 'red' : i.estado === 'PENDIENTE' || i.estado === 'CARGADO' ? 'orange' : 'neutral'}>{i.estado}</Chip> : '—'}</Td>
                    <Td>
                      {i.descarga ? (
                        <Button type="button" variant="outline" className="px-3 py-1 text-xs" isLoading={abriendo === i.descarga} onClick={() => void abrir(i)}>
                          Abrir
                        </Button>
                      ) : (
                        <span className="text-xs text-muted">Sin permiso para abrirlo</span>
                      )}
                    </Td>
                  </tr>
                ))}
                {visibles.length === 0 && <EmptyRow colSpan={6}>No hay documentos en el expediente de este estudiante.</EmptyRow>}
              </TableBody>
            </Table>
          </>
        )}
      </Card>

      {visor && (
        <Card>
          <VisorDocumento url={visor.url} titulo={visor.titulo} nombreArchivo={`${visor.titulo}.pdf`} />
        </Card>
      )}
    </div>
  );
}
