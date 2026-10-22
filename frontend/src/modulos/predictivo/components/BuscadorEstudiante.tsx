import { useEffect, useState } from 'react';
import { Alert, errorMessage } from '../../../components/ui/Alert';
import { Card } from '../../../components/ui/Card';
import { Input } from '../../../components/ui/Field';
import { Spinner } from '../../../components/ui/Spinner';
import { useBuscarEstudiantesPredictivo } from '../hooks/usePredictivo';

/**
 * Buscador del personal: el servidor busca entre los estudiantes con matrícula activa (cualquiera, no solo los propios), así que no se
 * descarga el listado entero como en un `SelectBuscable`; se pregunta al dejar de escribir.
 */
export function BuscadorEstudiante({ seleccionado, onElegir }: { seleccionado: string | null; onElegir: (id: string) => void }) {
  const [texto, setTexto] = useState('');
  const [consulta, setConsulta] = useState('');
  useEffect(() => {
    const espera = setTimeout(() => setConsulta(texto), 300);
    return () => clearTimeout(espera);
  }, [texto]);
  const { data, isFetching, isError, error } = useBuscarEstudiantesPredictivo(consulta);
  const corto = consulta.trim().length < 3;

  return (
    <Card className="space-y-3">
      <Input label="Buscar estudiante" placeholder="Nombre, apellido o documento" value={texto} onChange={(e) => setTexto(e.target.value)} autoComplete="off" />
      {corto && <p className="text-sm text-muted">Escribe al menos 3 letras.</p>}
      {isError && <Alert tone="error">{errorMessage(error)}</Alert>}
      {!corto && isFetching && (
        <div className="flex justify-center py-4">
          <Spinner />
        </div>
      )}
      {!corto && data && data.length === 0 && <p className="text-sm text-muted">Ningún estudiante con matrícula activa coincide.</p>}
      {!corto && data && data.length > 0 && (
        <ul className="divide-y divide-border">
          {data.map((e) => (
            <li key={e._id}>
              <button
                type="button"
                onClick={() => onElegir(e._id)}
                className={`w-full rounded-lg px-3 py-2 text-left transition-colors hover:bg-soft ${seleccionado === e._id ? 'bg-primary-soft' : ''}`}
              >
                <span className="block text-sm font-semibold text-ink">
                  {e.apellido}, {e.nombre}
                </span>
                <span className="block text-xs text-muted">
                  {e.numero_documento} · Grupo {e.grupo}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
