import { type FormEvent, useState } from 'react';
import { Textarea } from '../ui/Field';
import { useGuardarSeccion, type Caracteristicas, type Expediente } from '../../hooks/useInclusion';
import { PieGuardar, Seccion } from './campos';

const CAMPOS_PERSONA: [keyof Caracteristicas, string, string?][] = [
  ['descripcion_general', 'Descripción general del estudiante'],
  ['gustos_intereses', 'Gustos e intereses'],
  ['aspectos_que_le_desagradan', 'Aspectos que le desagradan'],
  ['expectativas_estudiante', 'Expectativas del estudiante'],
  ['expectativas_familia', 'Expectativas de la familia'],
  ['lo_que_hace_puede_requiere_apoyo', 'Qué hace, qué puede hacer y qué requiere apoyo'],
  ['habilidades_competencias', 'Habilidades, competencias y aprendizajes para el grado'],
  ['valoracion_pedagogica', 'Valoración pedagógica', 'Currículo, grado y niveles de lenguaje: fortalezas y aspectos a apoyar.'],
];

const CAMPOS_AULA: [keyof Caracteristicas, string, string?][] = [
  ['barreras_generales', 'Barreras generales de acceso al aprendizaje y la participación', 'Se muestra a los docentes del estudiante.'],
  ['recomendaciones_aula', 'Recomendaciones didácticas para el aula', 'Se muestra a los docentes del estudiante.'],
  ['pautas_evaluacion', 'Pautas de evaluación recomendadas', 'Se muestra a los docentes del estudiante.'],
  ['recursos_necesarios', 'Recursos físicos, tecnológicos y didácticos necesarios'],
  ['proyectos_especificos', 'Proyectos específicos de la institución para incluir a todos'],
  ['otra_informacion', 'Otra información relevante'],
  ['actividades_en_casa_receso', 'Actividades en casa durante los recesos escolares'],
];

/**
 * Características del estudiante y pautas para el aula (Anexo 2). Lo marcado «se muestra a los docentes» es la ficha pedagógica:
 * orientación la redacta sin categoría ni diagnóstico. La alerta de seguridad es lo único «médico» que ve el docente.
 */
export function CaracteristicasForm({ exp }: { exp: Expediente }) {
  const guardar = useGuardarSeccion(exp._id);
  const soloLectura = !exp.permisos.gestiona || !exp.editable;
  const [form, setForm] = useState<Caracteristicas>(exp.caracteristicas as Caracteristicas);

  const enviar = async (e: FormEvent) => {
    e.preventDefault();
    await guardar.mutateAsync({ seccion: 'caracteristicas', cuerpo: form });
  };

  const campo = ([clave, etiqueta, ayuda]: [keyof Caracteristicas, string, string?]) => (
    <Textarea key={clave} label={etiqueta} hint={ayuda} disabled={soloLectura} value={form[clave]} onChange={(e) => setForm((f) => ({ ...f, [clave]: e.target.value }))} maxLength={4000} />
  );

  return (
    <form onSubmit={enviar} className="space-y-6">
      <Seccion titulo="Características del estudiante">{CAMPOS_PERSONA.map(campo)}</Seccion>
      <Seccion titulo="Pautas para el aula y recursos">
        {CAMPOS_AULA.map(campo)}
        <Textarea
          label="Alerta de seguridad en el aula (opcional)"
          hint="Solo lo necesario para que el docente actúe con seguridad (ej.: «avisar si presenta dolor de cabeza frecuente»). No escribas diagnósticos."
          disabled={soloLectura}
          value={form.alerta_seguridad_aula}
          onChange={(e) => setForm((f) => ({ ...f, alerta_seguridad_aula: e.target.value }))}
          maxLength={500}
        />
      </Seccion>
      <PieGuardar mutacion={guardar} soloLectura={soloLectura} />
    </form>
  );
}
