import { type FormEvent, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { AgregarCasoDrawer } from '../components/comision/AgregarCasoDrawer';
import { CasoCard } from '../components/comision/CasoCard';
import { CompromisosPanel } from '../components/comision/CompromisosPanel';
import { FichaDrawer } from '../components/comision/FichaDrawer';
import { MiembrosEditor } from '../components/comision/MiembrosEditor';
import { TONO_ESTADO_SESION } from '../components/comision/tonosSesion';
import { Alert, errorMessage } from '../components/ui/Alert';
import { Chip } from '../components/ui/Badge';
import { Button } from '../components/ui/Button';
import { Card, CardHeader } from '../components/ui/Card';
import { Drawer } from '../components/ui/Drawer';
import { Input, Textarea } from '../components/ui/Field';
import { PageHeader } from '../components/ui/PageHeader';
import { Spinner } from '../components/ui/Spinner';
import { VistaPreviaPdf } from '../components/ui/VistaPreviaPdf';
import { useAuth } from '../context/AuthContext';
import {
  descargarActaSesion,
  type EntradaMiembro,
  NOMBRES_ESTADO_SESION,
  NOMBRES_INSTANCIA,
  type Sesion,
  useActualizarSesion,
  useAnularSesion,
  useConvocarSesion,
  useFirmarSesion,
  useRealizarSesion,
  useSesion,
} from '../hooks/useComision';
import { aInputFecha } from '../lib/fechas';

/**
 * Una sesión de la comisión o de un consejo, de borrador a acta firmada. Gestionan el rector y coordinación (el Consejo Directivo, solo el rector);
 * cada integrante que asistió firma con su contraseña. Con el acta firmada nada se edita: solo el seguimiento de los compromisos.
 */
export function SesionComisionPage() {
  const { id } = useParams();
  const { data: sesion, isLoading, isError, error } = useSesion(id);
  if (isLoading) return <Spinner />;
  if (isError || !sesion) return <Alert tone="error">{errorMessage(error)}</Alert>;
  return <Detalle key={`${sesion._id}-${sesion.updatedAt ?? ''}`} sesion={sesion} />;
}

function Detalle({ sesion }: { sesion: Sesion }) {
  const { user } = useAuth();
  const actualizar = useActualizarSesion();
  const convocar = useConvocarSesion();
  const realizar = useRealizarSesion();
  const [mensaje, setMensaje] = useState<{ tone: 'success' | 'error'; texto: string } | null>(null);
  const [fecha, setFecha] = useState(aInputFecha(sesion.fecha));
  const [hora, setHora] = useState(sesion.hora);
  const [lugar, setLugar] = useState(sesion.lugar);
  const [orden, setOrden] = useState(sesion.orden_del_dia);
  const [desarrollo, setDesarrollo] = useState(sesion.desarrollo);
  const [conclusiones, setConclusiones] = useState(sesion.conclusiones);
  const [asistio, setAsistio] = useState<Record<string, boolean>>(() => Object.fromEntries(sesion.miembros.map((m) => [m._id, m.asistio])));
  const [miembros, setMiembros] = useState<EntradaMiembro[]>(() =>
    sesion.miembros.map((m) => ({ user_id: m.user_id, nombre: m.nombre, cargo: m.cargo, representa: m.representa, es_presidente: m.es_presidente }))
  );
  const [agregandoCaso, setAgregandoCaso] = useState(false);
  const [ficha, setFicha] = useState<{ id: string; nombre: string } | null>(null);
  const [firmando, setFirmando] = useState(false);
  const [anulando, setAnulando] = useState(false);
  const [verActa, setVerActa] = useState(false);

  const esAdmin = user?.rol === 'ADMIN';
  const gestiona = esAdmin || (user?.rol === 'COORDINADOR' && sesion.instancia !== 'CONSEJO_DIRECTIVO');
  const abierta = sesion.estado === 'BORRADOR' || sesion.estado === 'CONVOCADA';
  const puedeEditar = gestiona && abierta;
  const yo = sesion.miembros.find((m) => m.user_id === user?.id);
  const puedeFirmar = sesion.estado === 'REALIZADA' && Boolean(yo?.asistio) && !yo?.firma;

  async function ejecutar(accion: () => Promise<unknown>, ok: string) {
    setMensaje(null);
    try {
      await accion();
      setMensaje({ tone: 'success', texto: ok });
    } catch (err) {
      setMensaje({ tone: 'error', texto: errorMessage(err) });
    }
  }

  const guardar = (e?: FormEvent) => {
    e?.preventDefault();
    return ejecutar(
      () =>
        actualizar.mutateAsync({
          id: sesion._id,
          cambios: {
            fecha,
            hora,
            lugar,
            orden_del_dia: orden,
            desarrollo,
            conclusiones,
            asistencia: sesion.miembros.map((m) => ({ miembro_id: m._id, asistio: Boolean(asistio[m._id]) })),
          },
        }),
      'Cambios guardados.'
    );
  };

  const guardarIntegrantes = () =>
    ejecutar(() => actualizar.mutateAsync({ id: sesion._id, cambios: { miembros: miembros.map((m) => ({ ...m, user_id: m.user_id ?? null, nombre: m.user_id ? undefined : m.nombre })) } }), 'Integrantes guardados.');

  return (
    <div className="space-y-4">
      <PageHeader
        title={`${NOMBRES_INSTANCIA[sesion.instancia]}${sesion.codigo ? ` · ${sesion.codigo}` : ''}`}
        subtitle={sesion.alcance.periodo_numero ? `Seguimiento del periodo ${sesion.alcance.periodo_numero}, año ${sesion.anio}` : `Cierre anual ${sesion.anio}`}
        action={
          <div className="flex flex-wrap gap-2">
            <Link to="/comision" className="rounded-lg px-4 py-2 text-sm font-semibold text-body ring-1 ring-inset ring-border hover:bg-soft">
              ← Sesiones
            </Link>
            <Button variant="outline" onClick={() => setVerActa(true)}>
              Ver el acta (PDF)
            </Button>
          </div>
        }
      />
      <div className="flex flex-wrap items-center gap-2">
        <Chip tone={TONO_ESTADO_SESION[sesion.estado]}>{NOMBRES_ESTADO_SESION[sesion.estado]}</Chip>
        {sesion.quorum && <Chip tone={sesion.quorum.alcanzado ? 'green' : 'red'}>Quórum: {sesion.quorum.presentes}/{sesion.quorum.total_miembros}</Chip>}
        {sesion.estado === 'FIRMADA' && <Chip tone="neutral">Acta inalterable con huella de integridad</Chip>}
      </div>
      {sesion.anulacion && <Alert tone="warning">Sesión anulada: {sesion.anulacion.motivo}</Alert>}
      {mensaje && <Alert tone={mensaje.tone}>{mensaje.texto}</Alert>}

      <Card>
        <CardHeader title="Datos de la sesión" />
        <form onSubmit={(e) => void guardar(e)} className="space-y-4">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <Input label="Fecha" type="date" value={fecha} disabled={!puedeEditar} onChange={(e) => setFecha(e.target.value)} />
            <Input label="Hora" value={hora} maxLength={20} disabled={!puedeEditar} onChange={(e) => setHora(e.target.value)} />
            <Input label="Lugar" value={lugar} maxLength={160} disabled={!puedeEditar} onChange={(e) => setLugar(e.target.value)} />
          </div>
          <Textarea label="Orden del día" rows={3} maxLength={8000} value={orden} disabled={!puedeEditar} onChange={(e) => setOrden(e.target.value)} />
          {puedeEditar && (
            <div className="flex justify-end">
              <Button type="submit" variant="secondary" isLoading={actualizar.isPending}>
                Guardar
              </Button>
            </div>
          )}
        </form>
      </Card>

      <Card>
        <CardHeader title="Integrantes y asistencia" subtitle="Los integrantes sin usuario (personero, padres) firman en papel." />
        {sesion.estado === 'BORRADOR' && gestiona ? (
          <div className="space-y-3">
            <MiembrosEditor value={miembros} onChange={setMiembros} />
            <div className="flex justify-end">
              <Button type="button" variant="secondary" onClick={() => void guardarIntegrantes()} isLoading={actualizar.isPending}>
                Guardar integrantes
              </Button>
            </div>
          </div>
        ) : (
          <ul className="space-y-1">
            {sesion.miembros.map((m) => (
              <li key={m._id} className="flex items-center justify-between gap-3 border-b border-border py-2 last:border-0">
                <label className="flex items-center gap-2 text-sm">
                  <input type="checkbox" checked={Boolean(asistio[m._id])} disabled={!puedeEditar || sesion.estado === 'BORRADOR'} onChange={(e) => setAsistio((p) => ({ ...p, [m._id]: e.target.checked }))} />
                  <span>
                    <strong>{m.nombre}</strong> · {m.cargo}
                    {m.es_presidente && ' (preside)'}
                  </span>
                </label>
                {m.firma ? <Chip tone="green">Firmó</Chip> : m.user_id ? sesion.estado === 'REALIZADA' && m.asistio ? <Chip tone="orange">Pendiente de firma</Chip> : null : <Chip tone="neutral">Firma en papel</Chip>}
              </li>
            ))}
          </ul>
        )}
        {sesion.estado === 'CONVOCADA' && gestiona && <p className="mt-2 text-xs text-muted">Marca quiénes asisten y guarda antes de realizar la sesión.</p>}
      </Card>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-h3 text-ink">Casos</h2>
        {puedeEditar && sesion.estado !== 'BORRADOR' && (
          <Button onClick={() => setAgregandoCaso(true)}>Agregar un caso</Button>
        )}
        {puedeEditar && sesion.estado === 'BORRADOR' && <p className="text-xs text-muted">Convoca la sesión para poder agregar casos.</p>}
      </div>
      {sesion.casos.length === 0 && <Alert tone="info">Aún no hay casos en el orden del día.</Alert>}
      {sesion.casos.map((c) => (
        <CasoCard
          key={`${c._id}-${c.resultado_votacion ? 'r' : 'a'}`}
          sesion={sesion}
          caso={c}
          puedeEditar={puedeEditar && sesion.estado !== 'BORRADOR'}
          onFicha={() => setFicha({ id: c.student_id, nombre: sesion.estudiantes[c.student_id] ? `${sesion.estudiantes[c.student_id]!.apellido} ${sesion.estudiantes[c.student_id]!.nombre}` : 'Estudiante' })}
        />
      ))}

      <CompromisosPanel sesion={sesion} puedeAgregar={gestiona && sesion.estado !== 'FIRMADA' && sesion.estado !== 'ANULADA' && sesion.estado !== 'BORRADOR'} puedeSeguir={gestiona} />

      <Card>
        <CardHeader title="Desarrollo y conclusiones" subtitle="El desarrollo se exige para dar la sesión por realizada." />
        <div className="space-y-4">
          <Textarea label="Desarrollo" rows={5} maxLength={8000} value={desarrollo} disabled={!puedeEditar} onChange={(e) => setDesarrollo(e.target.value)} />
          <Textarea label="Conclusiones" rows={3} maxLength={8000} value={conclusiones} disabled={!puedeEditar} onChange={(e) => setConclusiones(e.target.value)} />
          {puedeEditar && (
            <div className="flex justify-end">
              <Button type="button" variant="secondary" onClick={() => void guardar()} isLoading={actualizar.isPending}>
                Guardar
              </Button>
            </div>
          )}
        </div>
      </Card>

      <div className="flex flex-wrap justify-end gap-2">
        {esAdmin && sesion.estado !== 'FIRMADA' && sesion.estado !== 'ANULADA' && (
          <Button variant="soft-danger" onClick={() => setAnulando(true)}>
            Anular la sesión
          </Button>
        )}
        {gestiona && sesion.estado === 'BORRADOR' && (
          <Button onClick={() => void ejecutar(() => convocar.mutateAsync(sesion._id), 'Sesión convocada.')} isLoading={convocar.isPending}>
            Convocar
          </Button>
        )}
        {gestiona && sesion.estado === 'CONVOCADA' && (
          <Button onClick={() => void guardar().then(() => ejecutar(() => realizar.mutateAsync(sesion._id), 'Sesión realizada: el quórum y las votaciones quedaron calculados.'))} isLoading={realizar.isPending}>
            Dar por realizada
          </Button>
        )}
        {puedeFirmar && <Button onClick={() => setFirmando(true)}>Firmar el acta</Button>}
      </div>

      {agregandoCaso && <AgregarCasoDrawer sesionId={sesion._id} anioId={sesion.academic_year_id} instancia={sesion.instancia} onClose={() => setAgregandoCaso(false)} />}
      {ficha && <FichaDrawer studentId={ficha.id} anioId={sesion.academic_year_id} nombre={ficha.nombre} onClose={() => setFicha(null)} />}
      {firmando && <FirmarDrawer sesionId={sesion._id} onClose={() => setFirmando(false)} />}
      {anulando && <AnularDrawer sesionId={sesion._id} onClose={() => setAnulando(false)} />}
      {verActa && (
        <Drawer open title="Acta de la sesión" onClose={() => setVerActa(false)} size="xl">
          <VistaPreviaPdf claveConsulta={['acta-sesion', sesion._id, sesion.estado, sesion.casos.length]} cargar={() => descargarActaSesion(sesion._id)} nombreArchivo={`${sesion.codigo ?? 'borrador-acta'}.pdf`} titulo="Acta" />
        </Drawer>
      )}
    </div>
  );
}

function FirmarDrawer({ sesionId, onClose }: { sesionId: string; onClose: () => void }) {
  const firmar = useFirmarSesion();
  const [clave, setClave] = useState('');
  const [error, setError] = useState<string | null>(null);
  async function enviar(e: FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      await firmar.mutateAsync({ id: sesionId, confirm_password: clave });
      onClose();
    } catch (err) {
      setError(errorMessage(err));
    }
  }
  return (
    <Drawer open title="Firmar el acta" onClose={onClose} onSubmit={(e) => void enviar(e)} submitLabel="Firmar" isSubmitting={firmar.isPending} submitDisabled={!clave}>
      <Alert tone="info">Confirmas el contenido del acta con tu contraseña. No es una firma electrónica certificada. Cuando firme el último integrante requerido, el acta queda inalterable y las decisiones aprobadas se aplican.</Alert>
      <Input label="Tu contraseña" type="password" autoComplete="current-password" value={clave} onChange={(e) => setClave(e.target.value)} />
      {error && <Alert tone="error">{error}</Alert>}
    </Drawer>
  );
}

function AnularDrawer({ sesionId, onClose }: { sesionId: string; onClose: () => void }) {
  const anular = useAnularSesion();
  const [motivo, setMotivo] = useState('');
  const [error, setError] = useState<string | null>(null);
  async function enviar(e: FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      await anular.mutateAsync({ id: sesionId, motivo });
      onClose();
    } catch (err) {
      setError(errorMessage(err));
    }
  }
  return (
    <Drawer open title="Anular la sesión" onClose={onClose} onSubmit={(e) => void enviar(e)} submitLabel="Anular" submitVariant="soft-danger" isSubmitting={anular.isPending} submitDisabled={motivo.trim().length < 10}>
      <Textarea label="Motivo (mínimo 10 caracteres)" rows={3} maxLength={500} value={motivo} onChange={(e) => setMotivo(e.target.value)} />
      {error && <Alert tone="error">{error}</Alert>}
    </Drawer>
  );
}
