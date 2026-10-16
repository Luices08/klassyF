import { useMemo } from 'react';
import { ETIQUETA_JORNADA } from '../../hooks/useCertificados';
import { obtenerEstiloAsignatura } from '../../lib/asignaturasEstilos';
import type { TeacherAssignment } from '../../types/domain';
import { ContadorInsignia } from '../notificaciones/ContadorInsignia';
import { Card } from '../ui/Card';

interface GrupoItem {
  asignacionId: string;
  grupoId: string;
  nomenclatura: string;
  gradoNumero: number;
  gradoNombre: string;
  jornada: string;
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
  /** Novedades sin ver de una clase (punto rojo del botón del grupo). */
  novedadesDeClase?: (asignacionId: string) => number;
  onSeleccionarClase: (asignacionId: string) => void;
}

/**
 * Vista 1: Catálogo de asignaturas con sus grupos como botones amplios ordenados por grado. Con «todas las jornadas» salen
 * todos los grupos asignados, por eso cada botón dice su jornada; el punto rojo avisa de entregas nuevas en esa clase.
 */
export function CatalogoAsignaturasDocente({
  clases,
  sedeId,
  jornadaId,
  novedadesDeClase,
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
      const jornadaNombre = typeof g.jornada_id === 'object' && g.jornada_id ? g.jornada_id.nombre : '';

      mapa.get(subId)!.grupos.push({
        asignacionId: c._id,
        grupoId: g._id,
        nomenclatura: g.nomenclatura,
        gradoNumero: gradoNum,
        gradoNombre: gradoNom,
        jornada: ETIQUETA_JORNADA[jornadaNombre] ?? jornadaNombre,
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
        return a.nomenclatura.localeCompare(b.nomenclatura, undefined, { numeric: true }) || a.jornada.localeCompare(b.jornada, 'es');
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
          const { Icon, contenedorClases, bordeClases } = obtenerEstiloAsignatura(asig.nombre, asig.areaNombre);
          const cantidadGrupos = asig.grupos.length;

          return (
            <Card key={asig.subjectId} className={`transition-all hover:shadow-md ${bordeClases}`}>
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

                    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
                      {asig.grupos.map((g) => {
                        const etiqueta = `${g.gradoNombre} ${g.nomenclatura}`.trim();
                        return (
                          <button
                            key={g.asignacionId}
                            type="button"
                            onClick={() => onSeleccionarClase(g.asignacionId)}
                            className="relative flex min-h-[84px] flex-col items-start justify-center gap-0.5 rounded-xl border border-border bg-surface px-4 py-3 text-left shadow-sm transition-all hover:border-primary hover:bg-primary-soft hover:shadow focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-1 active:scale-[0.98]"
                            title={`Ver actividades de ${asig.nombre} - ${etiqueta}${g.jornada ? ` (${g.jornada})` : ''}`}
                          >
                            <span className="text-lg font-bold leading-6 text-ink">{etiqueta}</span>
                            {g.jornada && <span className="text-xs font-medium text-muted">Jornada {g.jornada.toLowerCase()}</span>}
                            <span className="absolute -right-2 -top-2">
                              <ContadorInsignia valor={novedadesDeClase?.(g.asignacionId) ?? 0} />
                            </span>
                          </button>
                        );
                      })}
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
