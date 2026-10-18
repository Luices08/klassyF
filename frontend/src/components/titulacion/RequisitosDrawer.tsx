import { useState } from 'react';
import {
  NOMBRES_ESTADO_TITULACION,
  NOMBRES_REQUISITO,
  useReevaluarTitulacion,
  useRegistrarCertificadoExterno,
  useRegistrarSaber11,
  useRegistrarServicioSocial,
  useRequisitosEstudiante,
} from '../../hooks/useTitulacion';
import { Alert, errorMessage } from '../ui/Alert';
import { Chip } from '../ui/Badge';
import { Button } from '../ui/Button';
import { Card, CardHeader } from '../ui/Card';
import { Drawer } from '../ui/Drawer';
import { Input } from '../ui/Field';
import { Spinner } from '../ui/Spinner';
import { TONO_ESTADO_TITULACION } from './tonosTitulacion';

/**
 * Lo que Secretaría necesita ver de un estudiante antes de graduarlo: lo registrado, lo que falta y los avisos (p. ej. servicio social desde 10°).
 * Cada registro reevalúa su titulación solo. Registran ADMIN y Secretaría; coordinación solo consulta.
 */
export function RequisitosDrawer({ studentId, anioId, nombre, puedeRegistrar, onClose }: { studentId: string; anioId: string; nombre: string; puedeRegistrar: boolean; onClose: () => void }) {
  const { data, isLoading, isError, error } = useRequisitosEstudiante(studentId);
  const reevaluar = useReevaluarTitulacion();
  const [mensaje, setMensaje] = useState<{ tone: 'success' | 'error'; texto: string } | null>(null);

  return (
    <Drawer open title="Requisitos de titulación" subtitle={nombre} onClose={onClose} size="lg">
      {isLoading && <Spinner />}
      {isError && <Alert tone="error">{errorMessage(error)}</Alert>}
      {mensaje && <Alert tone={mensaje.tone}>{mensaje.texto}</Alert>}
      {data && (
        <>
          <div className="flex flex-wrap gap-2">
            {data.titulaciones.map((t) => (
              <Chip key={t.academic_year_id} tone={TONO_ESTADO_TITULACION[t.estado]}>
                {NOMBRES_ESTADO_TITULACION[t.estado]} · {t.titulo}
              </Chip>
            ))}
            {data.titulaciones.length === 0 && <Chip tone="neutral">Aún sin evaluar para titulación</Chip>}
          </div>

          {data.alertas.length > 0 && (
            <Alert tone="warning">
              <ul className="list-disc pl-5">
                {data.alertas.map((a) => (
                  <li key={a.requisito}>{a.detalle}</li>
                ))}
              </ul>
            </Alert>
          )}

          <Card>
            <CardHeader title="Estado de los requisitos" subtitle="Los que exige la política del colegio; bloquean solo en el grado de titulación." />
            <ul className="space-y-2 text-sm">
              <li className="flex justify-between">
                <span>Servicio social</span>
                <strong>{data.horas_requeridas === null ? 'No se exige' : `${data.horas_servicio_social} de ${data.horas_requeridas} horas`}</strong>
              </li>
              <li className="flex justify-between">
                <span>Saber 11</span>
                <strong>{data.saber_11 ? `Registro ${data.saber_11.codigo_registro}` : 'Sin registrar'}</strong>
              </li>
              <li className="flex justify-between">
                <span>Paz y salvo</span>
                <strong>{data.paz_y_salvo_confirmado ? 'Confirmado' : 'Sin confirmar'}</strong>
              </li>
              <li className="flex justify-between">
                <span>Carpeta académica</span>
                <strong>{data.grados_sin_certificado.length === 0 ? 'Completa' : `Faltan los grados: ${data.grados_sin_certificado.join(', ')}`}</strong>
              </li>
            </ul>
            {data.pendientes.length > 0 && (
              <ul className="mt-3 list-disc pl-5 text-sm text-danger">
                {data.pendientes.map((p) => (
                  <li key={p.requisito}>
                    {NOMBRES_REQUISITO[p.requisito]}: {p.detalle}
                  </li>
                ))}
              </ul>
            )}
          </Card>

          {puedeRegistrar && (
            <>
              <ServicioSocial studentId={studentId} />
              <Saber11 studentId={studentId} actual={data.saber_11?.codigo_registro} />
              <CertificadoExterno studentId={studentId} />
              <div className="flex justify-end">
                <Button
                  type="button"
                  variant="secondary"
                  isLoading={reevaluar.isPending}
                  onClick={() =>
                    void reevaluar
                      .mutateAsync({ student_id: studentId, academic_year_id: anioId })
                      .then(() => setMensaje({ tone: 'success', texto: 'Titulación reevaluada.' }))
                      .catch((err) => setMensaje({ tone: 'error', texto: errorMessage(err) }))
                  }
                >
                  Reevaluar la titulación
                </Button>
              </div>
            </>
          )}
        </>
      )}
    </Drawer>
  );
}

