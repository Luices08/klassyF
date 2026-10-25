import { useEffect, useState } from 'react';
import { Alert, errorMessage } from '../ui/Alert';
import { Button } from '../ui/Button';
import { Card, CardHeader } from '../ui/Card';
import { Input } from '../ui/Field';
import { Spinner } from '../ui/Spinner';
import { Switch } from '../ui/Switch';
import { type ConfiguracionRematricula, NOMBRES_CRITERIO, useActualizarConfiguracionRematricula, useConfiguracionRematricula } from '../../hooks/useRematricula';

/**
 * Reglas del SIEE para repartir cupos cuando faltan: el orden de los criterios de prioridad (el primero pesa más) y cuánta diferencia de
 * ocupación se tolera entre grupos paralelos al balancearlos. Todos las ven; solo el administrador las cambia.
 */
export function ReglasRematriculaPanel({ puedeEditar }: { puedeEditar: boolean }) {
  const { data, isLoading, isError, error } = useConfiguracionRematricula();
  const guardar = useActualizarConfiguracionRematricula();
  const [borrador, setBorrador] = useState<ConfiguracionRematricula | null>(null);
  const [mensaje, setMensaje] = useState<{ tone: 'success' | 'error'; texto: string } | null>(null);

  useEffect(() => {
    if (data) setBorrador(structuredClone(data));
  }, [data]);

  if (isLoading || !borrador) return isError ? <Alert tone="error">{errorMessage(error)}</Alert> : <Spinner />;

  const mover = (indice: number, delta: -1 | 1) => {
    const lista = [...borrador.criterios_desempate];
    const destino = indice + delta;
    if (destino < 0 || destino >= lista.length) return;
    [lista[indice], lista[destino]] = [lista[destino]!, lista[indice]!];
    setBorrador({ ...borrador, criterios_desempate: lista });
  };

  async function enviar() {
    setMensaje(null);
    try {
      await guardar.mutateAsync(borrador as ConfiguracionRematricula);
      setMensaje({ tone: 'success', texto: 'Reglas guardadas. Las pre-matrículas ya creadas no se recalculan.' });
    } catch (e) {
      setMensaje({ tone: 'error', texto: errorMessage(e) });
    }
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader title="Prioridad cuando faltan cupos" />
        <p className="mb-3 text-sm text-muted">
          Si los promovidos superan los cupos del grado siguiente, el proceso no se detiene: se aplica este orden y quien no alcanza queda en la lista de espera para asignación directiva.
        </p>
        <ol className="space-y-3">
          {borrador.criterios_desempate.map((c, i) => (
            <li key={c.criterio} className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border p-3">
              <div className="min-w-0 flex-1">
                <Switch
                  label={`${i + 1}. ${NOMBRES_CRITERIO[c.criterio].nombre}`}
                  description={NOMBRES_CRITERIO[c.criterio].descripcion}
                  checked={c.activo}
                  disabled={!puedeEditar}
                  onChange={(activo) => setBorrador({ ...borrador, criterios_desempate: borrador.criterios_desempate.map((x) => (x.criterio === c.criterio ? { ...x, activo } : x)) })}
                />
              </div>
              {puedeEditar && (
                <div className="flex gap-2">
                  <Button type="button" variant="outline" onClick={() => mover(i, -1)} disabled={i === 0}>
                    Subir
                  </Button>
                  <Button type="button" variant="outline" onClick={() => mover(i, 1)} disabled={i === borrador.criterios_desempate.length - 1}>
                    Bajar
                  </Button>
                </div>
              )}
            </li>
          ))}
        </ol>
      </Card>

      <Card>
        <CardHeader title="Balance entre grupos paralelos" />
        <p className="mb-3 text-sm text-muted">
          No se pasa a todo un grupo al mismo salón del grado siguiente: se reparte entre los paralelos, equilibrando los repitentes, los estudiantes con ajustes de inclusión y las edades.
          La tolerancia dice cuánto más llenos pueden quedar unos salones que otros antes de privilegiar ese equilibrio.
        </p>
        <div className="max-w-xs">
          <Input
            label="Tolerancia de ocupación (puntos porcentuales)"
            type="number"
            min={0}
            max={50}
            value={borrador.tolerancia_ocupacion_pct}
            disabled={!puedeEditar}
            onChange={(e) => setBorrador({ ...borrador, tolerancia_ocupacion_pct: Number(e.target.value) })}
          />
        </div>
      </Card>

      {mensaje && <Alert tone={mensaje.tone}>{mensaje.texto}</Alert>}
      {puedeEditar ? (
        <div className="flex justify-end">
          <Button onClick={() => void enviar()} isLoading={guardar.isPending}>
            Guardar reglas
          </Button>
        </div>
      ) : (
        <Alert tone="info">Solo el administrador cambia estas reglas.</Alert>
      )}
    </div>
  );
}
