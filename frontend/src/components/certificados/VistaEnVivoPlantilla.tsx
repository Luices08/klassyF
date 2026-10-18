import { Alert, errorMessage } from '../ui/Alert';
import { Spinner } from '../ui/Spinner';
import type { DisenoPlantilla, FuenteDiseno, RenderPlantilla, TamanoDiseno } from '../../hooks/useCertificados';
import { DISENO_INICIAL, ETIQUETA_JORNADA } from '../../hooks/useCertificados';

const FAMILIA_CSS: Record<FuenteDiseno, string> = { SANS: 'Helvetica, Arial, sans-serif', SERIF: '"Times New Roman", Times, serif', MONO: '"Courier New", Courier, monospace' };
const ESCALA_CSS: Record<TamanoDiseno, number> = { PEQUENO: 0.9, NORMAL: 1, GRANDE: 1.1 };

/**
 * El documento tal como quedará, con datos de muestra, mientras se redacta. Es una aproximación en pantalla: el encabezado oficial (escudo,
 * DANE, NIT, resolución), el QR y las firmas los pone el sistema al dibujar el PDF; el botón «Vista previa (PDF)» muestra el documento exacto.
 */
export function VistaEnVivoPlantilla({ datos, cargando, error, diseno }: { datos: RenderPlantilla | undefined; cargando: boolean; error: unknown; diseno?: DisenoPlantilla | null }) {
  if (error && !datos) return <Alert tone="error">{errorMessage(error)}</Alert>;
  if (!datos) return <Spinner label="Preparando la vista…" />;
  const e = datos.encabezado;
  // Solo el cuerpo cambia con el diseño; el encabezado y las firmas conservan su estilo, como en el PDF.
  const d = diseno ?? DISENO_INICIAL;
  const estiloCuerpo = (px: number, color: string, negrita = false) => ({ fontFamily: FAMILIA_CSS[d.fuente], fontSize: `${px * ESCALA_CSS[d.tamano]}px`, color, fontWeight: negrita ? 700 : 400 });

  return (
    <div className="space-y-3">
      {Boolean(error) && <Alert tone="warning">No se pudo actualizar la vista (se muestra la última): {errorMessage(error)}</Alert>}
      <div className={`rounded-lg border border-border bg-white p-6 shadow-sm transition-opacity ${cargando ? 'opacity-70' : ''}`} aria-busy={cargando} aria-label="Vista del documento">
        <div className="border-b border-border pb-3 text-center">
          <p className="text-sm font-bold uppercase tracking-wide text-ink">{e.institucion}</p>
          <p className="text-xs text-muted">
            DANE {e.codigo_dane} · NIT {e.nit}
          </p>
          <p className="text-xs text-muted">{e.resolucion_aprobacion}</p>
          <p className="text-xs text-muted">
            Sede {e.sede} · Jornada {ETIQUETA_JORNADA[e.jornada] ?? e.jornada} · Año {e.anio ?? ''}
          </p>
          <p className="mt-2 text-base font-bold text-ink">{datos.titulo}</p>
        </div>

        <div className="mt-4 space-y-3 text-sm text-body">
          {datos.bloques.map((b, i) => {
            switch (b.estilo) {
              case 'PREAMBULO':
                return (
                  <p key={i} className="text-center" style={estiloCuerpo(13, d.color_texto)}>
                    {b.texto}
                  </p>
                );
              case 'FORMULA':
                return (
                  <p key={i} className="py-1 text-center" style={estiloCuerpo(17, d.color_destacados, true)}>
                    {b.texto}
                  </p>
                );
              case 'DESTACADO':
                return (
                  <p key={i} style={estiloCuerpo(14, d.color_destacados, true)}>
                    {b.texto}
                  </p>
                );
              case 'TABLA_NOTAS':
                return datos.tabla ? <TablaDeMuestra key={i} tabla={datos.tabla} /> : null;
              default:
                return (
                  <p key={i} className="text-justify" style={estiloCuerpo(14, d.color_texto)}>
                    {b.texto}
                  </p>
                );
            }
          })}
          {datos.bloques.length === 0 && <p className="text-center text-muted">El documento no tiene texto visible todavía.</p>}
        </div>

        <div className="mt-8 grid grid-cols-2 gap-6 text-center text-xs text-muted">
          <div className="border-t border-border pt-1">Rectoría</div>
          <div className="border-t border-border pt-1">Secretaría Académica</div>
        </div>
      </div>

      {datos.problemas.length > 0 && (
        <Alert tone="warning">
          <p className="font-semibold">Para poder publicarla falta corregir:</p>
          <ul className="mt-1 list-disc space-y-0.5 pl-4">
            {datos.problemas.map((p) => (
              <li key={p}>{p}</li>
            ))}
          </ul>
        </Alert>
      )}
      {datos.faltantes.length > 0 && (
        <Alert tone="info">
          <p className="font-semibold">Con los datos de muestra falta:</p>
          <ul className="mt-1 list-disc space-y-0.5 pl-4">
            {datos.faltantes.map((p) => (
              <li key={p}>{p}</li>
            ))}
          </ul>
        </Alert>
      )}
    </div>
  );
}

function TablaDeMuestra({ tabla }: { tabla: NonNullable<RenderPlantilla['tabla']> }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full border-collapse text-xs">
        <thead>
          <tr>
            {tabla.columnas.map((c) => (
              <th key={c} className="border border-border bg-soft px-2 py-1 text-left font-semibold text-ink">
                {c}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {tabla.filas.map((f, i) => (
            <tr key={i} className={f.nivel === 'AREA' ? 'font-semibold text-ink' : ''}>
              {f.celdas.map((celda, j) => (
                <td key={j} className="border border-border px-2 py-1">
                  {celda}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
      <p className="mt-1 text-xs text-muted">{tabla.pie}</p>
    </div>
  );
}
