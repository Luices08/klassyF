import type { ReactNode } from 'react';
import { Chip, type Tone } from '../ui/Badge';
import { LineaTiempo } from '../ui/LineaTiempo';
import { formatoFechaCalendario } from '../../lib/fechas';
import type { FamiliaObservacion, ObservacionVista, TipoSituacion } from '../../hooks/useObservaciones';

const TONO_FAMILIA: Record<FamiliaObservacion, Tone> = { ACADEMICA: 'blue', COMPORTAMENTAL: 'green', DISCIPLINARIA: 'orange' };
const TONO_SITUACION: Record<TipoSituacion, Tone> = { I: 'blue', II: 'orange', III: 'red' };
const ETIQUETA_CONTEXTO = { CLASE: 'Clase', DIRECCION_GRUPO: 'Dirección de grupo', COORDINACION: 'Coordinación' } as const;

export function ChipsObservacion({ obs }: { obs: Pick<ObservacionVista, 'tipo_nombre' | 'familia' | 'tipo_situacion_maxima' | 'estado' | 'periodo_numero'> }) {
  return (
    <>
      <Chip tone={TONO_FAMILIA[obs.familia]}>{obs.tipo_nombre}</Chip>
      {obs.tipo_situacion_maxima && <Chip tone={TONO_SITUACION[obs.tipo_situacion_maxima]}>Situación tipo {obs.tipo_situacion_maxima}</Chip>}
      {obs.periodo_numero !== null && <Chip tone="neutral">Periodo {obs.periodo_numero}</Chip>}
      {obs.estado === 'ANULADA' && <Chip tone="red">Anulada</Chip>}
    </>
  );
}

interface Props {
  observaciones: ObservacionVista[];
  /** Acciones por observación (enmendar, anular): el servidor igual valida el permiso. */
  acciones?: (obs: ObservacionVista) => ReactNode;
}

/** Historial de convivencia de un estudiante: lo que el servidor deja ver a quien consulta, nada más. */
export function ObservacionesTimeline({ observaciones, acciones }: Props) {
  return (
    <LineaTiempo
      vacio="Este estudiante no tiene observaciones registradas."
      items={observaciones.map((obs) => ({
        key: obs._id,
        fecha: formatoFechaCalendario(obs.fecha_hecho),
        atenuado: obs.estado === 'ANULADA',
        encabezado: <ChipsObservacion obs={obs} />,
        children: obs.reservada ? (
          <p className="text-muted">
            Situación en atención de coordinación de convivencia. El contenido es reservado.
          </p>
        ) : (
          <div className="space-y-2">
            <p className="whitespace-pre-line">{obs.texto_generado}</p>
            {obs.anulacion && <p className="text-xs text-danger">Anulada: {obs.anulacion.motivo}</p>}
            <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted">
              <span>
                {obs.autor ?? 'Autor no disponible'}
                {obs.contexto ? ` · ${ETIQUETA_CONTEXTO[obs.contexto]}` : ''}
                {obs.cantidad_enmiendas ? ` · enmendada ${obs.cantidad_enmiendas} vez(es)` : ''}
              </span>
              {acciones?.(obs)}
            </div>
          </div>
        ),
      }))}
    />
  );
}
