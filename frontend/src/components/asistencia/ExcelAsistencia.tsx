import { useRef, useState } from 'react';
import { Alert, errorMessage } from '../ui/Alert';
import { Button } from '../ui/Button';
import { Card } from '../ui/Card';
import { UploadIcon } from '../ui/icons';
import { descargarPlantillaExcel, useImportarPlantillaExcel } from '../../hooks/useAsistencia';
import { formatoFechaCalendario } from '../../lib/fechas';
import { ApiError } from '../../types/api';
import type { PlanillaAsistencia } from '../../types/domain';

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

/**
 * CU-DOC-05: el docente baja la planilla en Excel, la diligencia sin conexión (también sirve Google Sheets: se
 * importa el .xlsx y se descarga de nuevo como Excel) y la sube al recuperar la conexión. El archivo trae su propia
 * identificación, por eso subirlo no exige haber elegido clase ni fecha.
 */
export function ExcelAsistencia({ planilla }: { planilla: PlanillaAsistencia | undefined }) {
  const importar = useImportarPlantillaExcel();
  const entrada = useRef<HTMLInputElement>(null);
  const [errorDescarga, setErrorDescarga] = useState<string | null>(null);

  async function handleDescargar() {
    if (!planilla) return;
    setErrorDescarga(null);
    importar.reset();
    try {
      await descargarPlantillaExcel(
        { group_id: planilla.grupo._id, subject_id: planilla.asignatura._id, fecha: planilla.fecha },
        `asistencia-${planilla.asignatura.nombre}-${planilla.grupo.nomenclatura}-${planilla.fecha}.xlsx`
      );
    } catch (error) {
      setErrorDescarga(errorMessage(error));
    }
  }

  async function handleArchivo(archivo: File | undefined) {
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
    <div className="space-y-4">
      <Card>
        <div className="flex flex-wrap items-center justify-between gap-3 p-4">
          <p className="max-w-xl text-sm text-muted">
            Trabajo sin conexión: descarga la planilla en Excel, diligencia las columnas <strong>Estado</strong> y{' '}
            <strong>Novedad</strong> y súbela cuando recuperes la conexión. Si prefieres Google Sheets, impórtala allí y
            descárgala de nuevo como Excel (.xlsx).
          </p>
          <div className="flex flex-wrap items-center gap-2">
            <Button
              type="button"
              variant="outline"
              disabled={!planilla || planilla.bloqueo !== null}
              onClick={() => void handleDescargar()}
            >
              Descargar Excel
            </Button>
            <Button type="button" variant="outline" isLoading={importar.isPending} onClick={() => entrada.current?.click()}>
              <UploadIcon className="h-4 w-4" />
              Subir Excel diligenciado
            </Button>
            <input
              ref={entrada}
              type="file"
              accept=".xlsx"
              className="hidden"
              aria-label="Archivo de Excel con la asistencia"
              onChange={(e) => void handleArchivo(e.target.files?.[0])}
            />
          </div>
        </div>
      </Card>

      {errorDescarga && <Alert tone="error">{errorDescarga}</Alert>}
      {importar.isSuccess && (
        <Alert tone="success">
          Planilla de {importar.data.asignatura} · Grupo {importar.data.grupo} del {formatoFechaCalendario(importar.data.fecha)}{' '}
          guardada: {importar.data.registros} registros, {importar.data.fallas} fallas.
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
