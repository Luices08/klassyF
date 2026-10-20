import { useMemo, useState } from 'react';
import {
  MIN_CARACTERES_DESCRIPTOR,
  NOMBRES_NIVEL_VALORACION,
  useGuardarValoraciones,
  usePlanillaDescriptiva,
  type NivelValoracion,
  type ValoracionDescriptiva,
} from '../../hooks/useValoracionesDescriptivas';
import { Alert, errorMessage } from '../ui/Alert';
import { Button } from '../ui/Button';
import { Card, CardHeader } from '../ui/Card';
import { Select, Textarea } from '../ui/Field';
import { Spinner } from '../ui/Spinner';

type Borrador = { nivel: NivelValoracion | ''; fortalezas: string; recomendaciones: string };

const vacio: Borrador = { nivel: '', fortalezas: '', recomendaciones: '' };
const completo = (b: Borrador): b is ValoracionDescriptiva =>
  b.nivel !== '' && b.fortalezas.trim().length >= MIN_CARACTERES_DESCRIPTOR && b.recomendaciones.trim().length >= MIN_CARACTERES_DESCRIPTOR;

/**
 * Preescolar no tiene notas numéricas ni promedios (Decreto 2247 de 1997): el docente valora a cada niño con un nivel de avance (iniciado, en
 * proceso o alcanzado) y escribe sus fortalezas y recomendaciones. Los dos textos son obligatorios.
 */
export function PlanillaDescriptiva({ asignacionId, periodo }: { asignacionId: string; periodo: number }) {
  const consulta = usePlanillaDescriptiva(asignacionId, periodo);
  const guardar = useGuardarValoraciones();
  const [cambios, setCambios] = useState<Record<string, Borrador>>({});
  const [mensaje, setMensaje] = useState<{ tono: 'success' | 'error'; texto: string } | null>(null);

  const planilla = consulta.data;
  const valorDe = (id: string, original: ValoracionDescriptiva | null): Borrador => cambios[id] ?? (original ? { ...original } : vacio);
  const tocadas = useMemo(() => Object.keys(cambios), [cambios]);
  const incompletas = tocadas.filter((id) => !completo(cambios[id] as Borrador));

  const cambiar = (id: string, original: ValoracionDescriptiva | null, parcial: Partial<Borrador>) => {
    setMensaje(null);
    setCambios((c) => ({ ...c, [id]: { ...valorDe(id, original), ...parcial } }));
  };

  const guardarTodo = async () => {
    if (!planilla) return;
    setMensaje(null);
    try {
      const valoraciones = tocadas.map((id) => ({ student_id: id, ...(cambios[id] as ValoracionDescriptiva) }));
      const r = await guardar.mutateAsync({ teacher_assignment_id: asignacionId, periodo_numero: periodo, valoraciones });
      setCambios({});
      setMensaje({ tono: 'success', texto: `Se guardaron ${r.guardadas} valoraciones.` });
    } catch (err) {
      setMensaje({ tono: 'error', texto: errorMessage(err) });
    }
  };

  if (consulta.isLoading) return <Spinner />;
  if (consulta.isError) return <Alert tone="error">{errorMessage(consulta.error)}</Alert>;
  if (!planilla) return null;

  return (
    <div className="space-y-4">
      <Alert tone="info">
        Preescolar se evalúa de forma cualitativa y descriptiva: no hay notas ni promedios, y ningún niño reprueba el grado. Elige el nivel de avance y escribe las fortalezas y recomendaciones de cada niño ({planilla.asignatura}, grupo {planilla.grupo}).
      </Alert>
      {!planilla.editable && planilla.motivo_no_editable && <Alert tone="warning">{planilla.motivo_no_editable}</Alert>}
      {mensaje && <Alert tone={mensaje.tono}>{mensaje.texto}</Alert>}

      {planilla.filas.map((f) => {
        const v = valorDe(f.student_id, f.valoracion);
        const editado = f.student_id in cambios;
        return (
          <Card key={f.student_id} className="space-y-3">
            <CardHeader title={`${f.apellido} ${f.nombre}`} subtitle={f.valoracion && !editado ? `Valorado: ${NOMBRES_NIVEL_VALORACION[f.valoracion.nivel]}` : editado ? 'Con cambios sin guardar' : 'Sin valorar'} />
            <div className="max-w-xs">
              <Select label="Nivel de avance" value={v.nivel} disabled={!planilla.editable} onChange={(e) => cambiar(f.student_id, f.valoracion, { nivel: e.target.value as NivelValoracion | '' })}>
                <option value="">Elige un nivel</option>
                {(Object.keys(NOMBRES_NIVEL_VALORACION) as NivelValoracion[]).map((n) => (
                  <option key={n} value={n}>
                    {NOMBRES_NIVEL_VALORACION[n]}
                  </option>
                ))}
              </Select>
            </div>
            <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
              <Textarea label="Fortalezas" rows={3} value={v.fortalezas} disabled={!planilla.editable} maxLength={1500} onChange={(e) => cambiar(f.student_id, f.valoracion, { fortalezas: e.target.value })} />
              <Textarea label="Recomendaciones" rows={3} value={v.recomendaciones} disabled={!planilla.editable} maxLength={1500} onChange={(e) => cambiar(f.student_id, f.valoracion, { recomendaciones: e.target.value })} />
            </div>
          </Card>
        );
      })}
      {planilla.filas.length === 0 && <Alert tone="info">El grupo no tiene estudiantes con matrícula activa.</Alert>}

      {planilla.editable && planilla.filas.length > 0 && (
        <div className="sticky bottom-0 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border bg-surface p-3">
          <p className="text-xs text-muted">
            {tocadas.length === 0 ? 'Sin cambios.' : incompletas.length > 0 ? `Faltan datos en ${incompletas.length} niño(s): el nivel y los dos textos (mínimo ${MIN_CARACTERES_DESCRIPTOR} caracteres) son obligatorios.` : `${tocadas.length} valoración(es) por guardar.`}
          </p>
          <Button type="button" onClick={() => void guardarTodo()} isLoading={guardar.isPending} disabled={tocadas.length === 0 || incompletas.length > 0}>
            Guardar valoraciones
          </Button>
        </div>
      )}
    </div>
  );
}
