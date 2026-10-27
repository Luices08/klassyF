import type { Rol } from './api';
import type { EstadoMatricula } from './domain';

/** M31: espejo de `vistaEvento` (backend/src/services/historialAcciones.service.ts). Módulo y etiqueta los calcula el servidor. */
export interface EventoHistorial {
  _id: string;
  fecha: string;
  accion: string;
  etiqueta: string;
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
  modulos: Array<{ clave: string; nombre: string }>;
  acciones: Array<{ accion: string; etiqueta: string; modulo: string }>;
}

export interface FiltrosHistorial {
  modulo?: string;
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
