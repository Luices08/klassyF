import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { useGroups } from '../../hooks/useGroups';
import { useStudentGuardians } from '../../hooks/useGuardians';
import {
  descargarResolucion,
  type DetalleTramite,
  NOMBRES_ESTADO_ANTICIPADA,
  NOMBRES_MEDIO,
  NOMBRES_TIPO_ANTICIPADA,
  type MedioConsentimiento,
  useAnularAnticipada,
  useAplicarAnticipada,
  useEmitirResolucion,
  useRegistrarConsentimiento,
  useRegistrarNivelacion,
  useTramiteAnticipada,
} from '../../hooks/usePromocionAnticipada';
import { formatoFechaHora } from '../../lib/fechas';
import { opcionesDeGrupos } from '../../lib/opcionesBuscables';
import { Alert, errorMessage } from '../ui/Alert';
import { Chip } from '../ui/Badge';
import { Button } from '../ui/Button';
import { Card, CardHeader } from '../ui/Card';
import { Drawer } from '../ui/Drawer';
import { Input, Select, Textarea } from '../ui/Field';
import { SelectBuscable } from '../ui/SelectBuscable';
import { Spinner } from '../ui/Spinner';
import { VistaPreviaPdf } from '../ui/VistaPreviaPdf';
import { TONO_ESTADO_ANTICIPADA } from './tonosAnticipada';

const idDe = (s: DetalleTramite['student_id']) => (typeof s === 'string' ? s : s._id);

/** Un paso del trámite con su estado: cumplido, pendiente o negativo. */
function Paso({ titulo, estado, detalle }: { titulo: string; estado: 'ok' | 'pendiente' | 'no' | 'no-exigido'; detalle?: string }) {
  const chip = estado === 'ok' ? <Chip tone="green">Cumplido</Chip> : estado === 'no' ? <Chip tone="red">No</Chip> : estado === 'no-exigido' ? <Chip tone="neutral">No se exige</Chip> : <Chip tone="orange">Pendiente</Chip>;
  return (
    <div className="flex items-start justify-between gap-3 border-b border-border py-2 last:border-0">
      <div>
        <p className="text-sm font-semibold text-ink">{titulo}</p>
        {detalle && <p className="text-xs text-muted">{detalle}</p>}
      </div>
      {chip}
    </div>
  );
}

/**
 * Un trámite de promoción anticipada de punta a punta. El concepto de la comisión y la decisión del Consejo Directivo no se registran aquí: salen de
 * las actas firmadas de sus sesiones (módulo Comisión). Aquí se registra el consentimiento, se emite la resolución, se aplica y se nivela.
 */
