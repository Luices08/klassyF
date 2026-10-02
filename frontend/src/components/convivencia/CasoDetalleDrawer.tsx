import { type ReactNode, useState } from 'react';
import { Alert, errorMessage } from '../ui/Alert';
import { EstadoCasoBadge, TipoSituacionBadge, Chip } from '../ui/Badge';
import { Button } from '../ui/Button';
import { Drawer } from '../ui/Drawer';
import { Spinner } from '../ui/Spinner';
import { TabPanel, Tabs } from '../ui/Tabs';
import { useAuth } from '../../context/AuthContext';
import {
  CERRABLES,
  NOMBRES_NOTIFICACION,
  NOMBRES_RESULTADO,
  NOMBRES_ROL_INVOLUCRADO,
  SIGUIENTES_ESTADOS,
  useActualizarPaso,
  useCaso,
  type CasoDetalle,
} from '../../hooks/useCasos';
import { NOMBRES_MEDIO } from '../../hooks/useObservaciones';
import { formatoFechaCalendario } from '../../lib/fechas';
import { AccionesCasoDrawer, type ModoAccionCaso } from './AccionesCasoDrawer';

interface Props {
  casoId: string | null;
  onClose: () => void;
}

export function CasoDetalleDrawer({ casoId, onClose }: Props) {
  const caso = useCaso(casoId);
  if (!casoId) return null;

  return (
    <Drawer open size="lg" title={caso.data?.codigo ?? 'Caso de convivencia'} subtitle="Cada consulta de un caso queda registrada en la auditoría." onClose={onClose}>
      {caso.isLoading && <Spinner />}
      {caso.isError && <Alert tone="error">{errorMessage(caso.error)}</Alert>}
      {caso.data && <Contenido caso={caso.data} />}
    </Drawer>
  );
}

const Fila = ({ etiqueta, children }: { etiqueta: string; children: ReactNode }) => (
  <div>
    <p className="text-label text-muted">{etiqueta}</p>
    <div className="mt-0.5 text-sm text-body">{children}</div>
  </div>
);

const Registro = ({ fecha, autor, children }: { fecha: string; autor?: string | null; children: ReactNode }) => (
  <li className="rounded-lg border border-border p-3 text-sm text-body">
    <p className="mb-1 text-xs text-muted">
      {formatoFechaCalendario(fecha)}
      {autor ? ` · ${autor}` : ''}
    </p>
    {children}
  </li>
);

interface BotonProps {
  modo: ModoAccionCaso;
  onAccion: (modo: ModoAccionCaso) => void;
  children: ReactNode;
  variante?: 'soft-edit' | 'soft-danger';
}

const Boton = ({ modo, onAccion, children, variante = 'soft-edit' }: BotonProps) => (
  <Button variant={variante} className="px-3 py-1 text-xs" onClick={() => onAccion(modo)}>
    {children}
  </Button>
);

