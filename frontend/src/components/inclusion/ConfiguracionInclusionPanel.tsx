import { type FormEvent, useState } from 'react';
import { Alert, errorMessage } from '../ui/Alert';
import { Button } from '../ui/Button';
import { Card, CardHeader } from '../ui/Card';
import { Input, Textarea } from '../ui/Field';
import { Spinner } from '../ui/Spinner';
import { type ConfiguracionInclusion, useActualizarConfiguracionInclusion, useConfiguracionInclusion } from '../../hooks/useInclusion';

/** Política del colegio: plazos y textos del acta. Cambiarlos no altera lo ya emitido (lo firmado conserva su texto). */
export function ConfiguracionInclusionPanel({ puedeEditar }: { puedeEditar: boolean }) {
  const configuracion = useConfiguracionInclusion();
  if (configuracion.isLoading) return <Spinner />;
  if (configuracion.isError) return <Alert tone="error">{errorMessage(configuracion.error)}</Alert>;
  if (!configuracion.data) return null;
  return <Formulario inicial={configuracion.data} puedeEditar={puedeEditar} />;
}

function Formulario({ inicial, puedeEditar }: { inicial: ConfiguracionInclusion; puedeEditar: boolean }) {
  const actualizar = useActualizarConfiguracionInclusion();
  const [form, setForm] = useState({
    plazo_elaboracion_dias: String(inicial.plazo_elaboracion_dias),
    seguimientos_minimos_anio: String(inicial.seguimientos_minimos_anio),
    retencion_anios: inicial.retencion_anios ? String(inicial.retencion_anios) : '',
    declaracion_establecimiento: inicial.declaracion_establecimiento,
    declaracion_familia: inicial.declaracion_familia,
  });

  const guardar = async (e: FormEvent) => {
    e.preventDefault();
    await actualizar.mutateAsync({
      plazo_elaboracion_dias: Number(form.plazo_elaboracion_dias),
      seguimientos_minimos_anio: Number(form.seguimientos_minimos_anio),
      retencion_anios: form.retencion_anios ? Number(form.retencion_anios) : null,
      declaracion_establecimiento: form.declaracion_establecimiento,
      declaracion_familia: form.declaracion_familia,
    });
  };

  return (
    <Card>
      <CardHeader title="Configuración de inclusión" subtitle="Reglas del colegio; nada de esto está fijo en el sistema." />
      <form onSubmit={guardar} className="space-y-4">
        {actualizar.isError && <Alert tone="error">{errorMessage(actualizar.error)}</Alert>}
        {actualizar.isSuccess && <Alert tone="success">Configuración guardada.</Alert>}
        <div className="grid gap-4 sm:grid-cols-3">
          <Input label="Plazo para elaborar el PIAR (días)" type="number" min={1} max={365} disabled={!puedeEditar} value={form.plazo_elaboracion_dias} onChange={(e) => setForm((f) => ({ ...f, plazo_elaboracion_dias: e.target.value }))} hint="La norma habla del primer trimestre; el colegio fija los días. Solo alerta." />
          <Input label="Seguimientos mínimos por año" type="number" min={1} max={12} disabled={!puedeEditar} value={form.seguimientos_minimos_anio} onChange={(e) => setForm((f) => ({ ...f, seguimientos_minimos_anio: e.target.value }))} hint="El formato pide mínimo 3, según el SIEE." />
          <Input label="Años de conservación" type="number" min={1} max={100} disabled={!puedeEditar} value={form.retencion_anios} onChange={(e) => setForm((f) => ({ ...f, retencion_anios: e.target.value }))} hint="Vacío = aún sin definir (no se borra nada)." />
        </div>
        <Textarea label="Declaración del establecimiento (acta de acuerdo)" disabled={!puedeEditar} value={form.declaracion_establecimiento} onChange={(e) => setForm((f) => ({ ...f, declaracion_establecimiento: e.target.value }))} />
        <Textarea label="Declaración de la familia (acta de acuerdo)" disabled={!puedeEditar} value={form.declaracion_familia} onChange={(e) => setForm((f) => ({ ...f, declaracion_familia: e.target.value }))} />
        {puedeEditar && (
          <div className="flex justify-end">
            <Button type="submit" isLoading={actualizar.isPending}>
              Guardar
            </Button>
          </div>
        )}
      </form>
    </Card>
  );
}
