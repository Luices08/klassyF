import type { OpcionBuscable } from '../components/ui/SelectBuscable';
import { ETIQUETA_JORNADA } from '../hooks/useCertificados';
import type { Group } from '../types/domain';

interface PersonaConNombre {
  _id: string;
  nombre: string;
  apellido: string;
  numero_documento?: string;
}

/** Estudiante, docente o usuario como opción de `SelectBuscable`: «Apellido, Nombre»; el documento también se busca. */
export function opcionesDePersonas(personas: PersonaConNombre[]): OpcionBuscable[] {
  return personas.map((p) => ({
    value: p._id,
    label: `${p.apellido}, ${p.nombre}`,
    detalle: p.numero_documento,
  }));
}

interface OpcionesDeGruposAjustes {
  /** Agrega los cupos ocupados al detalle (p. ej. al matricular). */
  conCupos?: boolean;
}

/** Grupo como opción de `SelectBuscable`: «Grado Grupo»; sede, jornada y cupos como texto secundario que también se busca. */
export function opcionesDeGrupos(grupos: Group[], { conCupos = false }: OpcionesDeGruposAjustes = {}): OpcionBuscable[] {
  return grupos.map((g) => {
    const grado = typeof g.grade_id === 'object' ? g.grade_id.nombre : '';
    const sede = typeof g.sede_id === 'object' ? g.sede_id.nombre : '';
    const jornada = typeof g.jornada_id === 'object' ? (ETIQUETA_JORNADA[g.jornada_id.nombre] ?? g.jornada_id.nombre) : '';
    const detalle = [sede, jornada, conCupos ? `${g.cupos_ocupados}/${g.max_capacity} cupos` : ''].filter(Boolean).join(' · ');
    return { value: g._id, label: `${grado} ${g.nomenclatura}`.trim(), detalle: detalle || undefined };
  });
}
