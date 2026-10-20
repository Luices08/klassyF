import { useEffect, useState } from 'react';
import {
  NOMBRES_VERIFICACION,
  descargarSoporteServicioSocial,
  useAnularServicioSocial,
  useRegistrarServicioSocial,
  useServicioSocial,
  useVerificarServicioSocial,
  type TandaServicioSocial,
  type VerificacionServicioSocial,
} from '../../hooks/useTitulacion';
import { formatoFechaCalendario } from '../../lib/fechas';
import { Alert, errorMessage } from '../ui/Alert';
import { Chip } from '../ui/Badge';
import { Button } from '../ui/Button';
import { Card, CardHeader } from '../ui/Card';
import { Dropzone } from '../ui/Dropzone';
import { Input } from '../ui/Field';
import { Spinner } from '../ui/Spinner';
import { VisorDocumento } from '../ui/VisorDocumento';

const MAX_BYTES_SOPORTE = 5 * 1024 * 1024;

const TONO_VERIFICACION: Record<VerificacionServicioSocial, 'orange' | 'green' | 'red' | 'neutral'> = {
  PENDIENTE: 'orange',
  VERIFICADO: 'green',
  RECHAZADO: 'red',
  HEREDADO: 'neutral',
};

/**
 * Las horas de servicio social del estudiante (10° y 11°): cada tanda lleva el certificado de la entidad y solo suma cuando alguien verifica el
 * soporte. Registran ADMIN y Secretaría; también verifican coordinación. Los registros anteriores al soporte («anterior al soporte») siguen sumando.
 */
