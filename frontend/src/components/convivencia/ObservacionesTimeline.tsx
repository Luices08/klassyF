import type { ReactNode } from 'react';
import { Button } from '../ui/Button';
import { Chip, TipoSituacionBadge } from '../ui/Badge';
import { LineaTiempo } from '../ui/LineaTiempo';
import { formatoFechaCalendario } from '../../lib/fechas';
import { type ObservacionVista, useMarcarCompromiso } from '../../hooks/useObservaciones';

const ETIQUETA_CONTEXTO = { CLASE: 'Clase', DIRECCION_GRUPO: 'Dirección de grupo', COORDINACION: 'Coordinación', ORIENTACION: 'Orientación' } as const;

type CamposDeChips = Pick<ObservacionVista, 'clase' | 'tipo_nombre' | 'gravedad' | 'confidencial' | 'estado' | 'periodo_numero'>;

/** Qué es el registro (la observación y su tipo, o la falta y su gravedad) y su estado. */
export function ChipsObservacion({ obs }: { obs: CamposDeChips }) {
  return (
    <>
      {obs.clase === 'FALTA' ? (
        <>
          {obs.gravedad && <TipoSituacionBadge value={obs.gravedad} />}
          <Chip tone="neutral">{obs.tipo_nombre ?? 'Falta'}</Chip>
        </>
      ) : (
        <Chip tone="blue">{obs.tipo_nombre}</Chip>
      )}
      {obs.confidencial && <Chip tone="orange">Confidencial</Chip>}
      {obs.periodo_numero !== null && <Chip tone="neutral">Periodo {obs.periodo_numero}</Chip>}
      {obs.estado === 'ANULADA' && <Chip tone="red">Anulada</Chip>}
    </>
  );
}

function ChipCompromiso({ estado }: { estado: NonNullable<ObservacionVista['compromiso_estado']> }) {
  if (estado === 'CUMPLIDO') return <Chip tone="green">Cumplido</Chip>;
  if (estado === 'INCUMPLIDO') return <Chip tone="red">Incumplido</Chip>;
  return <Chip tone="orange">Pendiente</Chip>;
}

function Compromiso({ obs, conAcciones }: { obs: ObservacionVista; conAcciones: boolean }) {
  const marcar = useMarcarCompromiso();
  if (!obs.compromiso || !obs.compromiso_estado) return null;
  return (
    <div>
      <p className="text-label text-ink">{obs.clase === 'FALTA' ? 'Acuerdo formativo' : 'Compromiso'}</p>
      <div className="mt-1 flex flex-wrap items-center justify-between gap-2">
        <span>{obs.compromiso}</span>
        <span className="flex items-center gap-2">
          <ChipCompromiso estado={obs.compromiso_estado} />
          {conAcciones && obs.compromiso_estado === 'PENDIENTE' && (
            <>
              <Button variant="soft-success" className="px-3 py-1 text-xs" isLoading={marcar.isPending} onClick={() => marcar.mutate({ id: obs._id, estado: 'CUMPLIDO' })}>
                Cumplido
              </Button>
              <Button variant="soft-danger" className="px-3 py-1 text-xs" isLoading={marcar.isPending} onClick={() => marcar.mutate({ id: obs._id, estado: 'INCUMPLIDO' })}>
                Incumplido
              </Button>
            </>
          )}
        </span>
      </div>
    </div>
  );
}

/** Lo que pasó con una falta remitida a convivencia: visible para quien la registró; el director solo ve el caso. */
function EstadoDeRemision({ obs }: { obs: ObservacionVista }) {
  if (!obs.solicitud && !obs.caso) return null;
  return (
    <p className="flex flex-wrap items-center gap-2 text-xs text-muted">
      {obs.solicitud?.estado === 'PENDIENTE' && <Chip tone="orange">Enviada a convivencia: por atender</Chip>}
      {obs.solicitud?.estado === 'DESCARTADA' && (
        <>
          <Chip tone="neutral">Convivencia no abrió caso</Chip>
          {obs.solicitud.motivo_resolucion}
        </>
      )}
      {obs.caso && (
        <Chip tone="blue">
          Caso {obs.caso.codigo}: {obs.caso.estado.toLowerCase().replace('_', ' ')}
        </Chip>
      )}
    </p>
  );
}

interface Props {
  observaciones: ObservacionVista[];
  /** Acciones por registro (nota, citación, enmendar, anular): el servidor igual valida el permiso. */
  acciones?: (obs: ObservacionVista) => ReactNode;
}

/** Historial de convivencia de un estudiante: lo que el servidor deja ver a quien consulta, nada más. */
export function ObservacionesTimeline({ observaciones, acciones }: Props) {
  return (
    <LineaTiempo
      vacio="Este estudiante no tiene registros en su observador."
      items={observaciones.map((obs) => ({
        key: obs._id,
        fecha: formatoFechaCalendario(obs.fecha_hecho),
        atenuado: obs.estado === 'ANULADA',
        encabezado: <ChipsObservacion obs={obs} />,
        children: obs.reservada ? (
          <p className="text-muted">
            Falta atendida por coordinación de convivencia. El contenido es reservado.
            {obs.caso ? ` Caso ${obs.caso.codigo}: ${obs.caso.estado.toLowerCase().replace('_', ' ')}.` : ''}
          </p>
        ) : (
          <div className="space-y-2">
            {obs.falta && (
              <p className="text-xs text-muted">
                {obs.falta.codigo} · {obs.falta.descripcion}
              </p>
            )}
            <p className="whitespace-pre-line">{obs.descripcion}</p>
            {obs.version_estudiante && (
              <div>
                <p className="text-label text-ink">Versión del estudiante</p>
                <p className="mt-1 whitespace-pre-line">{obs.version_estudiante}</p>
              </div>
            )}
            {obs.anulacion && <p className="text-xs text-danger">Anulada: {obs.anulacion.motivo}</p>}

            <EstadoDeRemision obs={obs} />
            <Compromiso obs={obs} conAcciones={obs.estado === 'ACTIVA' && Boolean(acciones)} />

            {obs.requiere_citacion && (
              <p className="flex flex-wrap items-center gap-2 text-xs text-muted">
                {obs.citacion_realizada ? (
                  <>
                    <Chip tone="green">Citación realizada</Chip>
                    {formatoFechaCalendario(obs.citacion_realizada.fecha)}
                    {obs.citacion_realizada.resultado ? ` · ${obs.citacion_realizada.resultado}` : ''}
                  </>
                ) : (
                  <Chip tone="orange">Amerita citar al acudiente</Chip>
                )}
              </p>
            )}

            {(obs.seguimientos?.length ?? 0) > 0 && (
              <div>
                <p className="text-label text-ink">Seguimiento</p>
                <ul className="mt-1 space-y-1">
                  {obs.seguimientos?.map((s) => (
                    <li key={s._id} className="text-xs text-muted">
                      {formatoFechaCalendario(s.fecha)} · {s.nota}
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
