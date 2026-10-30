import { Alert, errorMessage } from '../ui/Alert';
import { Chip } from '../ui/Badge';
import { Button } from '../ui/Button';
import { Card, CardHeader } from '../ui/Card';
import { useContinuidadDelHijo, useResponderContinuidadDelHijo } from '../../hooks/useContinuidad';

/**
 * Continuidad (M04): la familia registra si su hijo piensa seguir el año siguiente. La respuesta se usa en el rollover, pero no crea ni reserva cupo o
 * matrícula. La matrícula definitiva se asienta cuando secretaría ejecuta el rollover.
 */
export function PortalRenovacion({ studentId }: { studentId: string }) {
  const { data } = useContinuidadDelHijo(studentId);
  const responder = useResponderContinuidadDelHijo(studentId);
  if (!data?.anio_destino || (!data.puede_responder && data.decision === 'SIN_RESPUESTA')) return null;
  const anio = data.anio_destino.year;

  return (
    <Card>
      <CardHeader
        title={`Renovación de matrícula ${anio}`}
        subtitle={data.grado_proyectado ? `Si continúa, pasaría a ${data.grado_proyectado} (sujeto al resultado final del año).` : 'Cursa el último grado: lo que sigue es su titulación.'}
        action={
          data.decision === 'SIN_RESPUESTA' ? (
            <Chip tone="orange">Falta tu respuesta</Chip>
          ) : (
            <Chip tone={data.decision === 'CONTINUA' ? 'green' : 'red'}>{data.decision === 'CONTINUA' ? 'Continúa' : 'No continúa'}</Chip>
          )
        }
      />
      {responder.isError && <Alert tone="error">{errorMessage(responder.error)}</Alert>}
      {data.puede_responder ? (
        <div className="flex flex-wrap items-center gap-2">
          <p className="mr-2 text-sm text-body">¿Su hijo o hija continúa en el colegio en {anio}?</p>
          {data.grado_proyectado && (
            <Button disabled={responder.isPending || data.decision === 'CONTINUA'} onClick={() => responder.mutate({ decision: 'CONTINUA' })}>
              Sí, continúa
            </Button>
          )}
          <Button variant="outline" disabled={responder.isPending || data.decision === 'NO_CONTINUA'} onClick={() => responder.mutate({ decision: 'NO_CONTINUA' })}>
            No continúa
          </Button>
          <p className="basis-full text-xs text-muted">La respuesta no reserva un cupo ni crea una matrícula. Puedes cambiarla hasta que se registre la matrícula del año siguiente.</p>
        </div>
      ) : (
        <p className="text-sm text-body">Ya tiene su matrícula del {anio} en proceso: tu respuesta quedó registrada.</p>
      )}
    </Card>
  );
}
