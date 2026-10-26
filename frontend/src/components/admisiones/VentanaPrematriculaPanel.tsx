import { type FormEvent, useState } from 'react';
import { Alert, errorMessage } from '../ui/Alert';
import { Chip } from '../ui/Badge';
import { Button } from '../ui/Button';
import { Card, CardHeader } from '../ui/Card';
import { Input } from '../ui/Field';
import { Spinner } from '../ui/Spinner';
import { useAuth } from '../../context/AuthContext';
import { useGuardarVentanaPrematricula, useVentanaPrematricula, type VentanaPrematricula } from '../../hooks/useAdmissionRequests';

const dia = (iso: string | null | undefined): string => (iso ? iso.slice(0, 10) : '');

function Formulario({ anioId, ventana }: { anioId: string; ventana: VentanaPrematricula | null }) {
  const puede = ['ADMIN', 'SECRETARIA'].includes(useAuth().user?.rol ?? '');
  const guardar = useGuardarVentanaPrematricula();
  const [desde, setDesde] = useState(dia(ventana?.desde));
  const [hasta, setHasta] = useState(dia(ventana?.hasta));
  const [limite, setLimite] = useState(dia(ventana?.fecha_limite_matricula));

  async function enviar(e: FormEvent) {
    e.preventDefault();
    guardar.reset();
    await guardar.mutateAsync({ anioId, desde, hasta, fecha_limite_matricula: limite || null });
  }

  return (
    <Card>
      <CardHeader
        title="Ventana de prematrícula"
        subtitle="Mientras está abierta, las solicitudes que llegan (por el sitio público o en el mostrador) apuntan a este año y se les puede reservar cupo. Fuera de ella apuntan al año en curso."
        action={ventana ? <Chip tone={ventana.abierta ? 'green' : 'neutral'}>{ventana.abierta ? 'Abierta' : 'Cerrada'}</Chip> : <Chip tone="orange">Sin configurar</Chip>}
      />
      <form onSubmit={enviar} className="space-y-4">
        {!puede && <Alert tone="info">Solo el administrador y la secretaría pueden cambiar la ventana.</Alert>}
        {guardar.isError && <Alert tone="error">{errorMessage(guardar.error)}</Alert>}
        {guardar.isSuccess && <Alert tone="success">Ventana guardada.</Alert>}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <Input label="Abre" type="date" required disabled={!puede} value={desde} onChange={(e) => setDesde(e.target.value)} />
          <Input label="Cierra (último día)" type="date" required disabled={!puede} value={hasta} onChange={(e) => setHasta(e.target.value)} />
          <Input
            label="Último día para matricular"
            type="date"
            disabled={!puede}
            value={limite}
            onChange={(e) => setLimite(e.target.value)}
            hint="Pasado ese día, el cupo reservado que no se matriculó se libera. Vacío = no vence."
          />
        </div>
        {puede && (
          <div className="flex justify-end">
            <Button type="submit" isLoading={guardar.isPending} disabled={!desde || !hasta}>
              Guardar ventana
            </Button>
          </div>
        )}
      </form>
    </Card>
  );
}

/** M04: la ventana de prematrícula de un año lectivo (una por año). */
export function VentanaPrematriculaPanel({ anioId }: { anioId: string | undefined }) {
  const ventana = useVentanaPrematricula(anioId);
  if (!anioId) return <Alert tone="warning">Aún no hay un año lectivo. Créalo en «Año lectivo».</Alert>;
  if (ventana.isLoading) return <Spinner />;
  if (ventana.isError) return <Alert tone="error">{errorMessage(ventana.error)}</Alert>;
  const v = ventana.data ?? null;
  // La clave reinicia el formulario con lo que devuelve el servidor al guardar o al cambiar de año.
  return <Formulario key={`${anioId}|${v?.desde}|${v?.hasta}|${v?.fecha_limite_matricula}`} anioId={anioId} ventana={v} />;
}
