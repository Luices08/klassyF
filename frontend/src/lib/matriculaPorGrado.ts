import { estudiantesDelFiltro, type FiltroEstudiante } from './situacionEstudiante';
import type { EstudiantePorGrado, Grade, TipoIngreso, UbicacionEstudiante } from '../types/domain';

// Agrupar y filtrar a los estudiantes por el grado donde les toca matricularse. La ubicación la calcula el servidor (no es un dato guardado);
// aquí solo se reparte en pestañas y se aplican los filtros.

export const PESTANA_EGRESADOS = 'egresados';
export const PESTANA_SIN_GRADO = 'sin-grado';

/** Estudiantes de la pestaña de un grado: los que les toca ahí y, si se pide, también quienes lo cursaron el año anterior (repiten). */
export function estudiantesDeGrado(lista: EstudiantePorGrado[], gradoId: string, incluirQuienesLoCursaron: boolean): EstudiantePorGrado[] {
  return lista.filter((e) => {
    const u = e.ubicacion;
    if (u.lugar === 'GRADO' && u.grado_id === gradoId) return true;
    return incluirQuienesLoCursaron && u.ultimo_grado_cursado_id === gradoId;
  });
}

export function egresados(lista: EstudiantePorGrado[]): EstudiantePorGrado[] {
  return lista.filter((e) => e.ubicacion.lugar === 'EGRESADO');
}

export function sinGrado(lista: EstudiantePorGrado[]): EstudiantePorGrado[] {
  return lista.filter((e) => e.ubicacion.lugar === 'SIN_GRADO');
}

export function filtrarPorBusqueda(lista: EstudiantePorGrado[], texto: string): EstudiantePorGrado[] {
  const t = normalizar(texto);
  if (!t) return lista;
  const palabras = t.split(/\s+/);
  return lista.filter((e) => {
    const pajar = normalizar(`${e.apellido} ${e.nombre} ${e.numero_documento}`);
    return palabras.every((p) => pajar.includes(p));
  });
}

function normalizar(s: string): string {
  return s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
}

export function aplicarFiltroDeSituacion(lista: EstudiantePorGrado[], filtro: FiltroEstudiante): EstudiantePorGrado[] {
  return estudiantesDelFiltro(lista, filtro) as EstudiantePorGrado[];
}

/** El tipo de ingreso natural al matricular desde la lista: quien ya estudió aquí es ANTIGUO (REPITENTE si repite el grado), quien no tiene historial es NUEVO. */
export function tipoDeIngresoSugerido(e: EstudiantePorGrado, gradoId: string | null): TipoIngreso {
  const u = e.ubicacion;
  if (u.ultimo_grado_cursado_id === null) return 'NUEVO';
  return u.fuente === 'PROMOCION' && gradoId !== null && u.ultimo_grado_cursado_id === gradoId ? 'REPITENTE' : 'ANTIGUO';
}

export type VeredictoDeGrado = 'SIN_REFERENCIA' | 'COINCIDE' | 'DIFIERE';

/**
 * Espejo de `compararGradoElegido` del servidor: dice si el grado elegido concuerda con el historial o con el último grado aprobado declarado.
 * Solo adelanta el aviso en pantalla; el servidor repite la comprobación y es quien exige el motivo.
 */
export function veredictoDeGrado(args: {
  ubicacion: UbicacionEstudiante | null;
  gradoElegido: number | null;
  ultimoGradoAprobado: number | null;
  numerosDeGrado: ReadonlySet<number>;
}): VeredictoDeGrado {
  const { ubicacion, gradoElegido, ultimoGradoAprobado, numerosDeGrado } = args;
  if (gradoElegido === null) return 'SIN_REFERENCIA';
  if (ultimoGradoAprobado !== null) return numerosDeGrado.has(ultimoGradoAprobado + 1) && ultimoGradoAprobado + 1 === gradoElegido ? 'COINCIDE' : 'DIFIERE';
  const esperado = ubicacion?.esperado;
  if (!esperado || esperado.lugar === 'SIN_GRADO') return 'SIN_REFERENCIA';
  return esperado.lugar === 'GRADO' && esperado.grado_numero === gradoElegido ? 'COINCIDE' : 'DIFIERE';
}

/** Grados ordenados por número para armar las pestañas. */
export function gradosOrdenados(grados: Grade[]): Grade[] {
  return [...grados].filter((g) => g.estado !== 'inactivo').sort((a, b) => a.numero - b.numero);
}
