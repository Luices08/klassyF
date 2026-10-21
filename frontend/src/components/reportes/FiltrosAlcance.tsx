import { useEffect, useMemo, useState } from 'react';
import { useAniosLectivos } from '../../hooks/useAniosLectivos';
import { useCampuses, useGrades, useTodasLasJornadas } from '../../hooks/useCatalogs';
import { useGroups } from '../../hooks/useGroups';
import { useInstitution } from '../../hooks/useInstitution';
import { opcionesDeGrupos } from '../../lib/opcionesBuscables';
import { Select } from '../ui/Field';
import { SelectBuscable } from '../ui/SelectBuscable';

const NOMBRES_JORNADA: Record<string, string> = { MANANA: 'Mañana', TARDE: 'Tarde', UNICA: 'Única', NOCTURNA: 'Nocturna', SABATINA: 'Sabatina' };

export interface AlcanceReporte {
  academic_year_id: string;
  sede_id?: string;
  jornada_id?: string;
  grade_id?: string;
  group_id?: string;
}

/**
 * Los filtros en cascada de los reportes de cierre: año → sede → jornada → grado → grupo, cada uno con «todos». Cambiar uno de los de arriba
 * deja sin efecto el grupo elegido. Devuelve el alcance listo para mandar al servidor y lo que hace falta para nombrar el archivo.
 */
export function useFiltrosAlcance(anioPorDefecto?: string) {
  const anios = useAniosLectivos();
  const institucion = useInstitution();
  const sedes = useCampuses(institucion.data?._id);
  const jornadas = useTodasLasJornadas();
  const grados = useGrades();

  const [anioId, setAnioId] = useState('');
  const [sedeId, setSedeId] = useState('');
  const [jornadaId, setJornadaId] = useState('');
  const [gradoId, setGradoId] = useState('');
  const [grupoId, setGrupoId] = useState('');
  const anioElegido = anioId || anioPorDefecto || '';
  useEffect(() => {
    setGrupoId('');
  }, [anioElegido, sedeId, jornadaId, gradoId]);

  const grupos = useGroups({ academic_year_id: anioElegido || undefined, sede_id: sedeId || undefined, jornada_id: jornadaId || undefined, grade_id: gradoId || undefined });
  const jornadasDeLaSede = useMemo(
    () => (jornadas.data ?? []).filter((j) => !sedeId || (typeof j.sede_id === 'object' ? j.sede_id._id : j.sede_id) === sedeId),
    [jornadas.data, sedeId]
  );
  const anio = (anios.data ?? []).find((a) => a._id === anioElegido);
  const grupo = (grupos.data ?? []).find((g) => g._id === grupoId);

  const alcance: AlcanceReporte = {
    academic_year_id: anioElegido,
    sede_id: sedeId || undefined,
    jornada_id: jornadaId || undefined,
    grade_id: gradoId || undefined,
    group_id: grupoId || undefined,
  };
  return {
    alcance,
    anio,
    grupo,
    estado: { anios, sedes, grados, grupos, jornadasDeLaSede, anioElegido, sedeId, jornadaId, gradoId, grupoId },
    cambiar: { setAnioId, setSedeId, setJornadaId, setGradoId, setGrupoId },
  };
}

export function FiltrosAlcance({ filtros, grupoObligatorio = false }: { filtros: ReturnType<typeof useFiltrosAlcance>; grupoObligatorio?: boolean }) {
  const { estado, cambiar } = filtros;
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
      <Select label="Año lectivo" value={estado.anioElegido} onChange={(e) => cambiar.setAnioId(e.target.value)}>
        {(estado.anios.data ?? []).map((a) => (
          <option key={a._id} value={a._id}>
            {a.year} · {a.nombre}
          </option>
        ))}
      </Select>
      <Select
        label="Sede"
        value={estado.sedeId}
        onChange={(e) => {
          cambiar.setSedeId(e.target.value);
          cambiar.setJornadaId('');
        }}
      >
        <option value="">Todas las sedes</option>
        {(estado.sedes.data ?? []).map((s) => (
          <option key={s._id} value={s._id}>
            {s.nombre}
          </option>
        ))}
      </Select>
      <Select label="Jornada" value={estado.jornadaId} onChange={(e) => cambiar.setJornadaId(e.target.value)}>
        <option value="">Todas las jornadas</option>
        {estado.jornadasDeLaSede.map((j) => (
          <option key={j._id} value={j._id}>
            {NOMBRES_JORNADA[j.nombre] ?? j.nombre}
            {!estado.sedeId && typeof j.sede_id === 'object' ? ` · ${j.sede_id.nombre}` : ''}
          </option>
        ))}
      </Select>
      <Select label="Grado" value={estado.gradoId} onChange={(e) => cambiar.setGradoId(e.target.value)}>
        <option value="">Todos los grados</option>
        {(estado.grados.data ?? []).map((g) => (
          <option key={g._id} value={g._id}>
            {g.nombre}
          </option>
        ))}
      </Select>
      <SelectBuscable
        label="Grupo"
        value={estado.grupoId}
        onChange={cambiar.setGrupoId}
        placeholder="Buscar grupo…"
        vacioLabel={grupoObligatorio ? 'Elige un grupo' : 'Todos los grupos'}
        opciones={opcionesDeGrupos(estado.grupos.data ?? [])}
      />
    </div>
  );
}