export function TramiteAnticipadaDrawer({ id, nombreEstudiante, anioId, onClose }: { id: string; nombreEstudiante: string; anioId?: string; onClose: () => void }) {
  const { user } = useAuth();
  const esAdmin = user?.rol === 'ADMIN';
  const { data: t, isLoading, isError, error } = useTramiteAnticipada(id);
  const [viendoResolucion, setViendoResolucion] = useState(false);

  return (
    <Drawer open title="Promoción anticipada" subtitle={nombreEstudiante} onClose={onClose} size="lg">
      {isLoading && <Spinner />}
      {isError && <Alert tone="error">{errorMessage(error)}</Alert>}
      {t && (
        <>
          <div className="flex flex-wrap items-center gap-2">
            <Chip tone={TONO_ESTADO_ANTICIPADA[t.estado]}>{NOMBRES_ESTADO_ANTICIPADA[t.estado]}</Chip>
            <Chip tone="blue">{NOMBRES_TIPO_ANTICIPADA[t.tipo]}</Chip>
            {t.resolucion && <Chip tone="neutral">Resolución {t.resolucion.codigo}</Chip>}
          </div>
          {t.cierre && <Alert tone={t.cierre.estado === 'RECHAZADA' ? 'warning' : 'info'}>{t.cierre.motivo}</Alert>}

          <Card>
            <CardHeader title="Cumplimiento del criterio" subtitle={`Notas cerradas del periodo ${t.evaluacion.periodo}. Promedio: ${t.evaluacion.promedio ?? '—'}.`} />
            <ul className="grid grid-cols-1 gap-1 text-sm sm:grid-cols-2">
              {t.evaluacion.notas.map((n) => (
                <li key={n.subject_id} className="flex justify-between border-b border-border py-1">
                  <span>{n.nombre}</span>
                  <strong>{n.nota ?? '—'}</strong>
                </li>
              ))}
            </ul>
          </Card>

          <Card>
            <CardHeader title="Pasos" subtitle="Los que el colegio exigía cuando se abrió el trámite." />
            <Paso
              titulo="Concepto de la Comisión de Evaluación y Promoción"
              estado={!t.reglas.exige.concepto_comision && !t.concepto_comision ? 'no-exigido' : t.concepto_comision ? (t.concepto_comision.favorable ? 'ok' : 'no') : 'pendiente'}
              detalle={t.concepto_comision ? `Acta ${t.concepto_comision.acta}` : 'Se registra al firmar el acta de una sesión de la comisión.'}
            />
            <Paso
              titulo="Consentimiento de los padres o acudiente"
              estado={!t.reglas.exige.consentimiento_familia && !t.consentimiento ? 'no-exigido' : t.consentimiento ? (t.consentimiento.otorgado ? 'ok' : 'no') : 'pendiente'}
              detalle={t.consentimiento ? `${t.consentimiento.otorgado_por.nombre} · ${NOMBRES_MEDIO[t.consentimiento.medio]} · ${formatoFechaHora(t.consentimiento.fecha)}` : undefined}
            />
            <Paso
              titulo="Aprobación del Consejo Directivo"
              estado={!t.reglas.exige.decision_consejo_directivo && !t.decision_consejo ? 'no-exigido' : t.decision_consejo ? (t.decision_consejo.aprobada ? 'ok' : 'no') : 'pendiente'}
              detalle={t.decision_consejo ? `Acta ${t.decision_consejo.acta}` : 'Se registra al firmar el acta de una sesión del Consejo Directivo.'}
            />
            <Paso titulo="Resolución rectoral" estado={t.resolucion ? 'ok' : 'pendiente'} detalle={t.resolucion ? `${t.resolucion.codigo} · ${formatoFechaHora(t.resolucion.fecha)}` : undefined} />
            <Paso titulo="Aplicada al grado siguiente" estado={t.aplicacion ? 'ok' : 'pendiente'} detalle={t.aplicacion ? formatoFechaHora(t.aplicacion.fecha) : undefined} />
            {(t.estado === 'SOLICITADA' || t.estado === 'LISTA_PARA_RESOLUCION') && (
              <p className="mt-3 text-xs text-muted">
                Los casos de promoción anticipada se tratan en las sesiones de la comisión y del Consejo Directivo. <Link className="text-primary underline" to="/comision">Ir a Comisión</Link>
              </p>
            )}
          </Card>

          {(t.estado === 'SOLICITADA' || t.estado === 'LISTA_PARA_RESOLUCION') && !t.consentimiento && <Consentimiento tramite={t} />}
          {t.estado === 'LISTA_PARA_RESOLUCION' && esAdmin && <EmitirResolucion tramite={t} />}
          {t.resolucion && (
            <Button type="button" variant="outline" onClick={() => setViendoResolucion(true)}>
              Ver la resolución (PDF)
            </Button>
          )}
          {t.estado === 'RESUELTA' && esAdmin && <Aplicar tramite={t} anioId={anioId} />}
          {t.estado === 'APLICADA' && <Nivelaciones tramite={t} />}
          {['SOLICITADA', 'LISTA_PARA_RESOLUCION', 'RESUELTA'].includes(t.estado) && (t.estado !== 'RESUELTA' || esAdmin) && <Anular tramite={t} onHecho={onClose} />}

          {viendoResolucion && t.resolucion && (
            <Drawer open title={`Resolución ${t.resolucion.codigo}`} onClose={() => setViendoResolucion(false)} size="xl">
              <VistaPreviaPdf claveConsulta={['resolucion-anticipada', t._id]} cargar={() => descargarResolucion(t._id)} nombreArchivo={`${t.resolucion.codigo}.pdf`} titulo="Resolución rectoral" />
            </Drawer>
          )}
        </>
      )}
    </Drawer>
  );
}

