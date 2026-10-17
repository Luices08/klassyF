import { useState } from 'react';
import {
  type CasoSesion,
  decisionesDe,
  type DecisionCaso,
  NOMBRES_DECISION,
  NOMBRES_TIPO_CASO,
  NOMBRES_VOTO,
  type Sesion,
  type Voto,
  useActualizarCaso,
  useQuitarCaso,
} from '../../hooks/useComision';
import { Alert, errorMessage } from '../ui/Alert';
import { Chip } from '../ui/Badge';
import { Button } from '../ui/Button';
import { Card } from '../ui/Card';
import { Input, Select, Textarea } from '../ui/Field';

/**
 * Un caso de la sesión: deliberación, voto de cada integrante habilitado y decisión. Quien la ley o el sistema ya apartó (el acudiente del estudiante
 * o el propio estudiante) no vota. Una decisión sin quórum o sin mayoría queda registrada pero no se aplica.
 */
export function CasoCard({ sesion, caso, puedeEditar, onFicha }: { sesion: Sesion; caso: CasoSesion; puedeEditar: boolean; onFicha: () => void }) {
  const actualizar = useActualizarCaso();
  const quitar = useQuitarCaso();
  const [deliberacion, setDeliberacion] = useState(caso.deliberacion);
  const [votos, setVotos] = useState<Record<string, Voto | ''>>(() => Object.fromEntries(caso.votos.map((v) => [v.miembro_id, v.voto])));
  const [decision, setDecision] = useState<DecisionCaso | ''>(caso.decision?.tipo ?? '');
  const [fundamento, setFundamento] = useState(caso.decision?.fundamento ?? '');
  const [mensaje, setMensaje] = useState<{ tone: 'success' | 'error'; texto: string } | null>(null);

  const estudiante = sesion.estudiantes[caso.student_id];
  const nombre = estudiante ? `${estudiante.apellido} ${estudiante.nombre}` : 'Estudiante';
  const recusados = new Set(caso.recusados_ids);
  const votantes = sesion.miembros.filter((m) => !recusados.has(m._id));
  const opcionesDecision = decisionesDe(caso.tipo, sesion.instancia);
  const r = caso.resultado_votacion;

  async function guardar() {
    setMensaje(null);
    try {
      await actualizar.mutateAsync({
        sesionId: sesion._id,
        casoId: caso._id,
        cambios: {
          deliberacion,
          votos: Object.entries(votos)
            .filter(([, v]) => v)
            .map(([miembro_id, voto]) => ({ miembro_id, voto: voto as Voto })),
          ...(caso.tipo !== 'SEGUIMIENTO' ? { decision: decision ? { tipo: decision, fundamento } : null } : {}),
        },
      });
      setMensaje({ tone: 'success', texto: 'Caso guardado.' });
    } catch (err) {
      setMensaje({ tone: 'error', texto: errorMessage(err) });
    }
  }

  return (
    <Card>
      <div className="mb-3 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="text-h3 text-ink">{nombre}</h3>
          <p className="text-xs text-muted">{estudiante?.numero_documento}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Chip tone="blue">{NOMBRES_TIPO_CASO[caso.tipo]}</Chip>
          <Button type="button" variant="outline" onClick={onFicha}>
            Ficha técnica
          </Button>
          {puedeEditar && (
            <Button type="button" variant="soft-danger" isLoading={quitar.isPending} onClick={() => void quitar.mutateAsync({ sesionId: sesion._id, casoId: caso._id })}>
              Quitar
            </Button>
          )}
        </div>
      </div>

      {recusados.size > 0 && (
        <Alert tone="info">
          Apartados de este caso por conflicto de interés: {sesion.miembros.filter((m) => recusados.has(m._id)).map((m) => m.nombre).join(', ')}. No cuentan para el quórum del caso ni votan.
        </Alert>
      )}

      <div className="mt-3 space-y-4">
        <Textarea label="Deliberación" rows={3} maxLength={3000} value={deliberacion} disabled={!puedeEditar} onChange={(e) => setDeliberacion(e.target.value)} />

        {caso.tipo !== 'SEGUIMIENTO' && (
          <>
            <div>
              <p className="mb-2 text-label text-body">Votos</p>
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                {votantes.map((m) => (
                  <div key={m._id} className="flex items-center justify-between gap-3 rounded-lg bg-soft px-3 py-2">
                    <span className="text-sm">
                      {m.nombre}
                      {!m.asistio && <span className="block text-xs text-muted">No asistió: su voto no cuenta</span>}
                    </span>
                    <select
                      aria-label={`Voto de ${m.nombre}`}
                      className="rounded-lg border-0 bg-white py-1.5 pl-2 pr-7 text-sm ring-1 ring-inset ring-border"
                      value={votos[m._id] ?? ''}
                      disabled={!puedeEditar}
                      onChange={(e) => setVotos((p) => ({ ...p, [m._id]: e.target.value as Voto | '' }))}
                    >
                      <option value="">Sin voto</option>
                      {(Object.keys(NOMBRES_VOTO) as Voto[]).map((v) => (
                        <option key={v} value={v}>
                          {NOMBRES_VOTO[v]}
                        </option>
                      ))}
                    </select>
                  </div>
                ))}
              </div>
            </div>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Select label="Decisión" value={decision} disabled={!puedeEditar} onChange={(e) => setDecision(e.target.value as DecisionCaso | '')}>
                <option value="">Sin decisión</option>
                {opcionesDecision.map((d) => (
                  <option key={d} value={d}>
                    {NOMBRES_DECISION[d]}
                  </option>
                ))}
              </Select>
              <Input label="Fundamento" value={fundamento} maxLength={3000} disabled={!puedeEditar} onChange={(e) => setFundamento(e.target.value)} />
            </div>
          </>
        )}

        {r && (
          <Alert tone={r.aprobada ? 'success' : 'warning'}>
            {r.a_favor} a favor, {r.en_contra} en contra, {r.abstenciones} abstenciones (habilitados: {r.habilitados}).{' '}
            {!r.quorum ? 'Sin quórum en este caso: la decisión no se aplica.' : r.aprobada ? 'Aprobada: se aplicará al firmarse el acta.' : 'Sin mayoría: la decisión queda registrada pero no se aplica.'}
          </Alert>
        )}
        {mensaje && <Alert tone={mensaje.tone}>{mensaje.texto}</Alert>}
        {quitar.isError && <Alert tone="error">{errorMessage(quitar.error)}</Alert>}
        {puedeEditar && (
          <div className="flex justify-end">
            <Button type="button" onClick={() => void guardar()} isLoading={actualizar.isPending}>
              Guardar el caso
            </Button>
          </div>
        )}
      </div>
    </Card>
  );
}