export function ServicioSocialPanel({ studentId, puedeRegistrar }: { studentId: string; puedeRegistrar: boolean }) {
  const tandas = useServicioSocial(studentId);
  const registrar = useRegistrarServicioSocial();
  const verificar = useVerificarServicioSocial();
  const anular = useAnularServicioSocial();

  const [horas, setHoras] = useState('');
  const [entidad, setEntidad] = useState('');
  const [descripcion, setDescripcion] = useState('');
  const [archivo, setArchivo] = useState<File | null>(null);
  const [mensaje, setMensaje] = useState<{ tone: 'success' | 'error'; texto: string } | null>(null);
  // Rechazar o anular piden explicación: un solo campo atado a la tanda sobre la que se actúa.
  const [explicando, setExplicando] = useState<{ id: string; accion: 'RECHAZAR' | 'ANULAR' } | null>(null);
  const [motivo, setMotivo] = useState('');
  const [visor, setVisor] = useState<{ url: string; nombre: string } | null>(null);
  const [abriendo, setAbriendo] = useState<string | null>(null);

  // Cada PDF es un blob en memoria: se libera al reemplazarlo o al salir.
  useEffect(() => {
    const url = visor?.url;
    return () => {
      if (url) URL.revokeObjectURL(url);
    };
  }, [visor?.url]);

  async function enviar() {
    if (!archivo) return;
    setMensaje(null);
    try {
      await registrar.mutateAsync({ student_id: studentId, horas: Number(horas), entidad, descripcion: descripcion || undefined, archivo });
      setHoras('');
      setEntidad('');
      setDescripcion('');
      setArchivo(null);
      setMensaje({ tone: 'success', texto: 'Horas registradas. Suman cuando se verifique el soporte.' });
    } catch (err) {
      setMensaje({ tone: 'error', texto: errorMessage(err) });
    }
  }

  async function verSoporte(t: TandaServicioSocial) {
    setAbriendo(t._id);
    setMensaje(null);
    try {
      const { url } = await descargarSoporteServicioSocial(t._id);
      setVisor({ url, nombre: t.soporte_nombre ?? 'soporte' });
    } catch (err) {
      setMensaje({ tone: 'error', texto: errorMessage(err) });
    } finally {
      setAbriendo(null);
    }
  }

  async function resolver(t: TandaServicioSocial, accion: 'VERIFICAR' | 'RECHAZAR') {
    setMensaje(null);
    try {
      await verificar.mutateAsync({ id: t._id, decision: accion, motivo: accion === 'RECHAZAR' ? motivo : '' });
      setExplicando(null);
      setMotivo('');
    } catch (err) {
      setMensaje({ tone: 'error', texto: errorMessage(err) });
    }
  }

  async function anularTanda(t: TandaServicioSocial) {
    setMensaje(null);
    try {
      await anular.mutateAsync({ id: t._id, motivo });
      setExplicando(null);
      setMotivo('');
    } catch (err) {
      setMensaje({ tone: 'error', texto: errorMessage(err) });
    }
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader title="Horas de servicio social" subtitle="Cada tanda lleva el certificado de la entidad. Solo suman las horas con soporte verificado." />
        {tandas.isLoading && <Spinner />}
        {tandas.isError && <Alert tone="error">{errorMessage(tandas.error)}</Alert>}
        {tandas.data && tandas.data.length === 0 && <p className="text-sm text-muted">Aún no hay horas registradas.</p>}
        <ul className="divide-y divide-border">
          {(tandas.data ?? []).map((t) => (
            <li key={t._id} className="space-y-2 py-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <p className="text-sm font-semibold text-ink">
                    {t.horas} h · {t.entidad}
                  </p>
                  <p className="text-xs text-muted">
                    {t.fecha_inicio ? `${formatoFechaCalendario(t.fecha_inicio)}${t.fecha_fin ? ` – ${formatoFechaCalendario(t.fecha_fin)}` : ''}` : 'Sin fechas'}
                    {t.descripcion ? ` · ${t.descripcion}` : ''}
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-1.5">
                  {t.estado === 'ANULADO' ? <Chip tone="neutral">Anulado</Chip> : <Chip tone={TONO_VERIFICACION[t.verificacion]}>{NOMBRES_VERIFICACION[t.verificacion]}</Chip>}
                  {t.cuenta && <Chip tone="green">Suma</Chip>}
                </div>
              </div>
              {t.motivo_rechazo && <p className="text-xs text-danger">Motivo del rechazo: {t.motivo_rechazo}</p>}

              {t.estado === 'VIGENTE' && (
                <div className="flex flex-wrap gap-2">
                  {t.tiene_soporte && (
                    <Button type="button" variant="outline" className="px-3 py-1 text-xs" isLoading={abriendo === t._id} onClick={() => void verSoporte(t)}>
                      Ver soporte
                    </Button>
                  )}
                  {t.verificacion === 'PENDIENTE' && (
                    <>
                      <Button type="button" variant="soft-success" className="px-3 py-1 text-xs" isLoading={verificar.isPending && explicando === null} onClick={() => void resolver(t, 'VERIFICAR')}>
                        Verificar soporte
                      </Button>
                      <Button type="button" variant="soft-danger" className="px-3 py-1 text-xs" onClick={() => setExplicando({ id: t._id, accion: 'RECHAZAR' })}>
                        Rechazar
                      </Button>
                    </>
                  )}
                  {puedeRegistrar && (
                    <Button type="button" variant="secondary" className="px-3 py-1 text-xs" onClick={() => setExplicando({ id: t._id, accion: 'ANULAR' })}>
                      Anular
                    </Button>
                  )}
                </div>
              )}

              {explicando?.id === t._id && (
                <div className="grid gap-2 sm:grid-cols-[1fr_auto] sm:items-end">
                  <Input label={explicando.accion === 'RECHAZAR' ? 'Por qué se rechaza el soporte' : 'Por qué se anula la tanda'} value={motivo} maxLength={500} onChange={(e) => setMotivo(e.target.value)} />
                  <div className="flex gap-2">
                    <Button type="button" variant="secondary" onClick={() => setExplicando(null)}>
                      Cancelar
                    </Button>
                    <Button
                      type="button"
                      variant="soft-danger"
                      disabled={motivo.trim().length < 5}
                      isLoading={verificar.isPending || anular.isPending}
                      onClick={() => void (explicando.accion === 'RECHAZAR' ? resolver(t, 'RECHAZAR') : anularTanda(t))}
                    >
                      {explicando.accion === 'RECHAZAR' ? 'Rechazar soporte' : 'Anular tanda'}
                    </Button>
                  </div>
                </div>
              )}
            </li>
          ))}
        </ul>
      </Card>

      {visor && (
        <Card>
          <VisorDocumento url={visor.url} titulo={`Soporte: ${visor.nombre}`} nombreArchivo={visor.nombre} />
        </Card>
      )}

      {mensaje && <Alert tone={mensaje.tone}>{mensaje.texto}</Alert>}

      {puedeRegistrar && (
        <Card>
          <CardHeader title="Registrar horas" subtitle="El estudiante debe estar o haber estado en 10° u 11°. El certificado de la entidad es obligatorio." />
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <Input label="Horas" type="number" step="0.5" min={0.5} value={horas} onChange={(e) => setHoras(e.target.value)} />
            <Input label="Entidad" value={entidad} maxLength={160} onChange={(e) => setEntidad(e.target.value)} />
            <Input label="Descripción (opcional)" value={descripcion} maxLength={500} onChange={(e) => setDescripcion(e.target.value)} />
          </div>
          <div className="mt-3">
            <Dropzone extensiones={['.pdf', '.jpg', '.jpeg', '.png', '.webp']} maxBytes={MAX_BYTES_SOPORTE} file={archivo} onFile={setArchivo} hint="Certificado de la entidad: PDF, JPG, PNG o WEBP, hasta 5 MB." etiqueta="Soporte del servicio social" />
          </div>
          <div className="mt-3 flex justify-end">
            <Button type="button" onClick={() => void enviar()} isLoading={registrar.isPending} disabled={!horas || !entidad.trim() || !archivo}>
              Registrar
            </Button>
          </div>
        </Card>
      )}
    </div>
  );
}
