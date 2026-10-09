import { useRef, useState } from 'react';
import { Alert, errorMessage } from '../ui/Alert';
import { Button } from '../ui/Button';
import { Card } from '../ui/Card';
import { UploadIcon } from '../ui/icons';
import { descargarExcelNotas, useImportarExcelNotas } from '../../hooks/useNotas';
import { ApiError } from '../../types/api';

interface ErrorDeFila {
  fila: number;
  documento?: string;
  motivo: string;
}

/** Los errores de fila del importador viajan en `details`; si no hay, se muestra solo el mensaje. */
function erroresDeFila(error: unknown): ErrorDeFila[] {
  const detalles = error instanceof ApiError ? error.details : null;
  return Array.isArray(detalles) ? (detalles as ErrorDeFila[]) : [];
}

interface ExcelNotasProps {
  teacherAssignmentId: string;
  periodoNumero: number;
  nombreArchivo: string;
  /** Subir exige poder editar; bajar sirve siempre (también para archivar una planilla cerrada). */
  puedeSubir: boolean;
  puedeDescargar: boolean;
}

/**
 * M22 — trabajo sin conexión: la planilla baja a Excel con las fórmulas protegidas (solo las celdas de nota se editan) y se
 * sube al recuperar la conexión. También sirve en Google Sheets: se importa el .xlsx y se descarga de nuevo como Excel.
 */
export function ExcelNotas({ teacherAssignmentId, periodoNumero, nombreArchivo, puedeSubir, puedeDescargar }: ExcelNotasProps) {
  const importar = useImportarExcelNotas();
  const entrada = useRef<HTMLInputElement>(null);
  const [errorDescarga, setErrorDescarga] = useState<string | null>(null);

  async function descargar() {
    setErrorDescarga(null);
    importar.reset();
    try {
      await descargarExcelNotas(teacherAssignmentId, periodoNumero, nombreArchivo);
    } catch (error) {
      setErrorDescarga(errorMessage(error));
    }
  }

  async function subir(archivo: File | undefined) {
    if (!archivo) return;
    setErrorDescarga(null);
    importar.reset();
    try {
      await importar.mutateAsync(archivo);
    } catch {
      // el detalle lo muestra `importar.error`
    }
    if (entrada.current) entrada.current.value = '';
  }

  const filas = erroresDeFila(importar.error);

  return (
    <div className="space-y-3">
      <Card>
        <div className="flex flex-wrap items-center justify-between gap-3 p-4">
          <p className="max-w-xl text-sm text-muted">
            Trabajo sin conexión: descarga la planilla en Excel, escribe las notas en las casillas blancas (los promedios y la nota se calculan solos) y súbela
            cuando recuperes la conexión. En Google Sheets, impórtala allí y descárgala de nuevo como Excel (.xlsx).
          </p>
          <div className="flex flex-wrap items-center gap-2">
            <Button type="button" variant="outline" disabled={!puedeDescargar} onClick={() => void descargar()}>
              Descargar Excel
            </Button>
            <Button type="button" variant="outline" disabled={!puedeSubir} isLoading={importar.isPending} onClick={() => entrada.current?.click()}>
              <UploadIcon className="h-4 w-4" />
              Subir Excel diligenciado
            </Button>
            <input
              ref={entrada}
              type="file"
              accept=".xlsx"
              className="hidden"
              aria-label="Archivo de Excel con las notas"
              onChange={(e) => void subir(e.target.files?.[0])}
            />
          </div>
        </div>
      </Card>

      {errorDescarga && <Alert tone="error">{errorDescarga}</Alert>}
      {importar.isSuccess && (
        <Alert tone="success">
          Planilla de {importar.data.asignatura} · Grupo {importar.data.grupo} · Periodo {importar.data.periodo}:{' '}
          {importar.data.guardadas === 0 ? 'no había cambios que guardar' : `${importar.data.guardadas} nota(s) guardada(s)`}
          {importar.data.sin_cambios > 0 ? ` (${importar.data.sin_cambios} ya estaban igual)` : ''}.
        </Alert>
      )}
      {importar.isError && (
        <Alert tone="error">
          <p>{errorMessage(importar.error)}</p>
          {filas.length > 0 && (
            <ul className="mt-2 list-disc space-y-0.5 pl-5">
              {filas.map((f) => (
                <li key={`${f.fila}-${f.motivo}`}>
                  Fila {f.fila}
                  {f.documento ? ` (documento ${f.documento})` : ''}: {f.motivo}
                </li>
              ))}
            </ul>
          )}
        </Alert>
      )}
    </div>
  );
}
