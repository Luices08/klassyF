import { useMemo } from 'react';
import type { TeacherAssignment } from '../../types/domain';
import { Card } from '../ui/Card';
import {
  ActivityIcon,
  BookIcon,
  CalculatorIcon,
  FlaskIcon,
  GlobeIcon,
  MessageCircleIcon,
  MonitorIcon,
  PaletteIcon,
} from '../ui/icons';

interface GrupoItem {
  asignacionId: string;
  grupoId: string;
  nomenclatura: string;
  gradoNumero: number;
  gradoNombre: string;
}

interface AsignaturaCardData {
  subjectId: string;
  nombre: string;
  abreviatura?: string;
  areaNombre?: string;
  grupos: GrupoItem[];
}

interface CatalogoAsignaturasDocenteProps {
  clases: TeacherAssignment[];
  sedeId: string;
  jornadaId: string;
  onSeleccionarClase: (asignacionId: string) => void;
}

function normalizarTexto(txt: string): string {
  return txt
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

interface EstiloAsignatura {
  Icon: React.ComponentType<{ className?: string }>;
  contenedorClases: string;
}

/** Asigna un icono representativo y tono suave de acuerdo al área o nombre de la materia. */
function obtenerEstiloAsignatura(nombre: string): EstiloAsignatura {
  const norm = normalizarTexto(nombre);

  if (norm.includes('matemat') || norm.includes('calcul') || norm.includes('algebra') || norm.includes('trigono')) {
    return { Icon: CalculatorIcon, contenedorClases: 'bg-blue-50 text-blue-600' };
  }
  if (norm.includes('contab') || norm.includes('financ') || norm.includes('econom') || norm.includes('comerc')) {
    return { Icon: CalculatorIcon, contenedorClases: 'bg-slate-100 text-slate-700' };
  }
  if (
    norm.includes('espanol') ||
    norm.includes('lengua') ||
    norm.includes('castell') ||
    norm.includes('literat') ||
    norm.includes('lectur')
  ) {
    return { Icon: BookIcon, contenedorClases: 'bg-purple-50 text-purple-600' };
  }
  if (
    norm.includes('cienc') ||
    norm.includes('natural') ||
    norm.includes('biolog') ||
    norm.includes('quimic') ||
    norm.includes('fisic')
  ) {
    return { Icon: FlaskIcon, contenedorClases: 'bg-emerald-50 text-emerald-600' };
  }
  if (
    norm.includes('social') ||
    norm.includes('histor') ||
    norm.includes('geograf') ||
    norm.includes('filosof') ||
    norm.includes('ciudadan') ||
    norm.includes('democr')
  ) {
    return { Icon: GlobeIcon, contenedorClases: 'bg-amber-50 text-amber-600' };
  }
  if (
    norm.includes('tecnol') ||
    norm.includes('informat') ||
    norm.includes('comput') ||
    norm.includes('sistem') ||
    norm.includes('programac')
  ) {
    return { Icon: MonitorIcon, contenedorClases: 'bg-sky-50 text-sky-600' };
  }
  if (norm.includes('art') || norm.includes('dibuj') || norm.includes('music') || norm.includes('danz') || norm.includes('teatr')) {
    return { Icon: PaletteIcon, contenedorClases: 'bg-rose-50 text-rose-600' };
  }
  if (norm.includes('educacion fisica') || norm.includes('deport') || norm.includes('recreac') || norm.includes('ludic')) {
    return { Icon: ActivityIcon, contenedorClases: 'bg-indigo-50 text-indigo-600' };
  }
  if (norm.includes('ingl') || norm.includes('idiom') || norm.includes('extranj') || norm.includes('franc')) {
    return { Icon: MessageCircleIcon, contenedorClases: 'bg-teal-50 text-teal-600' };
  }

  return { Icon: BookIcon, contenedorClases: 'bg-primary-soft text-primary' };
}

/**
 * Vista 1: Catálogo de asignaturas con sus cursos visibles en cuadritos ordenados por grado.
 * Los cuadritos son accesibles directamente y están acotados en ancho para que no se desborden.
 */
export function CatalogoAsignaturasDocente({
  clases,
  sedeId,
  jornadaId,
  onSeleccionarClase,
}: CatalogoAsignaturasDocenteProps) {
  // Filtra por sede y jornada, luego agrupa por materia ordenando sus cursos de menor a mayor grado
  const asignaturas = useMemo(() => {
    const mapa = new Map<string, AsignaturaCardData>();

    for (const c of clases) {
      const g = typeof c.group_id === 'object' && c.group_id ? c.group_id : null;
      const s = typeof c.subject_id === 'object' && c.subject_id ? c.subject_id : null;
      if (!g || !s) continue;

      const cSedeId = typeof g.sede_id === 'object' && g.sede_id ? g.sede_id._id : String(g.sede_id || '');
      const cJornadaId = typeof g.jornada_id === 'object' && g.jornada_id ? g.jornada_id._id : String(g.jornada_id || '');

      if (sedeId && cSedeId !== sedeId) continue;
      if (jornadaId && cJornadaId !== jornadaId) continue;

      const subId = s._id;
      if (!mapa.has(subId)) {
        const areaNom = typeof s.area_id === 'object' && s.area_id ? s.area_id.nombre : undefined;
        mapa.set(subId, {
          subjectId: subId,
          nombre: s.nombre,
          abreviatura: s.abreviatura,
          areaNombre: areaNom,
          grupos: [],
        });
      }

      const gradoObj = typeof g.grade_id === 'object' && g.grade_id ? g.grade_id : null;
      const gradoNum = gradoObj && typeof gradoObj.numero === 'number' ? gradoObj.numero : 999;
      const gradoNom = gradoObj?.nombre ?? '';

      mapa.get(subId)!.grupos.push({
        asignacionId: c._id,
        grupoId: g._id,
        nomenclatura: g.nomenclatura,
        gradoNumero: gradoNum,
        gradoNombre: gradoNom,
      });
    }

    const resultado = Array.from(mapa.values());

    // Ordenar asignaturas alfabéticamente
    resultado.sort((a, b) => a.nombre.localeCompare(b.nombre));

    // Ordenar los grupos dentro de cada asignatura de menor a mayor grado
    for (const asig of resultado) {
      asig.grupos.sort((a, b) => {
        if (a.gradoNumero !== b.gradoNumero) {
          return a.gradoNumero - b.gradoNumero;
        }
        return a.nomenclatura.localeCompare(b.nomenclatura, undefined, { numeric: true });
      });
    }

    return resultado;
  }, [clases, sedeId, jornadaId]);

  if (asignaturas.length === 0) {
    return (
      <Card className="p-8 text-center text-muted">
        <p className="text-base font-medium text-ink">No tienes asignaturas registradas</p>
        <p className="mt-1 text-sm">
          No hay clases asignadas para la sede y jornada seleccionadas en el año lectivo activo.
        </p>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-h3 text-ink">Asignaturas</h2>
        <p className="text-sm text-muted">Selecciona un curso para consultar o programar sus actividades.</p>
      </div>

      <div className="space-y-4">
        {asignaturas.map((asig) => {
          const { Icon, contenedorClases } = obtenerEstiloAsignatura(asig.nombre);
          const cantidadGrupos = asig.grupos.length;

          return (
            <Card key={asig.subjectId} className="p-5 transition-shadow hover:shadow-md">
              <div className="flex flex-col gap-4 sm:flex-row sm:items-start">
                {/* Icono con contenedor estilizado */}
                <div
                  className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-xl ${contenedorClases}`}
                >
                  <Icon className="h-6 w-6" />
                </div>

                <div className="min-w-0 flex-1">
                  {/* Encabezado de la materia */}
                  <div>
                    <h3 className="text-base font-bold text-ink sm:text-lg">{asig.nombre}</h3>
                    <p className="text-xs text-muted">
                      {cantidadGrupos} {cantidadGrupos === 1 ? 'grupo asignado' : 'grupos asignados'}
                      {asig.areaNombre ? ` · Área de ${asig.areaNombre}` : ''}
                    </p>
                  </div>

                  {/* Sección de cursos/grupos visibles de inmediato */}
                  <div className="mt-4 border-t border-border/60 pt-3">
                    <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted">
                      Grados y grupos
                    </p>

                    {/* Contenedor con límite de ancho para evitar que se desborden horizontalmente */}
                    <div className="flex max-w-2xl flex-wrap gap-2.5">
                      {asig.grupos.map((g) => (
                        <button
                          key={g.asignacionId}
                          type="button"
                          onClick={() => onSeleccionarClase(g.asignacionId)}
                          className="group relative inline-flex items-center justify-center rounded-lg border border-border bg-white px-3.5 py-1.5 text-sm font-semibold text-ink shadow-sm transition-all hover:border-primary hover:bg-primary-soft hover:text-primary active:scale-95 focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-1"
                          title={`Ver actividades de ${asig.nombre} - Grupo ${g.nomenclatura}`}
                        >
                          <span>{g.nomenclatura}</span>
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
