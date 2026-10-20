import { useState } from 'react';
import {
  NOMBRES_ESTADO_TITULACION,
  NOMBRES_REQUISITO,
  useReevaluarTitulacion,
  useRegistrarSaber11,
  useRequisitosEstudiante,
} from '../../hooks/useTitulacion';
import { Alert, errorMessage } from '../ui/Alert';
import { Chip } from '../ui/Badge';
import { Button } from '../ui/Button';
import { Card, CardHeader } from '../ui/Card';
import { Drawer } from '../ui/Drawer';
import { Input } from '../ui/Field';
import { Spinner } from '../ui/Spinner';
import { ServicioSocialPanel } from './ServicioSocialPanel';
import { TONO_ESTADO_TITULACION } from './tonosTitulacion';

/** Saber 11: «AC» y de 8 a 12 dígitos (AC23245678 o AC202612345678). Espeja el servidor, que lo vuelve a comprobar. */
const PATRON_SABER_11 = /^AC\d{8,12}$/;
const normalizarSaber11 = (texto: string): string => texto.replace(/[\s.-]+/g, '').toUpperCase();
const GRADO_TITULACION = 11;

/**
 * Lo que Secretaría necesita ver de un estudiante antes de graduarlo: lo registrado, lo que falta y los avisos (p. ej. servicio social desde 10°).
 * Cada registro reevalúa su titulación solo. Registran ADMIN y Secretaría; coordinación solo consulta.
 */
export function RequisitosDrawer({ studentId, anioId, nombre, puedeRegistrar, onClose }: { studentId: string; anioId: string; nombre: string; puedeRegistrar: boolean; onClose: () => void }) {
  const { data, isLoading, isError, error } = useRequisitosEstudiante(studentId);
  const reevaluar = useReevaluarTitulacion();
  const [mensaje, setMensaje] = useState<{ tone: 'success' | 'error'; texto: string } | null>(null);
  // La titulación es de 11°: en 10° solo se registra el servicio social (Saber 11 se presenta en 11°).
  const soloServicioSocial = data?.grado_numero != null && data.grado_numero < GRADO_TITULACION;

  return (
    <Drawer open title={soloServicioSocial ? 'Servicio social' : 'Requisitos de titulación'} subtitle={nombre} onClose={onClose} size="lg">
      {isLoading && <Spinner />}
      {isError && <Alert tone="error">{errorMessage(error)}</Alert>}
      {mensaje && <Alert tone={mensaje.tone}>{mensaje.texto}</Alert>}
      {data && soloServicioSocial && (
        <>
          <Alert tone="info">Este estudiante está en {data.grado_numero}°. El servicio social se presta en 10° y 11°: aquí solo se registran sus horas con el certificado de la entidad. Saber 11 y el resto de requisitos son de 11°.</Alert>
          <Card>
            <CardHeader title="Estado del servicio social" />
            <p className="text-sm">
              <strong>{data.horas_requeridas === null ? 'No se exige' : `${data.horas_servicio_social} de ${data.horas_requeridas} horas`}</strong>
              {data.horas_por_verificar > 0 ? ` (${data.horas_por_verificar} por verificar)` : ''}
            </p>
          </Card>
          <ServicioSocialPanel studentId={studentId} puedeRegistrar={puedeRegistrar} />
        </>
      )}
      {data && !soloServicioSocial && (
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
                <strong>{data.horas_requeridas === null ? 'No se exige' : `${data.horas_servicio_social} de ${data.horas_requeridas} horas`}{data.horas_por_verificar > 0 ? ` (${data.horas_por_verificar} por verificar)` : ''}</strong>
              </li>
              <li className="flex justify-between">
                <span>Saber 11</span>
                <strong>{data.saber_11 ? `Registro ${data.saber_11.codigo_registro}` : 'Sin registrar'}</strong>
              </li>
              <li className="flex justify-between">
                <span>Paz y salvo</span>
                <strong>{data.paz_y_salvo_confirmado ? 'Confirmado' : 'Sin confirmar'}</strong>
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

          {data.documentos_matricula_pendientes.length > 0 && (
            <Card>
              <CardHeader title="Documentos de la matrícula que faltan" subtitle="Solo informa: no bloquea la titulación. Se aprueban en la matrícula del estudiante (Matrículas → su expediente)." />
              <ul className="list-disc space-y-1 pl-5 text-sm text-body">
                {data.documentos_matricula_pendientes.map((d) => (
                  <li key={d.nombre}>
                    {d.nombre} <span className="text-xs text-muted">({d.estado === 'CARGADO' ? 'cargado, por revisar' : d.estado === 'RECHAZADO' ? 'rechazado' : 'sin cargar'})</span>
                  </li>
                ))}
              </ul>
            </Card>
          )}

          <ServicioSocialPanel studentId={studentId} puedeRegistrar={puedeRegistrar} />

          {puedeRegistrar && (
            <>
              <Saber11 studentId={studentId} actual={data.saber_11?.codigo_registro} />
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

function Saber11({ studentId, actual }: { studentId: string; actual?: string }) {
  const registrar = useRegistrarSaber11();
  const [codigo, setCodigo] = useState(actual ?? '');
  const [fecha, setFecha] = useState('');
  const [mensaje, setMensaje] = useState<{ tone: 'success' | 'error'; texto: string } | null>(null);
  const valido = PATRON_SABER_11.test(normalizarSaber11(codigo));

  async function enviar() {
    setMensaje(null);
    try {
      await registrar.mutateAsync({ student_id: studentId, codigo_registro: normalizarSaber11(codigo), fecha_presentacion: fecha || null });
      setMensaje({ tone: 'success', texto: 'Registro guardado.' });
    } catch (err) {
      setMensaje({ tone: 'error', texto: errorMessage(err) });
    }
  }

  return (
    <Card>
      <CardHeader title="Saber 11" subtitle="Solo el código de registro y la fecha; nunca los puntajes." />
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Input
          label="Número de registro (SNP)"
          value={codigo}
          maxLength={40}
          placeholder="AC23245678"
          hint="Empieza por AC y lleva de 8 a 12 dígitos. Se aceptan espacios o guiones."
          error={codigo.trim() !== '' && !valido ? 'El número debe ser AC seguido de 8 a 12 dígitos (por ejemplo AC23245678).' : undefined}
          onChange={(e) => setCodigo(e.target.value.toUpperCase())}
        />
        <Input label="Fecha de presentación (opcional)" type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} />
      </div>
      {mensaje && <div className="mt-3"><Alert tone={mensaje.tone}>{mensaje.texto}</Alert></div>}
      <div className="mt-3 flex justify-end">
        <Button type="button" onClick={() => void enviar()} isLoading={registrar.isPending} disabled={!valido}>
          Guardar
        </Button>
      </div>
    </Card>
  );
}
