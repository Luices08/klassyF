import type { ReactNode } from 'react';
import { Button } from '../ui/Button';
import { Chip, type Tone } from '../ui/Badge';
import { LineaTiempo } from '../ui/LineaTiempo';
import { formatoFechaCalendario } from '../../lib/fechas';
import {
  NOMBRES_MEDIO,
  NOMBRES_RESPONSABLE,
  type CompromisoObservacion,
  type FamiliaObservacion,
  type ObservacionVista,
  type TipoSituacion,
  useCerrarCompromiso,
} from '../../hooks/useObservaciones';

const TONO_FAMILIA: Record<FamiliaObservacion, Tone> = { ACADEMICA: 'blue', COMPORTAMENTAL: 'green', DISCIPLINARIA: 'orange' };
const TONO_SITUACION: Record<TipoSituacion, Tone> = { I: 'blue', II: 'orange', III: 'red' };
const ETIQUETA_CONTEXTO = { CLASE: 'Clase', DIRECCION_GRUPO: 'Dirección de grupo', COORDINACION: 'Coordinación' } as const;

export function ChipsObservacion({
  obs,
}: {
  obs: Pick<ObservacionVista, 'tipo_nombre' | 'familia' | 'tipo_situacion_maxima' | 'estado' | 'periodo_numero'>;
}) {
  return (
    <>
      <Chip tone={TONO_FAMILIA[obs.familia]}>{obs.tipo_nombre}</Chip>
      {obs.tipo_situacion_maxima && <Chip tone={TONO_SITUACION[obs.tipo_situacion_maxima]}>Situación tipo {obs.tipo_situacion_maxima}</Chip>}
      {obs.periodo_numero !== null && <Chip tone="neutral">Periodo {obs.periodo_numero}</Chip>}
      {obs.estado === 'ANULADA' && <Chip tone="red">Anulada</Chip>}
    </>
  );
}

function ChipCompromiso({ c }: { c: CompromisoObservacion }) {
  if (c.estado === 'CUMPLIDO') return <Chip tone="green">Cumplido</Chip>;
  if (c.estado === 'INCUMPLIDO') return <Chip tone="red">Incumplido</Chip>;
  return c.vencido ? <Chip tone="red">Vencido</Chip> : <Chip tone="orange">Pendiente</Chip>;
}

function CompromisoFila({ obsId, c, conAcciones }: { obsId: string; c: CompromisoObservacion; conAcciones: boolean }) {
  const cerrar = useCerrarCompromiso();
  return (
    <li className="flex flex-wrap items-center justify-between gap-2">
      <span>
        {c.descripcion}{' '}
        <span className="text-xs text-muted">
          · {NOMBRES_RESPONSABLE[c.responsable]} · hasta {formatoFechaCalendario(c.fecha_limite)}
          {c.nota_cierre ? ` · ${c.nota_cierre}` : ''}
        </span>
      </span>
      <span className="flex items-center gap-2">
        <ChipCompromiso c={c} />
        {conAcciones && c.estado === 'PENDIENTE' && (
          <>
            <Button variant="soft-success" className="px-3 py-1 text-xs" isLoading={cerrar.isPending} onClick={() => cerrar.mutate({ id: obsId, compromisoId: c._id, estado: 'CUMPLIDO' })}>
              Cumplido
            </Button>
            <Button variant="soft-danger" className="px-3 py-1 text-xs" isLoading={cerrar.isPending} onClick={() => cerrar.mutate({ id: obsId, compromisoId: c._id, estado: 'INCUMPLIDO' })}>
              Incumplido
            </Button>
          </>
        )}
      </span>
    </li>
  );
}

interface Props {
  observaciones: ObservacionVista[];
  /** Acciones por observación (enmendar, anular, seguimiento): el servidor igual valida el permiso. */
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
          <p className="text-muted">Situación en atención de coordinación de convivencia. El contenido es reservado.</p>
        ) : (
          <div className="space-y-2">
            <p className="whitespace-pre-line">{obs.texto_generado}</p>
            {obs.anulacion && <p className="text-xs text-danger">Anulada: {obs.anulacion.motivo}</p>}

            {obs.solicitud_caso && (
              <p className="flex flex-wrap items-center gap-2 text-xs text-muted">
                <Chip tone={obs.solicitud_caso.estado === 'PENDIENTE' ? 'orange' : 'neutral'}>
                  {obs.solicitud_caso.estado === 'PENDIENTE' ? 'Caso por atender' : 'Solicitud descartada'}
                </Chip>
                {obs.solicitud_caso.motivo}
                {obs.solicitud_caso.motivo_resolucion ? ` · ${obs.solicitud_caso.motivo_resolucion}` : ''}
              </p>
            )}

            {(obs.compromisos?.length ?? 0) > 0 && (
              <div>
                <p className="text-label text-ink">Compromisos</p>
                <ul className="mt-1 space-y-1.5">
                  {obs.compromisos?.map((c) => (
                    <CompromisoFila key={c._id} obsId={obs._id} c={c} conAcciones={obs.estado === 'ACTIVA' && Boolean(acciones)} />
                  ))}
                </ul>
              </div>
            )}

            {(obs.citaciones?.length ?? 0) > 0 && (
              <div>
                <p className="text-label text-ink">Citaciones</p>
                <ul className="mt-1 space-y-1">
                  {obs.citaciones?.map((c) => (
                    <li key={c._id} className="text-xs text-muted">
                      {formatoFechaCalendario(c.fecha)} · {NOMBRES_MEDIO[c.medio]}
                      {c.dirigida_a ? ` · ${c.dirigida_a}` : ''}
                      {c.resultado ? ` · ${c.resultado}` : ''}
                    </li>
                  ))}
                </ul>
              </div>
            )}

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
