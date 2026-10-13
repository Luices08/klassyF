import { useState } from 'react';
import { type ResultadoRegistroImportacion, useImportacionesExcelNotas } from '../../hooks/useNotas';
import { formatoFechaHora } from '../../lib/fechas';
import { Alert, errorMessage } from '../ui/Alert';
import { Chip, type Tone } from '../ui/Badge';
import { Button } from '../ui/Button';
import { Card } from '../ui/Card';
import { Spinner } from '../ui/Spinner';

const RESULTADO: Record<ResultadoRegistroImportacion, { nombre: string; tono: Tone }> = {
  APLICADA: { nombre: 'Aplicada', tono: 'green' },
  RECHAZADA: { nombre: 'Rechazada: no se guardó nada', tono: 'red' },
  INTERRUMPIDA: { nombre: 'Interrumpida: revisa la planilla', tono: 'orange' },
};

/**
 * M22 — qué pasó con cada Excel que se subió para esta clase y periodo: quién, cuándo, qué guardó y, si se rechazó, por qué
 * (errores de digitación o conflictos con lo que cambió en el sistema mientras se trabajaba sin conexión). Se pide al abrirlo.
 */
export function HistorialImportacionesExcel({ teacherAssignmentId, periodoNumero }: { teacherAssignmentId: string; periodoNumero: number }) {
  const [abierto, setAbierto] = useState(false);
  const consulta = useImportacionesExcelNotas({ teacherAssignmentId, periodoNumero, enabled: abierto });
  const registros = consulta.data ?? [];

  return (
    <Card>
      <div className="flex flex-wrap items-center justify-between gap-3 p-4">
        <p className="text-sm text-muted">Historial de los Excel que subiste para esta clase y periodo: qué se guardó y por qué se rechazó alguno.</p>
        <Button type="button" variant="outline" onClick={() => setAbierto((v) => !v)}>
          {abierto ? 'Ocultar historial' : 'Ver historial de archivos'}
        </Button>
      </div>

      {abierto && (
        <div className="space-y-3 border-t border-border p-4">
          {consulta.isLoading && (
            <div className="flex justify-center p-4">
              <Spinner />
            </div>
          )}
          {consulta.isError && <Alert tone="error">{errorMessage(consulta.error)}</Alert>}
          {consulta.data && registros.length === 0 && <p className="text-sm text-muted">Todavía no se ha subido ningún Excel para esta clase y periodo.</p>}

          <ul className="space-y-3">
            {registros.map((r) => {
              const aplicada = r.resultado === 'APLICADA';
              return (
                <li key={r._id} className="space-y-2 rounded-lg border border-border p-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <Chip tone={RESULTADO[r.resultado].tono}>{RESULTADO[r.resultado].nombre}</Chip>
                    {r.total_conflictos > 0 && <Chip tone="orange">{r.total_conflictos} conflicto(s)</Chip>}
                    <span className="text-sm font-semibold text-ink">{r.archivo_nombre || 'Archivo sin nombre'}</span>
                  </div>
                  <p className="text-xs text-muted">
                    {formatoFechaHora(r.createdAt)}
                    {r.usuario_id ? ` · ${r.usuario_id.nombre} ${r.usuario_id.apellido}` : ''}
                    {r.descargado_en ? ` · descargado el ${formatoFechaHora(r.descargado_en)}` : ''}
                  </p>
                  {aplicada && (
                    <p className="text-sm text-body">
                      {r.notas_guardadas === 0 ? 'Sin cambios que guardar' : `${r.notas_guardadas} nota(s) guardada(s)`}
                      {r.sin_cambios > 0 ? ` (${r.sin_cambios} ya estaban igual)` : ''}
                      {r.casillas_creadas > 0 ? ` · ${r.casillas_creadas} casilla(s) nueva(s)` : ''}
                      {r.casillas_renombradas > 0 ? ` · ${r.casillas_renombradas} renombrada(s)` : ''}
                      {r.pesos_actualizados > 0 ? ` · ${r.pesos_actualizados} peso(s) actualizado(s)` : ''}.
                    </p>
                  )}
                  {!aplicada && r.mensaje && <p className="text-sm text-body">{r.mensaje}</p>}
                  {r.errores.length > 0 && (
                    <ul className="list-disc space-y-0.5 pl-5 text-sm text-body">
                      {r.errores.slice(0, 5).map((e) => (
                        <li key={`${e.fila}-${e.motivo}`}>
                          Fila {e.fila}
                          {e.documento ? ` (documento ${e.documento})` : ''}: {e.motivo}
                        </li>
                      ))}
                      {r.total_errores > Math.min(r.errores.length, 5) && <li>… y {r.total_errores - Math.min(r.errores.length, 5)} más.</li>}
                    </ul>
                  )}
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </Card>
  );
}
