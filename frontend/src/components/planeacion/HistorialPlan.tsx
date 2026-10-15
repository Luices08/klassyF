import { formatoFechaHora } from '../../lib/fechas';
import { nombreDePersona, tamanoLegible } from '../../lib/planeacion';
import type { RevisionPlan, VersionPlan } from '../../types/domain';
import { Chip, type Tone } from '../ui/Badge';
import { Button } from '../ui/Button';
import { LineaTiempo, type LineaTiempoItem } from '../ui/LineaTiempo';

const NOMBRE_ACCION: Record<RevisionPlan['accion'], string> = {
  APROBADO: 'Aprobado',
  DEVUELTO: 'Devuelto con comentarios',
  REABIERTO: 'Reabierto',
};

const TONO_ACCION: Record<RevisionPlan['accion'], Tone> = {
  APROBADO: 'green',
  DEVUELTO: 'red',
  REABIERTO: 'orange',
};

interface HistorialPlanProps {
  versiones: VersionPlan[];
  revisiones: RevisionPlan[];
  /** La versión que se está viendo en el visor, para marcarla. */
  versionActiva?: number;
  /** Abre el PDF de una versión en el visor. */
  onVerVersion?: (numero: number) => void;
}

/** Cada envío del docente y cada decisión de coordinación, del más reciente al más antiguo, con fecha y hora. */
export function HistorialPlan({ versiones, revisiones, versionActiva, onVerVersion }: HistorialPlanProps) {
  const eventos: Array<{ instante: number; item: LineaTiempoItem }> = [
    ...versiones.map((v) => ({
      instante: new Date(v.fecha).getTime(),
      item: {
        key: `v-${v.numero}`,
        fecha: formatoFechaHora(v.fecha),
        encabezado: (
          <>
            <Chip tone="blue">Versión {v.numero}</Chip>
            {v.origen === 'ADOPTADA' && <Chip tone="green">Adoptada</Chip>}
          </>
        ),
        children: (
          <div className="space-y-1">
            <p className="font-semibold text-ink">{v.titulo}</p>
            <p className="whitespace-pre-line text-muted">{v.descripcion}</p>
            <p className="text-xs text-muted">
              {v.archivo.nombre} · {tamanoLegible(v.archivo.bytes)} · {v.origen === 'ADOPTADA' ? `adoptado de ${nombreDePersona(v.adoptado_de?.docente)}` : `subido por ${nombreDePersona(v.subido_por)}`}
            </p>
            {onVerVersion && (
              <Button type="button" variant={versionActiva === v.numero ? 'soft-edit' : 'outline'} className="px-3 py-1 text-xs" onClick={() => onVerVersion(v.numero)}>
                {versionActiva === v.numero ? 'Viendo este documento' : 'Ver este documento'}
              </Button>
            )}
          </div>
        ),
      },
    })),
    ...revisiones.map((r, indice) => ({
      instante: new Date(r.fecha).getTime(),
      item: {
        key: `r-${indice}`,
        fecha: formatoFechaHora(r.fecha),
        encabezado: (
          <>
            <Chip tone={TONO_ACCION[r.accion]}>{NOMBRE_ACCION[r.accion]}</Chip>
            {r.automatica && <Chip tone="neutral">Sin nueva revisión</Chip>}
          </>
        ),
        children: (
          <div className="space-y-1">
            {r.comentario ? <p className="whitespace-pre-line text-body">{r.comentario}</p> : <p className="text-muted">Sin comentarios.</p>}
            <p className="text-xs text-muted">
              {r.automatica ? 'Aprobación heredada del plan adoptado' : `${nombreDePersona(r.revisor)} · versión ${r.version}`}
            </p>
          </div>
        ),
      },
    })),
  ];

  // Un envío y la decisión que le sigue pueden caer en el mismo instante: la decisión va arriba.
  eventos.sort((a, b) => b.instante - a.instante || (a.item.key.startsWith('r-') ? -1 : 1));
  return <LineaTiempo items={eventos.map((e) => e.item)} vacio="Todavía no hay envíos." />;
}
