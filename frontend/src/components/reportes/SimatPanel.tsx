import { useAuth } from '../../context/AuthContext';
import { type SituacionSimat, useDescargarSimat, useRevisarSimat } from '../../hooks/useReportes';
import { Alert, errorMessage } from '../ui/Alert';
import { Button } from '../ui/Button';
import { Card, CardHeader } from '../ui/Card';
import { Chip } from '../ui/Badge';
import { FiltrosAlcance, useFiltrosAlcance } from './FiltrosAlcance';

const NOMBRE_SITUACION: Record<SituacionSimat, string> = {
  P: 'P · Promovidos',
  R: 'R · No promovidos',
  D: 'D · Retirados o desertores',
  G: 'G · Graduados',
  N: 'N · Pendientes de apoyo o nivelación',
};

/**
 * Plantilla de cierre para SIMAT: una sola hoja con todos los estudiantes del alcance. Antes de bajarla se revisa qué le falta (nombres separados,
 * cierre de promoción oficial, código DANE…); la revisión no cambia el archivo, solo avisa. Se calcula al descargar.
 */
export function SimatPanel({ anioPorDefecto }: { anioPorDefecto?: string }) {
  const { user } = useAuth();
  const filtros = useFiltrosAlcance(anioPorDefecto);
  const revisar = useRevisarSimat();
  const descargar = useDescargarSimat();
  const puedeDescargar = user?.rol === 'ADMIN' || user?.rol === 'SECRETARIA';
  const listo = Boolean(filtros.alcance.academic_year_id);
  const nombreArchivo = `simat-cierre-${filtros.anio?.year ?? ''}`;
  const revision = revisar.data?.revision;

  return (
    <div className="space-y-4">
      <Card>
        <FiltrosAlcance filtros={filtros} />
        <p className="mt-3 text-xs text-muted">
          Se arma con todos los estudiantes de la institución (o de la sede, jornada, grado o grupo que elija), uno por fila y sin importar el grado. La situación sale del cierre de promoción; mientras un estudiante no lo tenga, es una proyección y la revisión lo avisa.
        </p>
        <div className="mt-4 flex flex-wrap gap-3">
          <Button variant="outline" onClick={() => revisar.mutate(filtros.alcance)} disabled={!listo || revisar.isPending}>
            Revisar antes de descargar
          </Button>
          {puedeDescargar && (
            <>
              <Button onClick={() => descargar.mutate({ formato: 'excel', alcance: filtros.alcance, nombreArchivo })} disabled={!listo || descargar.isPending}>
                Descargar Excel
              </Button>
              <Button variant="outline" onClick={() => descargar.mutate({ formato: 'csv', alcance: filtros.alcance, nombreArchivo })} disabled={!listo || descargar.isPending}>
                Descargar CSV
              </Button>
            </>
          )}
        </div>
        {!puedeDescargar && <p className="mt-2 text-xs text-muted">Solo administración y secretaría descargan el archivo; usted puede revisar qué le falta.</p>}
      </Card>
      {revisar.isError && <Alert tone="error">{errorMessage(revisar.error)}</Alert>}
      {descargar.isError && <Alert tone="error">{errorMessage(descargar.error)}</Alert>}
      {(revisar.isPending || descargar.isPending) && <Alert tone="info">Preparando…</Alert>}

      {revision && (
        <Card>
          <CardHeader title={`Revisión: ${revision.total} estudiantes`} subtitle={revisar.data?.alcance} />
          <div className="flex flex-wrap gap-2">
            {(Object.keys(NOMBRE_SITUACION) as SituacionSimat[]).map((s) => (
              <Chip key={s} tone={s === 'R' || s === 'D' ? 'red' : s === 'N' ? 'orange' : 'green'}>
                {NOMBRE_SITUACION[s]}: {revision.por_situacion[s]}
              </Chip>
            ))}
          </div>
          {revision.listo ? (
            <div className="mt-4">
              <Alert tone="success">Sin advertencias: el archivo se puede subir tal cual.</Alert>
            </div>
          ) : (
            <ul className="mt-4 space-y-3">
              {revision.advertencias.map((a) => (
                <li key={a.codigo} className="text-sm">
                  <p className="font-semibold text-ink">
                    {a.cantidad} {a.cantidad === 1 ? 'estudiante' : 'estudiantes'}: <span className="font-normal text-body">{a.mensaje}</span>
                  </p>
                  <p className="text-xs text-muted">
                    Por ejemplo: {a.ejemplos.join('; ')}
                    {a.cantidad > a.ejemplos.length ? '…' : ''}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </Card>
      )}
    </div>
  );
}