function Contenido({ caso }: { caso: CasoDetalle }) {
  const { user } = useAuth();
  const esAdmin = user?.rol === 'ADMIN';
  const [tab, setTab] = useState('resumen');
  const [accion, setAccion] = useState<ModoAccionCaso | null>(null);
  const actualizarPaso = useActualizarPaso();

  const finalizado = caso.estado === 'CERRADO' || caso.estado === 'ANULADO';
  return (
    <>
      <div className="flex flex-wrap items-center gap-2">
        <EstadoCasoBadge value={caso.estado} />
        <TipoSituacionBadge value={caso.tipo_situacion} />
        <Chip tone="neutral">{caso.origen === 'OBSERVACION' ? 'Desde una observación' : 'Apertura directa'}</Chip>
        {caso.resultado_cierre && <Chip tone="green">{NOMBRES_RESULTADO[caso.resultado_cierre]}</Chip>}
      </div>

      {caso.alertas.map((a) => (
        <Alert key={a.codigo} tone="warning">
          {a.mensaje}
        </Alert>
      ))}

      {!finalizado && (
        <div className="flex flex-wrap gap-2">
          {SIGUIENTES_ESTADOS[caso.estado].length > 0 && <Boton onAccion={setAccion} modo="estado">Cambiar estado</Boton>}
          <Boton onAccion={setAccion} modo="tipo">Cambiar tipo</Boton>
          {CERRABLES.includes(caso.estado) && <Boton onAccion={setAccion} modo="cierre">Cerrar caso</Boton>}
          <Boton onAccion={setAccion} modo="impedimento">Declararme impedido</Boton>
          {esAdmin && caso.estado === 'ABIERTO' && (
            <Boton onAccion={setAccion} modo="anulacion" variante="soft-danger">
              Anular
            </Boton>
          )}
        </div>
      )}
      {caso.estado === 'CERRADO' && esAdmin && <Boton onAccion={setAccion} modo="reapertura">Reabrir caso</Boton>}

      <Tabs
        items={[
          { key: 'resumen', label: 'Hechos' },
          { key: 'protocolo', label: 'Protocolo' },
          { key: 'proceso', label: 'Descargos y seguimiento' },
          { key: 'cierre', label: 'Remisiones y decisión' },
        ]}
        active={tab}
        onChange={setTab}
      />

      <TabPanel active={tab} tabKey="resumen">
        <div className="space-y-4">
          <Fila etiqueta="Fecha y lugar">
            {formatoFechaCalendario(caso.fecha_hecho)}
            {caso.lugar ? ` · ${caso.lugar}` : ''}
          </Fila>
          <Fila etiqueta="Hechos">
            <p className="whitespace-pre-line">{caso.hechos}</p>
          </Fila>
          {caso.como_se_conocio && <Fila etiqueta="Cómo se conoció">{caso.como_se_conocio}</Fila>}
          <Fila etiqueta="Involucrados">
            <ul className="space-y-1">
              {caso.involucrados.map((i) => (
                <li key={`${i.student_id}${i.rol}`}>
                  {i.estudiante} <span className="text-xs text-muted">· {NOMBRES_ROL_INVOLUCRADO[i.rol]}</span>
                </li>
              ))}
            </ul>
          </Fila>
          {caso.reclasificaciones.length > 0 && (
            <Fila etiqueta="Cambios de tipo">
              <ul className="space-y-1">
                {caso.reclasificaciones.map((r) => (
                  <li key={r.fecha}>
                    {r.de} → {r.a} · {formatoFechaCalendario(r.fecha)} · {r.motivo}
                    {r.por_nombre ? ` (${r.por_nombre})` : ''}
                  </li>
                ))}
              </ul>
            </Fila>
          )}
          {caso.cierre && (
            <Fila etiqueta="Cierre">
              {formatoFechaCalendario(caso.cierre.fecha)} · {caso.cierre.motivo}
            </Fila>
          )}
          {caso.reaperturas.map((r) => (
            <Fila key={r.fecha} etiqueta="Reapertura">
              {formatoFechaCalendario(r.fecha)} · {r.motivo}
            </Fila>
          ))}
          {caso.anulacion && <Fila etiqueta="Anulación">{caso.anulacion.motivo}</Fila>}
        </div>
      </TabPanel>

      <TabPanel active={tab} tabKey="protocolo">
        <div className="space-y-4">
          {caso.pasos.length === 0 ? (
            <p className="text-sm text-muted">El protocolo de este tipo no tiene pasos definidos. Se configuran en el catálogo de convivencia.</p>
          ) : (
            <ul className="space-y-2">
              {caso.pasos.map((p) => (
                <li key={p._id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border p-3 text-sm text-body">
                  <span>
                    {p.nombre} {p.obligatorio && <Chip tone="orange">Obligatorio</Chip>}
                    {p.nota && <span className="block text-xs text-muted">{p.nota}</span>}
                  </span>
                  <span className="flex items-center gap-2">
                    <Chip tone={p.estado === 'CUMPLIDO' ? 'green' : p.estado === 'NO_APLICA' ? 'neutral' : 'orange'}>
                      {p.estado === 'CUMPLIDO' ? 'Cumplido' : p.estado === 'NO_APLICA' ? 'No aplica' : 'Pendiente'}
                    </Chip>
                    {!finalizado && p.estado === 'PENDIENTE' && (
                      <>
                        <Button variant="soft-success" className="px-3 py-1 text-xs" isLoading={actualizarPaso.isPending} onClick={() => actualizarPaso.mutate({ id: caso._id, pasoId: p._id, estado: 'CUMPLIDO' })}>
                          Cumplido
                        </Button>
                        <Button variant="soft-edit" className="px-3 py-1 text-xs" isLoading={actualizarPaso.isPending} onClick={() => actualizarPaso.mutate({ id: caso._id, pasoId: p._id, estado: 'NO_APLICA' })}>
                          No aplica
                        </Button>
                      </>
                    )}
                  </span>
                </li>
              ))}
            </ul>
          )}
          {actualizarPaso.isError && <Alert tone="error">{errorMessage(actualizarPaso.error)}</Alert>}

          <Fila etiqueta="Atención inmediata">
            {caso.atencion_inmediata ? (
              <>
                <p className="whitespace-pre-line">{caso.atencion_inmediata.descripcion}</p>
                <p className="text-xs text-muted">
                  {formatoFechaCalendario(caso.atencion_inmediata.fecha)}
                  {caso.atencion_inmediata.hubo_dano ? ' · hubo daño' : ''}
                </p>
              </>
            ) : (
              <span className="text-muted">Sin registrar{caso.tipo_situacion !== 'I' ? ' (obligatoria en tipo II y III)' : ''}.</span>
            )}
          </Fila>
          {!finalizado && <Boton onAccion={setAccion} modo="atencion">{caso.atencion_inmediata ? 'Actualizar atención' : 'Registrar atención'}</Boton>}

          <Fila etiqueta="Medidas de protección">
            <ul className="space-y-2">
              {caso.medidas_proteccion.map((m) => (
                <Registro key={m._id} fecha={m.fecha} autor={m.por_nombre}>
                  {m.descripcion}
                </Registro>
              ))}
              {caso.medidas_proteccion.length === 0 && <li className="text-muted">Sin registros.</li>}
            </ul>
          </Fila>
          {!finalizado && <Boton onAccion={setAccion} modo="medidas-proteccion">Agregar medida de protección</Boton>}
        </div>
      </TabPanel>

      <TabPanel active={tab} tabKey="proceso">
        <div className="space-y-4">
          <Fila etiqueta="Descargos (estudiante y acudiente)">
            <ul className="space-y-2">
              {caso.descargos.map((d) => (
                <Registro key={d._id} fecha={d.fecha} autor={d.por_nombre}>
                  <Chip tone="neutral">{d.parte === 'ESTUDIANTE' ? 'Estudiante' : 'Acudiente'}</Chip>
                  <p className="mt-1 whitespace-pre-line">{d.texto}</p>
                </Registro>
              ))}
              {caso.descargos.length === 0 && <li className="text-muted">Sin descargos: son previos a la decisión.</li>}
            </ul>
          </Fila>
          {!finalizado && <Boton onAccion={setAccion} modo="descargos">Registrar descargos</Boton>}

          <Fila etiqueta="Notificaciones e informe a los acudientes">
            <ul className="space-y-2">
              {caso.notificaciones.map((n) => (
                <Registro key={n._id} fecha={n.fecha} autor={n.por_nombre}>
                  {NOMBRES_NOTIFICACION[n.tipo]} · {NOMBRES_MEDIO[n.medio]}
                  {n.dirigida_a ? ` · ${n.dirigida_a}` : ''}
                  {n.resultado && <p className="text-xs text-muted">{n.resultado}</p>}
                </Registro>
              ))}
              {caso.notificaciones.length === 0 && <li className="text-muted">Sin registros.</li>}
            </ul>
          </Fila>
          {!finalizado && <Boton onAccion={setAccion} modo="notificaciones">Registrar notificación</Boton>}

          <Fila etiqueta="Seguimiento">
            <ul className="space-y-2">
              {caso.seguimientos.map((s) => (
                <Registro key={s._id} fecha={s.fecha} autor={s.por_nombre}>
                  <p className="whitespace-pre-line">{s.nota}</p>
                  {s.proxima_fecha && <p className="text-xs text-muted">Próximo: {formatoFechaCalendario(s.proxima_fecha)}</p>}
                </Registro>
              ))}
              {caso.seguimientos.length === 0 && <li className="text-muted">Sin registros.</li>}
            </ul>
          </Fila>
          {!finalizado && <Boton onAccion={setAccion} modo="seguimientos">Registrar seguimiento</Boton>}
        </div>
      </TabPanel>

      <TabPanel active={tab} tabKey="cierre">
        <div className="space-y-4">
          <Fila etiqueta="Remisiones a otras entidades">
            <ul className="space-y-2">
              {caso.remisiones.map((r) => (
                <Registro key={r._id} fecha={r.fecha} autor={r.por_nombre}>
                  <strong>{r.entidad_nombre}</strong>
                  {r.oficio ? ` · oficio ${r.oficio}` : ''}
                  {r.respuesta && <p className="text-xs text-muted">{r.respuesta}</p>}
                </Registro>
              ))}
              {caso.remisiones.length === 0 && <li className="text-muted">Sin remisiones{caso.justificacion_sin_remision ? `. Justificación: ${caso.justificacion_sin_remision}` : ''}.</li>}
            </ul>
          </Fila>
          {!finalizado && <Boton onAccion={setAccion} modo="remisiones">Registrar remisión</Boton>}

          <Fila etiqueta="Decisión">
            {caso.decision ? (
              <>
                <p className="whitespace-pre-line">{caso.decision.motivacion}</p>
                {caso.decision.descriptores.length > 0 && (
                  <p className="mt-1 text-xs text-muted">Faltas: {caso.decision.descriptores.map((d) => d.codigo ?? d.texto).join(', ')}</p>
                )}
                <p className="text-xs text-muted">
                  {formatoFechaCalendario(caso.decision.fecha)}
                  {caso.decision.por_nombre ? ` · ${caso.decision.por_nombre}` : ''}
                </p>
              </>
            ) : (
              <span className="text-muted">Sin decisión. Se toma después de los descargos.</span>
            )}
          </Fila>
          {!finalizado && <Boton onAccion={setAccion} modo="decision">{caso.decision ? 'Actualizar decisión' : 'Registrar decisión'}</Boton>}

          <Fila etiqueta="Medidas aplicadas">
            <ul className="space-y-2">
              {caso.medidas_aplicadas.map((m) => (
                <Registro key={m._id} fecha={m.fecha} autor={m.por_nombre}>
                  {m.nombre}
                  {m.dias ? ` · ${m.dias} día(s)` : ''}
                  {m.observaciones && <p className="text-xs text-muted">{m.observaciones}</p>}
                </Registro>
              ))}
              {caso.medidas_aplicadas.length === 0 && <li className="text-muted">Sin medidas aplicadas.</li>}
            </ul>
          </Fila>
          {!finalizado && <Boton onAccion={setAccion} modo="medidas-aplicadas">Registrar medida aplicada</Boton>}
        </div>
      </TabPanel>

      <AccionesCasoDrawer caso={caso} modo={accion} esAdmin={esAdmin} onClose={() => setAccion(null)} />
    </>
  );
}
