import { useState } from 'react';
import { MallaHorario } from '../components/horarios/MallaHorario';
import { Alert, errorMessage } from '../components/ui/Alert';
import { Button } from '../components/ui/Button';
import { Card, CardHeader } from '../components/ui/Card';
import { PageHeader } from '../components/ui/PageHeader';
import { Spinner } from '../components/ui/Spinner';
import { FileTextIcon } from '../components/ui/icons';
import { descargarPdfHorario, useMiHorario } from '../hooks/useHorarios';
import type { MiHorario } from '../types/horarios';

const SIN_CONFLICTOS = new Set<string>();

/** M09: el horario publicado de quien consulta. Al docente, sus clases; al estudiante, su grupo; al acudiente, el de cada estudiante a cargo. */
export function MiHorarioPage() {
  const query = useMiHorario();
  const horarios = query.data ?? [];

  return (
    <div className="space-y-4">
      <PageHeader title="Mi horario" subtitle="El horario publicado por la institución para este año lectivo." />
      {query.isLoading && <Spinner />}
      {query.isError && <Alert tone="error">{errorMessage(query.error)}</Alert>}
      {query.data && horarios.length === 0 && (
        <Alert tone="info">Aún no hay un horario publicado para ti. Cuando coordinación lo publique, aparecerá aquí.</Alert>
      )}
      {horarios.map((h) => (
        <TarjetaHorario key={`${h.horario._id}-${h.entidad_id}`} horario={h} />
      ))}
    </div>
  );
}

function TarjetaHorario({ horario: h }: { horario: MiHorario }) {
  const [descargando, setDescargando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function descargar() {
    setError(null);
    setDescargando(true);
    try {
      await descargarPdfHorario(h.horario._id, h.vista, h.entidad_id, `Horario - ${h.titulo}.pdf`);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setDescargando(false);
    }
  }

  return (
    <Card>
      <CardHeader
        title={h.titulo}
        subtitle={h.horario.publicado_en ? `Publicado el ${new Date(h.horario.publicado_en).toLocaleDateString('es-CO', { dateStyle: 'long' })}` : undefined}
        action={
          <Button variant="outline" isLoading={descargando} disabled={descargando} onClick={() => void descargar()}>
            <FileTextIcon className="h-4 w-4" />
            Descargar PDF
          </Button>
        }
      />
      {error && <Alert tone="error">{error}</Alert>}
      <MallaHorario estructura={h.estructura} sesiones={h.horario.sesiones} catalogo={h.catalogo} vista={h.vista} entidadId={h.entidad_id} enConflicto={SIN_CONFLICTOS} />
    </Card>
  );
}
