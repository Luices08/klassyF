import { useRef, useState } from 'react';
import { ApiError } from '../../types/api';
import { Alert, errorMessage } from '../ui/Alert';
import { Button } from '../ui/Button';
import { Drawer } from '../ui/Drawer';
import { GuiaColumnas } from '../ui/GuiaColumnas';
import { Table, TableBody, TableHead, Td, Th } from '../ui/Table';
import { UploadIcon } from '../ui/icons';
import { Input } from '../ui/Field';
import { useAuth } from '../../context/AuthContext';
import {
  descargarPlantillaConvivencia,
  useAnularLoteImportacion,
  useImportarConvivencia,
  useLotesImportacion,
  type ErrorFilaImportacion,
} from '../../hooks/useImportacionConvivencia';
import { formatoFechaHora } from '../../lib/fechas';
import {
  COLUMNAS_CONVIVENCIA,
  NOMBRES_PROCESO_CONVIVENCIA,
  NOTAS_CONVIVENCIA,
  NOTAS_CONVIVENCIA_OBSERVACIONES,
  type ProcesoConvivencia,
} from '../../lib/columnasImportacion';

interface Props {
  /** null = cerrado. */
  proceso: ProcesoConvivencia | null;
  /** Solo en «observaciones»: la plantilla se baja con los estudiantes de este grupo ya escritos. */
  grupoId?: string;
  onClose: () => void;
}

export function CargaMasivaDrawer({ proceso, grupoId, onClose }: Props) {
  if (!proceso) return null;
  return <Contenido proceso={proceso} grupoId={grupoId} onClose={onClose} />;
}

function Contenido({ proceso, grupoId, onClose }: { proceso: ProcesoConvivencia; grupoId?: string; onClose: () => void }) {
  const importar = useImportarConvivencia();
  const entrada = useRef<HTMLInputElement>(null);
  const [archivo, setArchivo] = useState<File | null>(null);
  const [descargaConError, setDescargaConError] = useState<string | null>(null);

  const erroresDeFila = importar.error instanceof ApiError && Array.isArray(importar.error.details) ? (importar.error.details as ErrorFilaImportacion[]) : [];
  const resultado = importar.data;

  const descargar = async (formato: 'xlsx' | 'csv') => {
    setDescargaConError(null);
    try {
      await descargarPlantillaConvivencia(proceso, formato, grupoId);
    } catch (err) {
      setDescargaConError(errorMessage(err));
    }
  };

  return (
    <Drawer open size="lg" title={`Cargar ${NOMBRES_PROCESO_CONVIVENCIA[proceso].toLowerCase()}`} subtitle="Excel (.xlsx) o CSV: una plantilla por proceso" onClose={onClose}>
      <GuiaColumnas
        titulo="Columnas y formato"
        notas={proceso === 'observaciones' ? NOTAS_CONVIVENCIA_OBSERVACIONES : NOTAS_CONVIVENCIA}
        columnas={COLUMNAS_CONVIVENCIA[proceso]}
      />

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
          <Button
            disabled={!archivo}
            isLoading={importar.isPending}
            onClick={() => archivo && importar.mutate({ proceso, archivo })}
          >
            <UploadIcon className="h-4 w-4" /> Cargar archivo
          </Button>
        </div>
      </div>

      {resultado && (
        <Alert tone="success">
          Carga lista ({resultado.filas} filas): {resultado.creados} creada(s), {resultado.actualizados} actualizada(s), {resultado.omitidos} ya existían.
        </Alert>
      )}

      {proceso === 'observaciones' && <LotesRecientes />}

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

/** Las cargas de observaciones recientes. Un ADMIN puede anular una completa (con motivo): las observaciones quedan anuladas, no borradas. */
function LotesRecientes() {
  const { user } = useAuth();
  const lotes = useLotesImportacion();
  const anular = useAnularLoteImportacion();
  const [anulando, setAnulando] = useState<string | null>(null);
  const [motivo, setMotivo] = useState('');
  const delProceso = (lotes.data ?? []).filter((l) => l.proceso === 'observaciones').slice(0, 5);
  if (delProceso.length === 0) return null;

  return (
    <div className="space-y-2">
      <p className="text-label text-ink">Cargas recientes</p>
      {anular.isError && <Alert tone="error">{errorMessage(anular.error)}</Alert>}
      <Table>
        <TableHead>
          <Th>Fecha</Th>
          <Th>Archivo</Th>
          <Th>Resultado</Th>
          <Th className="text-right">Estado</Th>
        </TableHead>
        <TableBody>
          {delProceso.map((l) => (
            <tr key={l._id}>
              <Td>{formatoFechaHora(l.createdAt)}</Td>
              <Td>{l.archivo_nombre}</Td>
              <Td>
                {l.creados} creada(s), {l.omitidos} omitida(s)
              </Td>
              <Td className="text-right">
                {l.estado === 'ANULADO' ? (
                  <span className="text-xs text-muted">Anulada ({l.anulacion?.observaciones_anuladas ?? 0})</span>
                ) : (
                  user?.rol === 'ADMIN' && (
                    <Button variant="soft-danger" className="px-3 py-1 text-xs" onClick={() => setAnulando(l._id)}>
                      Anular
                    </Button>
                  )
                )}
              </Td>
            </tr>
          ))}
        </TableBody>
      </Table>
      {anulando && (
        <div className="flex flex-wrap items-end gap-2 rounded-xl border border-border p-3">
          <div className="min-w-48 flex-1">
            <Input label="Motivo de la anulación" value={motivo} onChange={(e) => setMotivo(e.target.value)} maxLength={500} />
          </div>
          <Button
            variant="soft-danger"
            disabled={motivo.trim().length < 5}
            isLoading={anular.isPending}
            onClick={async () => {
              await anular.mutateAsync({ id: anulando, motivo });
              setAnulando(null);
              setMotivo('');
            }}
          >
            Confirmar anulación
          </Button>
        </div>
      )}
    </div>
  );
}
