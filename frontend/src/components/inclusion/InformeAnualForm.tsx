import { type FormEvent, useState } from 'react';
import { Alert } from '../ui/Alert';
import { Textarea } from '../ui/Field';
import { useGuardarSeccion, type Expediente, type InformeAnual } from '../../hooks/useInclusion';
import { PieGuardar } from './campos';

/**
 * Informe anual de proceso pedagógico (preescolar) o de competencias (básica y media): se anexa al boletín final y hace parte de
 * la historia escolar. Lo elabora el docente de aula con orientación y se emite cuando el expediente está activo.
 */
export function InformeAnualForm({ exp }: { exp: Expediente }) {
  const guardar = useGuardarSeccion(exp._id);
  const editable = exp.editable && exp.estado !== 'BORRADOR';
  const [form, setForm] = useState<InformeAnual>(exp.informe_anual as InformeAnual);

  const enviar = async (e: FormEvent) => {
    e.preventDefault();
    await guardar.mutateAsync({ seccion: 'informe-anual', cuerpo: form });
  };

  const campo = (clave: keyof InformeAnual, etiqueta: string) => (
    <Textarea key={clave} label={etiqueta} disabled={!editable} value={form[clave]} onChange={(e) => setForm((f) => ({ ...f, [clave]: e.target.value }))} maxLength={4000} />
  );

  return (
    <form onSubmit={enviar} className="space-y-4">
      {exp.estado !== 'ACTIVO' && <Alert tone="info">El informe se emite al finalizar el año, con el expediente activo (acta firmada).</Alert>}
      {campo('logros', 'Logros alcanzados')}
      {campo('dificultades_persistentes', 'Dificultades que persisten')}
      {campo('eficacia_de_ajustes', 'Eficacia de los ajustes')}
      {campo('recomendaciones_grado_siguiente', 'Recomendaciones para el grado siguiente')}
      {campo('ajustes_a_mantener', 'Ajustes que se deben mantener')}
      <PieGuardar mutacion={guardar} soloLectura={!editable} />
    </form>
  );
}
