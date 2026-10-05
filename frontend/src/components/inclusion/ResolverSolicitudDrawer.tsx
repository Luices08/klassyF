import { type FormEvent, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Alert, errorMessage } from '../ui/Alert';
import { Drawer } from '../ui/Drawer';
import { Select, Textarea } from '../ui/Field';
import { NOMBRES_RESULTADO, RESULTADOS_SOLICITUD, type ResultadoSolicitud, type SolicitudApoyo, useResolverSolicitud } from '../../hooks/useInclusion';

/** Cierra la valoración con una decisión y su motivo (queda en la auditoría). Abrir un expediente lleva directo a él. */
export function ResolverSolicitudDrawer({ solicitud, onClose }: { solicitud: SolicitudApoyo | null; onClose: () => void }) {
  const navigate = useNavigate();
  const resolver = useResolverSolicitud();
  const [resultado, setResultado] = useState<ResultadoSolicitud>('ABRIR_PIAR');
  const [motivo, setMotivo] = useState('');

  const cerrar = () => {
    setMotivo('');
    resolver.reset();
    onClose();
  };

  const enviar = async (e: FormEvent) => {
    e.preventDefault();
    if (!solicitud) return;
    const resuelta = await resolver.mutateAsync({ id: solicitud._id, resultado, motivo });
    cerrar();
    if (resuelta.expediente_id) navigate(`/inclusion/expedientes/${resuelta.expediente_id}`);
  };

  return (
    <Drawer
      open={Boolean(solicitud)}
      title="Resolver solicitud"
      subtitle={solicitud ? `${solicitud.estudiante.apellido} ${solicitud.estudiante.nombre} · ${solicitud.grupo}` : ''}
      onClose={cerrar}
      onSubmit={enviar}
      submitLabel="Resolver"
      isSubmitting={resolver.isPending}
      submitDisabled={motivo.trim().length < 5}
    >
      {resolver.isError && <Alert tone="error">{errorMessage(resolver.error)}</Alert>}
      {solicitud && (
        <div className="rounded-lg bg-soft p-3 text-sm text-body">
          <p className="font-semibold text-ink">Lo declarado u observado</p>
          <p>{solicitud.motivo_declarado}</p>
          {solicitud.observacion && <p className="mt-1 text-muted">{solicitud.observacion}</p>}
          {solicitud.aporta_soporte && <p className="mt-1 text-xs text-muted">La familia indicó que aporta un soporte médico.</p>}
        </div>
      )}
      <Select label="Decisión" value={resultado} onChange={(e) => setResultado(e.target.value as ResultadoSolicitud)}>
        {RESULTADOS_SOLICITUD.map((r) => (
          <option key={r} value={r}>
            {NOMBRES_RESULTADO[r]}
          </option>
        ))}
      </Select>
      <Textarea label="Motivo de la decisión" value={motivo} onChange={(e) => setMotivo(e.target.value)} maxLength={500} />
      <Alert tone="info">El PIAR aplica a estudiantes con discapacidad. Las dificultades de aprendizaje van al plan de apoyo, y el acompañamiento psicosocial se registra en el observador de orientación.</Alert>
    </Drawer>
  );
}
