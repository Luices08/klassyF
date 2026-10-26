import { type FormEvent, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Alert, errorMessage } from '../ui/Alert';
import { Drawer } from '../ui/Drawer';
import { Select, Textarea } from '../ui/Field';
import { NOMBRES_RESULTADO, RESULTADOS_SOLICITUD, type ResultadoSolicitud, type SolicitudApoyo, useResolverSolicitud } from '../../hooks/useInclusion';
import { SelectorCondicion } from './SelectorCondicion';

/**
 * Cierra la valoración con una decisión y su motivo (queda en la auditoría). Al abrir un expediente se puede elegir la condición del catálogo:
 * y solo se ofrecen las del tipo que se abre (cada una declara si es PIAR o plan de apoyo). Abrir un expediente lleva directo a él.
 */
export function ResolverSolicitudDrawer({ solicitud, onClose }: { solicitud: SolicitudApoyo | null; onClose: () => void }) {
  const navigate = useNavigate();
  const resolver = useResolverSolicitud();
  const [resultado, setResultado] = useState<ResultadoSolicitud>('ABRIR_PIAR');
  const [motivo, setMotivo] = useState('');
  const [condicion, setCondicion] = useState('');
  const abreExpediente = resultado === 'ABRIR_PIAR' || resultado === 'PLAN_APOYO';

  const cerrar = () => {
    setMotivo('');
    setCondicion('');
    resolver.reset();
    onClose();
  };

  const enviar = async (e: FormEvent) => {
    e.preventDefault();
    if (!solicitud) return;
    const resuelta = await resolver.mutateAsync({ id: solicitud._id, resultado, motivo, condicion_codigo: abreExpediente && condicion ? condicion : undefined });
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
      <Select
        label="Decisión"
        value={resultado}
        onChange={(e) => {
          setResultado(e.target.value as ResultadoSolicitud);
          setCondicion('');
        }}
      >
        {RESULTADOS_SOLICITUD.map((r) => (
          <option key={r} value={r}>
            {NOMBRES_RESULTADO[r]}
          </option>
        ))}
      </Select>
      {abreExpediente && (
        <SelectorCondicion
          label="Condición"
          tipo={resultado === 'ABRIR_PIAR' ? 'PIAR' : 'PLAN_APOYO'}
          vacioLabel={resultado === 'ABRIR_PIAR' ? 'Por confirmar' : 'Sin definir aún'}
          value={condicion}
          onChange={(codigo) => setCondicion(codigo)}
          hint="Del catálogo del colegio. Se puede completar o cambiar después en el expediente."
        />
      )}
      <Textarea label="Motivo de la decisión" value={motivo} onChange={(e) => setMotivo(e.target.value)} maxLength={500} />
      <Alert tone="info">El PIAR aplica a estudiantes con discapacidad. Las dificultades de aprendizaje van al plan de apoyo, y el acompañamiento psicosocial se registra en el observador de orientación.</Alert>
    </Drawer>
  );
}
