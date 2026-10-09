import { type FormEvent, useState } from 'react';
import { Alert, errorMessage } from '../ui/Alert';
import { Button } from '../ui/Button';
import { Card, CardHeader } from '../ui/Card';
import { Input } from '../ui/Field';
import { Spinner } from '../ui/Spinner';
import { type ConfiguracionActividades, useActualizarConfiguracionActividades, useConfiguracionActividades } from '../../hooks/useActividades';

/** Política de carga del colegio: cuántas evaluaciones y actividades por día se toleran antes de advertir al docente. */
export function ConfiguracionActividadesCard({ puedeEditar }: { puedeEditar: boolean }) {
  const { data, isLoading, isError, error } = useConfiguracionActividades();
  if (isLoading) return <Spinner />;
  if (isError || !data) return <Alert tone="error">{errorMessage(error)}</Alert>;
  return <Formulario key={`${data.max_evaluaciones_por_dia}-${data.max_entregas_por_dia}`} configuracion={data} puedeEditar={puedeEditar} />;
}

function Formulario({ configuracion, puedeEditar }: { configuracion: ConfiguracionActividades; puedeEditar: boolean }) {
  const actualizar = useActualizarConfiguracionActividades();
  const [evaluaciones, setEvaluaciones] = useState(String(configuracion.max_evaluaciones_por_dia));
  const [actividades, setActividades] = useState(String(configuracion.max_entregas_por_dia));
  const [mensaje, setMensaje] = useState<{ tone: 'success' | 'error'; texto: string } | null>(null);

  async function guardar(e: FormEvent) {
    e.preventDefault();
    setMensaje(null);
    try {
      await actualizar.mutateAsync({ max_evaluaciones_por_dia: Number(evaluaciones), max_entregas_por_dia: Number(actividades) });
      setMensaje({ tone: 'success', texto: 'Política de carga actualizada.' });
    } catch (error) {
      setMensaje({ tone: 'error', texto: errorMessage(error) });
    }
  }

  return (
    <Card>
      <CardHeader
        title="Prevención de sobrecarga"
        subtitle="Al programar, el docente recibe una advertencia si un grupo supera estos límites en un mismo día. 0 = sin límite."
      />
      <form onSubmit={(e) => void guardar(e)} className="grid grid-cols-1 items-end gap-4 sm:grid-cols-[1fr_1fr_auto]">
        <Input
          label="Evaluaciones por día y grupo"
          type="number"
          min={0}
          max={20}
          value={evaluaciones}
          disabled={!puedeEditar}
          onChange={(e) => setEvaluaciones(e.target.value)}
        />
        <Input
          label="Actividades de cualquier tipo por día y grupo"
          type="number"
          min={0}
          max={50}
          value={actividades}
          disabled={!puedeEditar}
          onChange={(e) => setActividades(e.target.value)}
        />
        {puedeEditar && (
          <Button type="submit" isLoading={actualizar.isPending}>
            Guardar
          </Button>
        )}
      </form>
      {mensaje && (
        <div className="mt-3">
          <Alert tone={mensaje.tone}>{mensaje.texto}</Alert>
        </div>
      )}
    </Card>
  );
}
