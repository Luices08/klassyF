import { useQuery } from '@tanstack/react-query';
import { api } from '../lib/apiClient';

export type CategoriaExpediente = 'MATRICULA' | 'SALIDA' | 'TRASLADO' | 'PAZ_Y_SALVO' | 'SERVICIO_SOCIAL' | 'INCLUSION' | 'CERTIFICADO';

export const NOMBRES_CATEGORIA_EXPEDIENTE: Record<CategoriaExpediente, string> = {
  MATRICULA: 'Documentos de matrícula',
  CERTIFICADO: 'Certificados y diplomas expedidos',
  SALIDA: 'Retiro o traslado de salida',
  TRASLADO: 'Ingreso por traslado y homologación',
  PAZ_Y_SALVO: 'Paz y salvo de fin de año',
  SERVICIO_SOCIAL: 'Servicio social estudiantil',
  INCLUSION: 'Inclusión (PIAR)',
};

export interface ItemExpediente {
  categoria: CategoriaExpediente;
  titulo: string;
  detalle: string | null;
  anio: number | null;
  fecha: string | null;
  estado: string | null;
  codigo?: string;
  huella?: string;
  /** Ruta de la API que sirve el archivo con la sesión (la protege el módulo dueño); null si quien consulta no puede bajarlo. */
  descarga: string | null;
}

export interface ExpedienteDigital {
  estudiante: { _id: string; nombre: string; apellido: string; numero_documento: string };
  items: ItemExpediente[];
}

/** El expediente digital (M29): una vista agregada por estudiante, sin datos propios. Se pide al abrir la pestaña. */
export function useExpedienteDigital(studentId: string | undefined, habilitado: boolean) {
  return useQuery({
    queryKey: ['expediente-digital', studentId],
    queryFn: () => api.get<ExpedienteDigital>(`/students/${studentId}/expediente`),
    enabled: Boolean(studentId) && habilitado,
    staleTime: 30_000,
  });
}

/** Baja el archivo con la sesión del usuario: nunca por URL directa. */
export const descargarArchivoDeExpediente = (ruta: string) => api.downloadBlob(ruta);
