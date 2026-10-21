import { Alert } from '../ui/Alert';
import { Card } from '../ui/Card';
import { Chip } from '../ui/Badge';
import { Table, TableBody, TableHead, Td, Th } from '../ui/Table';
import type { ConteoSexo, ReporteC600 } from '../../hooks/useReportes';
import { formatoNumero } from '../../lib/dashboard';
import { formatoFechaCalendario } from '../../lib/fechas';

const LINEA = '________________';
type Sexo = 'H' | 'M' | 'O';

function Seccion({ titulo, children }: { titulo: string; children: React.ReactNode }) {
  return (
    <section className="space-y-2">
      <h3 className="text-center text-sm font-bold uppercase tracking-wide text-ink">{titulo}</h3>
      {children}
    </section>
  );
}

const celdasDe = (c: ConteoSexo, sexos: Sexo[]) => [...sexos.map((s) => c[s]), c.total];

/**
 * La vista previa del reporte C-600: el mismo contenido que bajan el Excel y el PDF (sale de la misma respuesta del servidor), con la estructura de las cuatro
 * secciones. Los datos que el sistema no guarda (sector y códigos DIVIPOLA) quedan como líneas, igual que en los archivos.
 */
export function VistaC600({ r }: { r: ReporteC600 }) {
  const sexos: Sexo[] = r.hay_otro_sin_dato ? ['H', 'M', 'O'] : ['H', 'M'];
  const etiquetaSexo: Record<Sexo, string> = { H: 'H', M: 'M', O: 'Otro' };
  const sub = [...sexos.map((s) => etiquetaSexo[s]), 'Total'];
  const totalEdades = Object.values(r.edades.total_por_grado).reduce((s, c) => s + c.total, 0);
  const num = (n: number) => formatoNumero(n);

  return (
    <Card className="space-y-6 bg-surface p-6">
      <header className="space-y-1 text-center">
        <h2 className="text-h3 uppercase text-ink">Reporte estadístico de eficiencia interna (DANE C-600)</h2>
        <div className="flex flex-wrap items-center justify-center gap-2">
          <Chip tone={r.estado_datos === 'DEFINITIVO' ? 'green' : 'orange'}>{r.estado_datos === 'DEFINITIVO' ? 'Definitivo' : 'Preliminar'}</Chip>
          <span className="text-xs text-muted">Edades cumplidas al {formatoFechaCalendario(r.fecha_corte_edad)}</span>
        </div>
      </header>

      <div className="grid grid-cols-1 gap-x-8 gap-y-1 text-sm text-body sm:grid-cols-2">
        <p><span className="font-semibold text-ink">Establecimiento:</span> {r.institucion.nombre}</p>
        <p><span className="font-semibold text-ink">Código DANE:</span> {r.institucion.codigo_dane}</p>
        <p><span className="font-semibold text-ink">Sede:</span> {r.sede ? `${r.sede.nombre} (DANE ${r.sede.codigo_dane})` : 'Todas las sedes'}</p>
        <p><span className="font-semibold text-ink">Jornada:</span> {r.jornada ?? 'Todas las jornadas'}</p>
        <p><span className="font-semibold text-ink">Año lectivo:</span> {r.anio}</p>
        <p><span className="font-semibold text-ink">Sector (oficial / no oficial):</span> {LINEA}</p>
        <p><span className="font-semibold text-ink">DIVIPOLA municipio:</span> {LINEA}</p>
        <p><span className="font-semibold text-ink">DIVIPOLA departamento:</span> {LINEA}</p>
      </div>

      {r.estado_datos === 'PRELIMINAR' && (
        <Alert tone="warning">
          Hay estudiantes sin resultado final del año (el cierre de promoción de M19 aún no los cubre). Las cifras de resultados cambiarán cuando se cierre el año.
        </Alert>
      )}

      <Seccion titulo="Balance general de matrícula y movimiento anual">
        <Table>
          <TableHead>
            <Th>Grado</Th>
            <Th className="text-center">Matrícula inicial</Th>
            <Th className="text-center">Ingresados durante el año</Th>
            <Th className="text-center">Retirados / desertores</Th>
            <Th className="text-center">Matrícula final</Th>
          </TableHead>
          <TableBody>
            {r.balance.filas.map((f) => (
              <tr key={f.grado_id}>
                <Td className="font-medium text-ink">{f.grado}</Td>
                <Td className="text-center">{num(f.matricula_inicial)}</Td>
                <Td className="text-center">{num(f.ingresados)}</Td>
                <Td className="text-center">{num(f.retirados)}</Td>
                <Td className="text-center">{num(f.matricula_final)}</Td>
              </tr>
            ))}
            <tr className="bg-soft font-semibold text-ink">
              <Td>Total</Td>
              <Td className="text-center">{num(r.balance.total.matricula_inicial)}</Td>
              <Td className="text-center">{num(r.balance.total.ingresados)}</Td>
              <Td className="text-center">{num(r.balance.total.retirados)}</Td>
              <Td className="text-center">{num(r.balance.total.matricula_final)}</Td>
            </tr>
          </TableBody>
        </Table>
      </Seccion>

      <Seccion titulo="Resultados académicos y eficiencia interna por grado y sexo">
        <Table>
          {/* Un solo <thead> con dos filas: las celdas que abarcan filas no pueden cruzar de un <thead> a otro. */}
          <thead className="bg-primary-soft">
            <tr>
              <Th rowSpan={2}>Grado</Th>
              <Th colSpan={sub.length} className="border-l border-border text-center">Promovidos / aprobados</Th>
              <Th colSpan={sub.length} className="border-l border-border text-center">No promovidos / reprobados</Th>
              <Th colSpan={sub.length} className="border-l border-border text-center">Desertores / retirados</Th>
              <Th rowSpan={2} className="border-l border-border text-center">Sin resultado final</Th>
            </tr>
            <tr>{[0, 1, 2].flatMap((g) => sub.map((t, i) => <Th key={`${g}-${t}`} className={`text-center ${i === 0 ? 'border-l border-border' : ''}`}>{t}</Th>))}</tr>
          </thead>
          <TableBody>
            {r.resultados.filas.map((f) => (
              <tr key={f.grado_id}>
                <Td className="font-medium text-ink">{f.grado}</Td>
                {[...celdasDe(f.promovidos, sexos), ...celdasDe(f.no_promovidos, sexos), ...celdasDe(f.desertores, sexos)].map((v, i) => (
                  <Td key={i} className={`text-center ${i % sub.length === 0 ? 'border-l border-border' : ''}`}>{num(v)}</Td>
                ))}
                <Td className="border-l border-border text-center">{num(f.sin_resultado)}</Td>
              </tr>
            ))}
            <tr className="bg-soft font-semibold text-ink">
              <Td>Total</Td>
              {[...celdasDe(r.resultados.total.promovidos, sexos), ...celdasDe(r.resultados.total.no_promovidos, sexos), ...celdasDe(r.resultados.total.desertores, sexos)].map((v, i) => (
                <Td key={i} className={`text-center ${i % sub.length === 0 ? 'border-l border-border' : ''}`}>{num(v)}</Td>
              ))}
              <Td className="border-l border-border text-center">{num(r.resultados.total.sin_resultado)}</Td>
            </tr>
          </TableBody>
        </Table>
      </Seccion>

      <Seccion titulo="Distribución por edad y grado (extraedad)">
        <Table>
          <thead className="bg-primary-soft">
            <tr>
              <Th rowSpan={2}>Edad cumplida</Th>
              {r.grados.map((g) => (
                <Th key={g.grado_id} colSpan={sexos.length} className="border-l border-border text-center">{g.grado}</Th>
              ))}
              <Th rowSpan={2} className="border-l border-border text-center">Total</Th>
            </tr>
            <tr>{r.grados.flatMap((g) => sexos.map((s, i) => <Th key={`${g.grado_id}-${s}`} className={`text-center ${i === 0 ? 'border-l border-border' : ''}`}>{etiquetaSexo[s]}</Th>))}</tr>
          </thead>
          <TableBody>
            {r.edades.filas.map((e) => (
              <tr key={e.clave}>
                <Td className="font-medium text-ink">{e.etiqueta}</Td>
                {r.grados.flatMap((g) => sexos.map((s, i) => <Td key={`${g.grado_id}-${s}`} className={`text-center ${i === 0 ? 'border-l border-border' : ''}`}>{num(e.celdas[g.grado_id]?.[s] ?? 0)}</Td>))}
                <Td className="border-l border-border text-center font-semibold text-ink">{num(e.total.total)}</Td>
              </tr>
            ))}
            <tr className="bg-soft font-semibold text-ink">
              <Td>Total</Td>
              {r.grados.flatMap((g) => sexos.map((s, i) => <Td key={`${g.grado_id}-${s}`} className={`text-center ${i === 0 ? 'border-l border-border' : ''}`}>{num(r.edades.total_por_grado[g.grado_id]?.[s] ?? 0)}</Td>))}
              <Td className="border-l border-border text-center">{num(totalEdades)}</Td>
            </tr>
          </TableBody>
        </Table>
        {r.edades.sin_fecha_nacimiento > 0 && <p className="text-xs text-muted">{r.edades.sin_fecha_nacimiento} estudiante(s) sin fecha de nacimiento no entran a esta tabla.</p>}
      </Seccion>

      <Seccion titulo="Declaración y firmas">
        <div className="space-y-6 rounded-lg border border-border p-4 text-sm text-body">
          <p>
            <span className="font-semibold text-ink">{r.firma.cargo}:</span> {r.firma.nombre || LINEA}
          </p>
          <div className="mx-auto w-64 border-t border-ink pt-1 text-center text-xs text-muted">[Firma del {r.firma.cargo}]</div>
          <p>Fecha de expedición: {formatoFechaCalendario(r.firma.fecha_expedicion)}</p>
        </div>
      </Seccion>

      <p className="text-xs text-muted">{r.leyenda}</p>
    </Card>
  );
}