function ServicioSocial({ studentId }: { studentId: string }) {
  const registrar = useRegistrarServicioSocial();
  const [horas, setHoras] = useState('');
  const [entidad, setEntidad] = useState('');
  const [descripcion, setDescripcion] = useState('');
  const [mensaje, setMensaje] = useState<{ tone: 'success' | 'error'; texto: string } | null>(null);

  async function enviar() {
    setMensaje(null);
    try {
      await registrar.mutateAsync({ student_id: studentId, horas: Number(horas), entidad, descripcion: descripcion || undefined });
      setHoras('');
      setEntidad('');
      setDescripcion('');
      setMensaje({ tone: 'success', texto: 'Horas registradas.' });
    } catch (err) {
      setMensaje({ tone: 'error', texto: errorMessage(err) });
    }
  }

  return (
    <Card>
      <CardHeader title="Registrar horas de servicio social" />
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <Input label="Horas" type="number" step="0.5" min={0.5} value={horas} onChange={(e) => setHoras(e.target.value)} />
        <Input label="Entidad" value={entidad} maxLength={160} onChange={(e) => setEntidad(e.target.value)} />
        <Input label="Descripción (opcional)" value={descripcion} maxLength={500} onChange={(e) => setDescripcion(e.target.value)} />
      </div>
      {mensaje && <div className="mt-3"><Alert tone={mensaje.tone}>{mensaje.texto}</Alert></div>}
      <div className="mt-3 flex justify-end">
        <Button type="button" onClick={() => void enviar()} isLoading={registrar.isPending} disabled={!horas || !entidad.trim()}>
          Registrar
        </Button>
      </div>
    </Card>
  );
}

function Saber11({ studentId, actual }: { studentId: string; actual?: string }) {
  const registrar = useRegistrarSaber11();
  const [codigo, setCodigo] = useState(actual ?? '');
  const [fecha, setFecha] = useState('');
  const [mensaje, setMensaje] = useState<{ tone: 'success' | 'error'; texto: string } | null>(null);

  async function enviar() {
    setMensaje(null);
    try {
      await registrar.mutateAsync({ student_id: studentId, codigo_registro: codigo, fecha_presentacion: fecha || null });
      setMensaje({ tone: 'success', texto: 'Registro guardado.' });
    } catch (err) {
      setMensaje({ tone: 'error', texto: errorMessage(err) });
    }
  }

  return (
    <Card>
      <CardHeader title="Saber 11" subtitle="Solo el código de registro y la fecha; nunca los puntajes." />
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Input label="Código de registro" value={codigo} maxLength={40} onChange={(e) => setCodigo(e.target.value)} />
        <Input label="Fecha de presentación (opcional)" type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} />
      </div>
      {mensaje && <div className="mt-3"><Alert tone={mensaje.tone}>{mensaje.texto}</Alert></div>}
      <div className="mt-3 flex justify-end">
        <Button type="button" onClick={() => void enviar()} isLoading={registrar.isPending} disabled={codigo.trim().length < 4}>
          Guardar
        </Button>
      </div>
    </Card>
  );
}

function CertificadoExterno({ studentId }: { studentId: string }) {
  const registrar = useRegistrarCertificadoExterno();
  const [grado, setGrado] = useState('');
  const [institucion, setInstitucion] = useState('');
  const [anio, setAnio] = useState('');
  const [mensaje, setMensaje] = useState<{ tone: 'success' | 'error'; texto: string } | null>(null);

  async function enviar() {
    setMensaje(null);
    try {
      await registrar.mutateAsync({ student_id: studentId, grado_numero: Number(grado), institucion_origen: institucion, anio: anio ? Number(anio) : null });
      setGrado('');
      setInstitucion('');
      setAnio('');
      setMensaje({ tone: 'success', texto: 'Certificado recibido registrado.' });
    } catch (err) {
      setMensaje({ tone: 'error', texto: errorMessage(err) });
    }
  }

  return (
    <Card>
      <CardHeader title="Certificado de otro colegio" subtitle="Para completar la carpeta académica de un grado cursado fuera." />
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <Input label="Grado (número)" type="number" min={-2} max={11} value={grado} onChange={(e) => setGrado(e.target.value)} />
        <Input label="Institución de origen" value={institucion} maxLength={160} onChange={(e) => setInstitucion(e.target.value)} />
        <Input label="Año (opcional)" type="number" min={1900} max={2200} value={anio} onChange={(e) => setAnio(e.target.value)} />
      </div>
      {mensaje && <div className="mt-3"><Alert tone={mensaje.tone}>{mensaje.texto}</Alert></div>}
      <div className="mt-3 flex justify-end">
        <Button type="button" onClick={() => void enviar()} isLoading={registrar.isPending} disabled={grado === '' || !institucion.trim()}>
          Registrar
        </Button>
      </div>
    </Card>
  );
}
