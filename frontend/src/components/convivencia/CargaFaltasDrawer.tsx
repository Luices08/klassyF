import { useRef, useState } from 'react';
import { ApiError } from '../../types/api';
import { Alert, errorMessage } from '../ui/Alert';
import { Button } from '../ui/Button';
import { Drawer } from '../ui/Drawer';
import { GuiaColumnas } from '../ui/GuiaColumnas';
import { Table, TableBody, TableHead, Td, Th } from '../ui/Table';
import { UploadIcon } from '../ui/icons';
import { descargarPlantillaFaltas, useImportarFaltas, type ErrorFilaImportacion } from '../../hooks/useCasos';
import { COLUMNAS_FALTAS, NOTAS_FALTAS } from '../../lib/columnasImportacion';

interface Props {
  open: boolean;
  onClose: () => void;
}

/** Carga de las faltas del manual de convivencia por Excel o CSV: es la única carga masiva de convivencia. */
export function CargaFaltasDrawer({ open, onClose }: Props) {
  if (!open) return null;
  return <Contenido onClose={onClose} />;
}

function Contenido({ onClose }: { onClose: () => void }) {
  const importar = useImportarFaltas();
  const entrada = useRef<HTMLInputElement>(null);
  const [archivo, setArchivo] = useState<File | null>(null);
  const [descargaConError, setDescargaConError] = useState<string | null>(null);

  const erroresDeFila = importar.error instanceof ApiError && Array.isArray(importar.error.details) ? (importar.error.details as ErrorFilaImportacion[]) : [];
  const resultado = importar.data;

  const descargar = async (formato: 'xlsx' | 'csv') => {
    setDescargaConError(null);
    try {
      await descargarPlantillaFaltas(formato);
    } catch (err) {
      setDescargaConError(errorMessage(err));
    }
  };

  return (
    <Drawer open size="lg" title="Cargar faltas del manual" subtitle="Excel (.xlsx) o CSV" onClose={onClose}>
      <GuiaColumnas titulo="Columnas y formato" notas={NOTAS_FALTAS} columnas={COLUMNAS_FALTAS} />

      <div className="flex flex-wrap gap-2">
        <Button variant="outline" onClick={() => void descargar('xlsx')}>
          Descargar plantilla Excel
        </Button>
        <Button variant="outline" onClick={() => void descargar('csv')}>
          Descargar plantilla CSV
        </Button>
      </div>
      {descargaConError && <Alert tone="error">{descargaConError}</Alert>}

      <div className="rounded-xl border border-dashed border-border p-4">
        <input
          ref={entrada}
          type="file"
          accept=".xlsx,.csv"
          className="block w-full text-sm text-body file:mr-3 file:rounded-lg file:border-0 file:bg-primary-soft file:px-3 file:py-2 file:text-sm file:font-semibold file:text-primary"
          onChange={(e) => {
            setArchivo(e.target.files?.[0] ?? null);
            importar.reset();
          }}
        />
        <div className="mt-3">
          <Button disabled={!archivo} isLoading={importar.isPending} onClick={() => archivo && importar.mutate(archivo)}>
            <UploadIcon className="h-4 w-4" /> Cargar archivo
          </Button>
        </div>
      </div>

      {resultado && (
        <Alert tone="success">
          Carga lista ({resultado.filas} filas): {resultado.creados} creada(s), {resultado.actualizados} actualizada(s), {resultado.omitidos} ya existían.
        </Alert>
      )}

      {importar.isError && (
        <div className="space-y-2">
          <Alert tone="error">{errorMessage(importar.error)}</Alert>
          {erroresDeFila.length > 0 && (
            <div className="max-h-72 overflow-y-auto rounded-xl">
              <Table>
                <TableHead>
                  <Th className="w-20">Fila</Th>
                  <Th>Qué corregir</Th>
                </TableHead>
                <TableBody>
                  {erroresDeFila.map((e) => (
                    <tr key={`${e.fila}-${e.mensaje}`}>
                      <Td>{e.fila}</Td>
                      <Td>{e.mensaje}</Td>
                    </tr>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </div>
      )}
    </Drawer>
  );
}
