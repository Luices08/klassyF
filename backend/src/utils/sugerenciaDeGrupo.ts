// Qué grupo sugerir al matricular a alguien en un grado (M04): el menos lleno entre los paralelos, para repartir parejo. Puro y con tests.

export interface GrupoParaSugerir {
  id: string;
  nombre: string;
  sede_id: string;
  jornada_id: string | null;
  max_capacity: number;
  cupos_ocupados: number;
}

export interface PreferenciaDeUbicacion {
  sede_id?: string | null;
  jornada_id?: string | null;
}

export interface GrupoSugerido {
  id: string;
  nombre: string;
  capacidad: number;
  ocupados: number;
  libres: number;
  /** false si no hubo cupo en la sede y jornada preferidas y se sugiere uno de otra: la pantalla lo dice. */
  en_preferencia: boolean;
}

const ocupacion = (g: GrupoParaSugerir) => (g.max_capacity > 0 ? g.cupos_ocupados / g.max_capacity : 1);

/** El menos lleno (por porcentaje de ocupación; a igual ocupación, con más lugares libres y luego por nombre) entre los que aún tienen cupo. */
function elMenosLleno(grupos: readonly GrupoParaSugerir[]): GrupoParaSugerir | null {
  return (
    grupos
      .filter((g) => g.cupos_ocupados < g.max_capacity)
      .sort((a, b) => ocupacion(a) - ocupacion(b) || b.max_capacity - b.cupos_ocupados - (a.max_capacity - a.cupos_ocupados) || a.nombre.localeCompare(b.nombre, 'es', { numeric: true }))[0] ?? null
  );
}

/**
 * Sugiere el grupo con más lugar relativo. Con una sede (y jornada) preferida —la de su renovación— busca primero allí; si ahí no queda cupo, sugiere
 * uno de otra sede o jornada y lo marca. null si ningún grupo del grado tiene cupo. Nunca decide: secretaría elige.
 */
export function sugerirGrupo(grupos: readonly GrupoParaSugerir[], preferencia: PreferenciaDeUbicacion = {}): GrupoSugerido | null {
  const enPreferencia = grupos.filter((g) => (!preferencia.sede_id || g.sede_id === preferencia.sede_id) && (!preferencia.jornada_id || g.jornada_id === preferencia.jornada_id));
  const elegido = elMenosLleno(enPreferencia);
  const respaldo = elegido ? null : elMenosLleno(grupos);
  const g = elegido ?? respaldo;
  if (!g) return null;
  return { id: g.id, nombre: g.nombre, capacidad: g.max_capacity, ocupados: g.cupos_ocupados, libres: g.max_capacity - g.cupos_ocupados, en_preferencia: elegido !== null };
}
