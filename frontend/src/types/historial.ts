import type { Rol } from './api';
import type { EstadoMatricula } from './domain';

/** Los cuatro tipos de evento que el historial muestra; el resto de la bitácora (consultas, descargas, accesos) no sale. */
export type TipoEventoHistorial = 'CREACION' | 'EDICION' | 'MATRICULACION' | 'ELIMINACION';

/** M31: espejo de `vistaEvento` (backend/src/services/historialAcciones.service.ts). Módulo, tipo y etiqueta los calcula el servidor. */
export interface EventoHistorial {
  _id: string;
  fecha: string;
  accion: string;
  etiqueta: string;
  tipo: TipoEventoHistorial | null;
  tipo_nombre: string;
  modulo: string;
  modulo_nombre: string;
  entidad: string;
  entidad_id: string | null;
  detalle: string | null;
  ip: string | null;
  /** `null` = lo hizo el sistema o alguien sin sesión (p. ej. la solicitud pública de admisión). */
  usuario: { _id: string; nombre: string; apellido: string; numero_documento: string; roles: Rol[] } | null;
  enlace: string | null;
}

export interface CatalogoHistorial {
  tipos: Array<{ clave: TipoEventoHistorial; nombre: string }>;
  modulos: Array<{ clave: string; nombre: string }>;
  acciones: Array<{ accion: string; etiqueta: string; modulo: string; tipo: TipoEventoHistorial }>;
}

export interface FiltrosHistorial {
  modulo?: string;
  tipo?: string;
  accion?: string;
  usuario_id?: string;
  desde?: string;
  hasta?: string;
  texto?: string;
}

export interface PaginaHistorial {
  data: EventoHistorial[];
  total: number;
  page: number;
  pages: number;
}

export interface MatriculaDelEstudiante {
  _id: string;
  anio: number | null;
  grado: string | null;
  grupo: string | null;
  estado: EstadoMatricula;
  tipo_ingreso: string;
  folio_matricula: string | null;
  fecha_matricula: string | null;
}

export interface HistorialMatricula {
  eventos: EventoHistorial[];
  matriculas_del_estudiante: MatriculaDelEstudiante[];
}
