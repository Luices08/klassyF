import { useEffect, useState } from 'react';
import { useEnrollmentsList } from '../../hooks/useEnrollments';
import { useGroups } from '../../hooks/useGroups';
import { opcionesDeGrupos } from '../../lib/opcionesBuscables';
import { SelectBuscable } from '../ui/SelectBuscable';

export interface EstudianteElegido {
  student_id: string;
  enrollment_id: string;
  nombre: string;
}

/** Elige un estudiante por su grupo (un select de todos los estudiantes del colegio sería ilegible): primero el grupo, luego la persona. */
export function SelectorEstudianteDeGrupo({ anioId, onChange, soloGrados }: { anioId: string; onChange: (e: EstudianteElegido | null) => void; /** Números de grado que se ofrecen (p. ej. [10, 11] en Titulación); sin esto, todos. */ soloGrados?: number[] }) {
  const todos = useGroups({ academic_year_id: anioId });
  const grupos = { ...todos, data: soloGrados ? (todos.data ?? []).filter((g) => typeof g.grade_id === 'object' && soloGrados.includes(g.grade_id.numero)) : todos.data };
  const [grupoId, setGrupoId] = useState('');
  const [matriculaId, setMatriculaId] = useState('');
  const matriculas = useEnrollmentsList({ academic_year_id: anioId, group_id: grupoId, limit: 100 }, Boolean(grupoId));
  const activas = (matriculas.data?.data ?? []).filter((m) => m.estado !== 'RETIRADO' && m.estado !== 'ANULADO' && typeof m.student_id === 'object');

  useEffect(() => {
    const m = activas.find((x) => x._id === matriculaId);
    if (m && typeof m.student_id === 'object') onChange({ student_id: m.student_id._id, enrollment_id: m._id, nombre: `${m.student_id.apellido} ${m.student_id.nombre}` });
    else onChange(null);
    // onChange cambia en cada render del padre; solo importa la elección.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [matriculaId, matriculas.data]);

  return (
    <>
      <SelectBuscable
        label="Grupo del estudiante"
        value={grupoId}
        onChange={(v) => {
          setGrupoId(v);
          setMatriculaId('');
        }}
        vacioLabel="Elige un grupo"
        placeholder="Buscar grupo…"
        opciones={opcionesDeGrupos(grupos.data ?? [])}
      />
      <SelectBuscable
        label="Estudiante"
        value={matriculaId}
        onChange={setMatriculaId}
        disabled={!grupoId}
        vacioLabel="Elige un estudiante"
        placeholder="Buscar estudiante…"
        opciones={activas.map((m) => ({
          value: m._id,
          label: typeof m.student_id === 'object' ? `${m.student_id.apellido}, ${m.student_id.nombre}` : '',
          detalle: typeof m.student_id === 'object' ? m.student_id.numero_documento : undefined,
        }))}
      />
    </>
  );
}