function Consentimiento({ tramite }: { tramite: DetalleTramite }) {
  const registrar = useRegistrarConsentimiento();
  const { data: vinculos = [] } = useStudentGuardians(idDe(tramite.student_id));
  const [otorgado, setOtorgado] = useState('si');
  const [medio, setMedio] = useState<MedioConsentimiento>('FORMATO_FIRMADO');
  const [quien, setQuien] = useState('');
  const [obs, setObs] = useState('');
  const [error, setError] = useState<string | null>(null);

  async function guardar() {
    setError(null);
    try {
      await registrar.mutateAsync({ id: tramite._id, otorgado: otorgado === 'si', medio, guardian_id: quien === 'ESTUDIANTE' ? null : quien, por_el_estudiante: quien === 'ESTUDIANTE', observaciones: obs || undefined });
    } catch (err) {
      setError(errorMessage(err));
    }
  }

  return (
    <Card>
      <CardHeader title="Registrar el consentimiento" subtitle="Quien responde debe ser un acudiente vinculado al estudiante, o el propio estudiante si es mayor de edad." />
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <Select label="Quién responde" value={quien} onChange={(e) => setQuien(e.target.value)}>
          <option value="">Elige</option>
          {vinculos.map((v) => (
            <option key={v.guardian_id._id} value={v.guardian_id._id}>
              {v.guardian_id.nombre} {v.guardian_id.apellido} ({v.parentesco.toLowerCase()})
            </option>
          ))}
          <option value="ESTUDIANTE">El propio estudiante (mayor de edad)</option>
        </Select>
        <Select label="Respuesta" value={otorgado} onChange={(e) => setOtorgado(e.target.value)}>
          <option value="si">Autoriza</option>
          <option value="no">No autoriza (cierra el trámite)</option>
        </Select>
        <Select label="Medio" value={medio} onChange={(e) => setMedio(e.target.value as MedioConsentimiento)}>
          {(Object.keys(NOMBRES_MEDIO) as MedioConsentimiento[]).map((m) => (
            <option key={m} value={m}>
              {NOMBRES_MEDIO[m]}
            </option>
          ))}
        </Select>
      </div>
      <div className="mt-4">
        <Textarea label="Observaciones (opcional)" rows={2} maxLength={1000} value={obs} onChange={(e) => setObs(e.target.value)} />
      </div>
      {error && <div className="mt-3"><Alert tone="error">{error}</Alert></div>}
      <div className="mt-4 flex justify-end">
        <Button type="button" onClick={() => void guardar()} isLoading={registrar.isPending} disabled={!quien}>
          Registrar
        </Button>
      </div>
    </Card>
  );
}

function EmitirResolucion({ tramite }: { tramite: DetalleTramite }) {
  const emitir = useEmitirResolucion();
  const [fundamento, setFundamento] = useState('');
  const [clave, setClave] = useState('');
  const [error, setError] = useState<string | null>(null);

  async function enviar() {
    setError(null);
    try {
      await emitir.mutateAsync({ id: tramite._id, fundamento, confirm_password: clave });
    } catch (err) {
      setError(errorMessage(err));
    }
  }

  return (
    <Card>
      <CardHeader title="Emitir la resolución rectoral" subtitle="Lleva un consecutivo anual y una huella de integridad; no se edita después." />
      <div className="space-y-4">
        <Textarea label="Consideraciones adicionales (opcional)" rows={3} maxLength={3000} value={fundamento} onChange={(e) => setFundamento(e.target.value)} />
        <Input label="Tu contraseña de administrador" type="password" autoComplete="current-password" value={clave} onChange={(e) => setClave(e.target.value)} />
        {error && <Alert tone="error">{error}</Alert>}
        <div className="flex justify-end">
          <Button type="button" onClick={() => void enviar()} isLoading={emitir.isPending} disabled={!clave}>
            Emitir resolución
          </Button>
        </div>
      </div>
    </Card>
  );
}

function Aplicar({ tramite, anioId }: { tramite: DetalleTramite; anioId?: string }) {
  const grupos = useGroups({ academic_year_id: anioId });
  const aplicar = useAplicarAnticipada();
  const [grupoId, setGrupoId] = useState('');
  const [resultado, setResultado] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function enviar() {
    setError(null);
    try {
      const r = await aplicar.mutateAsync({ id: tramite._id, grupo_destino_id: grupoId });
      setResultado(r.nivelaciones_pendientes > 0 ? `Aplicada. Quedan ${r.nivelaciones_pendientes} nivelación(es) por registrar.` : 'Aplicada.');
    } catch (err) {
      setError(errorMessage(err));
    }
  }

  return (
    <Card>
      <CardHeader title="Pasar al estudiante al grado siguiente" subtitle="Se cambia de grupo su matrícula actual (conserva folio e historial); no se crea otra. Elige un grupo del grado siguiente, de la misma sede." />
      <SelectBuscable label="Grupo destino" value={grupoId} onChange={setGrupoId} vacioLabel="Elige un grupo" placeholder="Buscar grupo…" opciones={opcionesDeGrupos(grupos.data ?? [], { conCupos: true })} />
      {resultado && <div className="mt-3"><Alert tone="success">{resultado}</Alert></div>}
      {error && <div className="mt-3"><Alert tone="error">{error}</Alert></div>}
      <div className="mt-4 flex justify-end">
        <Button type="button" onClick={() => void enviar()} isLoading={aplicar.isPending} disabled={!grupoId}>
          Aplicar
        </Button>
      </div>
    </Card>
  );
}

