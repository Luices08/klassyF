import { Alert } from '../ui/Alert';
import { Chip, EstadoMatriculaBadge } from '../ui/Badge';
import { Button } from '../ui/Button';
import { Card } from '../ui/Card';
import { ETIQUETA_JORNADA, type FichaEstudiante, type MatriculaExpedible } from '../../hooks/useCertificados';
import { formatoFechaLocal } from '../../lib/fechas';
import type { EstadoMatricula } from '../../types/domain';

const INGRESO: Record<string, string> = { NUEVO: 'Nuevo(a)', ANTIGUO: 'Antiguo(a)', TRASLADO: 'Traslado', REPITENTE: 'Repitente' };

function Dato({ etiqueta, valor }: { etiqueta: string; valor: string | null | undefined }) {
  return (
    <div className="min-w-0">
      <dt className="text-xs font-semibold uppercase tracking-wide text-muted">{etiqueta}</dt>
      <dd className="mt-0.5 break-words text-sm text-ink">{valor?.trim() ? valor : <span className="text-muted">Sin dato</span>}</dd>
    </div>
  );
}

/**
 * Lo que el sistema ya sabe del estudiante para expedir (M01/M03/M04): es solo lectura, nada se digita aquí. Muestra la matrícula elegida
 * (sede, jornada, horario, folio), su acudiente y qué datos faltan para que los documentos salgan completos.
 */
export function TarjetaEstudiante({ ficha, matricula, onCambiar }: { ficha: FichaEstudiante; matricula: MatriculaExpedible | undefined; onCambiar: () => void }) {
  const e = ficha.estudiante;
  const principal = ficha.acudientes.find((a) => a.es_principal) ?? ficha.acudientes[0];
  const horario = matricula?.horario ? `${matricula.horario.inicio} – ${matricula.horario.fin}` : null;

  return (
    <Card className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-h3 text-ink">
            {e.apellido} {e.nombre}
          </p>
          <p className="text-sm text-muted">
            {e.tipo_documento} {e.numero_documento}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {matricula && <EstadoMatriculaBadge value={matricula.estado as EstadoMatricula} />}
          <Button variant="secondary" onClick={onCambiar}>
            Cambiar
          </Button>
        </div>
      </div>

      {matricula && (
        <dl className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Dato etiqueta="Grado y grupo" valor={`${matricula.grado} · ${matricula.grupo} (${matricula.anio})`} />
          <Dato etiqueta="Sede" valor={matricula.sede} />
          <Dato etiqueta="Jornada" valor={matricula.jornada ? `${ETIQUETA_JORNADA[matricula.jornada] ?? matricula.jornada}${horario ? ` · ${horario}` : ''}` : null} />
          <Dato etiqueta="Ingreso" valor={matricula.tipo_ingreso ? (INGRESO[matricula.tipo_ingreso] ?? matricula.tipo_ingreso) : null} />
          <Dato
            etiqueta="Libro de Matrícula"
            valor={matricula.folio_matricula ? `${matricula.folio_matricula}${matricula.numero_libro !== null && matricula.numero_folio !== null ? ` (libro ${matricula.numero_libro}, folio ${matricula.numero_folio})` : ''}` : null}
          />
          <Dato etiqueta="Fecha de matrícula" valor={formatoFechaLocal(matricula.fecha_matricula)} />
          <Dato etiqueta="Acudiente responsable" valor={principal ? `${principal.nombre} · ${principal.parentesco.toLowerCase().replace(/_/g, ' ')} · ${principal.telefono}` : null} />
          <div className="min-w-0">
            <dt className="text-xs font-semibold uppercase tracking-wide text-muted">EPS (M03)</dt>
            <dd className="mt-0.5 text-sm text-ink">
              {e.eps.disponible ? <Chip tone="green">{e.eps.valor}</Chip> : <span className="text-xs text-muted">{e.eps.motivo}</span>}
            </dd>
          </div>
        </dl>
      )}

      {ficha.acudientes.length > 1 && (
        <p className="text-xs text-muted">
          Otros acudientes vinculados:{' '}
          {ficha.acudientes
            .filter((a) => a !== principal)
            .map((a) => `${a.nombre} (${a.parentesco.toLowerCase().replace(/_/g, ' ')})`)
            .join(', ')}
          .
        </p>
      )}

      {ficha.faltantes.length > 0 && (
        <Alert tone="warning">
          <p className="font-semibold">Para que los documentos salgan completos falta:</p>
          <ul className="mt-1 list-disc space-y-0.5 pl-4">
            {ficha.faltantes.map((f) => (
              <li key={f}>{f}</li>
            ))}
          </ul>
        </Alert>
      )}
    </Card>
  );
}