function Nivelaciones({ tramite }: { tramite: DetalleTramite }) {
  const registrar = useRegistrarNivelacion();
  const [notas, setNotas] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const filas = (tramite.aplicacion?.notas ?? []).filter((n) => n.modo !== 'SIN_NOTA');
  if (filas.length === 0) return <Alert tone="info">Los periodos que no cursó quedaron sin nota: su porcentaje se reparte entre los demás.</Alert>;

  async function guardar(subjectId: string) {
    setError(null);
    try {
      await registrar.mutateAsync({ id: tramite._id, subject_id: subjectId, nota: Number(notas[subjectId]) });
      setNotas((p) => ({ ...p, [subjectId]: '' }));
    } catch (err) {
      setError(errorMessage(err));
    }
  }

  return (
    <Card>
      <CardHeader title="Notas de los periodos que no cursó" subtitle="Una nivelación pendiente impide el cierre de este estudiante (no el del grupo)." />
      <div className="space-y-3">
        {filas.map((n) => (
          <div key={n.subject_id} className="grid grid-cols-1 items-end gap-3 border-b border-border pb-3 last:border-0 sm:grid-cols-[1fr_auto_auto]">
            <div>
              <p className="text-sm font-semibold text-ink">{n.nombre}</p>
              <p className="text-xs text-muted">
                {n.modo === 'COPIADA' ? `Copiada de la asignatura equivalente: ${n.nota}` : n.nivelacion ? `Nivelación registrada: ${n.nivelacion.nota}` : `Nivelación pendiente${n.motivo ? ` · ${n.motivo}` : ''}`}
              </p>
            </div>
            {n.modo === 'NIVELACION' && (
              <>
                <Input label="Nota" hideLabel type="number" step="any" min={0} className="w-28" value={notas[n.subject_id] ?? ''} onChange={(e) => setNotas((p) => ({ ...p, [n.subject_id]: e.target.value }))} />
                <Button type="button" variant="soft-edit" disabled={!notas[n.subject_id]} onClick={() => void guardar(n.subject_id)} isLoading={registrar.isPending}>
                  {n.nivelacion ? 'Corregir' : 'Registrar'}
                </Button>
              </>
            )}
          </div>
        ))}
      </div>
      {error && <div className="mt-3"><Alert tone="error">{error}</Alert></div>}
    </Card>
  );
}

function Anular({ tramite, onHecho }: { tramite: DetalleTramite; onHecho: () => void }) {
  const anular = useAnularAnticipada();
  const [abierto, setAbierto] = useState(false);
  const [motivo, setMotivo] = useState('');
  const [error, setError] = useState<string | null>(null);

  if (!abierto) {
    return (
      <Button type="button" variant="soft-danger" onClick={() => setAbierto(true)}>
        Anular el trámite
      </Button>
    );
  }

  async function enviar() {
    setError(null);
    try {
      await anular.mutateAsync({ id: tramite._id, motivo });
      onHecho();
    } catch (err) {
      setError(errorMessage(err));
    }
  }

  return (
    <Card>
      <CardHeader title="Anular el trámite" subtitle="No toca la matrícula. Con la resolución ya emitida solo lo anula el rector." />
      <Textarea label="Motivo (mínimo 10 caracteres)" rows={3} maxLength={500} value={motivo} onChange={(e) => setMotivo(e.target.value)} />
      {error && <div className="mt-3"><Alert tone="error">{error}</Alert></div>}
      <div className="mt-4 flex justify-end gap-2">
        <Button type="button" variant="secondary" onClick={() => setAbierto(false)}>
          Cancelar
        </Button>
        <Button type="button" variant="soft-danger" onClick={() => void enviar()} isLoading={anular.isPending} disabled={motivo.trim().length < 10}>
          Anular
        </Button>
      </div>
    </Card>
  );
}
