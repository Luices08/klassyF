import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../lib/apiClient';
import type { EstadoDocumentoMatricula, EstadoMatricula, InasistenciaEstudiante, TipoDocumentoMatricula } from '../types/domain';
import type { ObservacionPropia } from './useObservaciones';
import type { MisNotas } from './useNotas';

/**
 * Portal del acudiente (M27). Todo cuelga del estudiante elegido en el selector: el id viaja en la `queryKey` y en la ruta, así al cambiar de
 * hijo cada componente pide sus datos de nuevo (y el servidor vuelve a comprobar que ese estudiante es del acudiente).
 */

export interface HijoDelPortal {
  student_id: string;
  nombre: string;
  apellido: string;
  numero_documento: string;
  parentesco: string;
  es_principal: boolean;
  matricula: { enrollment_id: string; estado: EstadoMatricula; anio: number; grado: string; grupo: string; sede: string; jornada: string } | null;
  /** Documentos obligatorios sin aprobar (solo mientras la matrícula sigue pidiéndolos). */
  documentos_pendientes: number;
}

export function useHijos() {
  return useQuery({ queryKey: ['portal', 'hijos'], queryFn: () => api.get<HijoDelPortal[]>('/portal/hijos'), staleTime: 30_000 });
}

// --- Notas, inasistencias y convivencia ---

export function useNotasDelHijo(studentId: string | undefined, periodoNumero: number | undefined, academicYearId?: string) {
  return useQuery({
    queryKey: ['portal', studentId, 'notas', academicYearId ?? null, periodoNumero],
    queryFn: () => api.get<MisNotas>(`/portal/hijos/${studentId}/notas`, { periodo_numero: periodoNumero, academic_year_id: academicYearId }),
    enabled: Boolean(studentId && periodoNumero),
    staleTime: 15_000,
  });
}

export interface InasistenciasDelHijo {
  anio: number;
  resumen: { total: number; justificadas: number; injustificadas: number };
  data: InasistenciaEstudiante[];
}

export function useInasistenciasDelHijo(studentId: string | undefined, periodoNumero?: number) {
  return useQuery({
    queryKey: ['portal', studentId, 'inasistencias', periodoNumero ?? null],
    queryFn: () => api.get<InasistenciasDelHijo>(`/portal/hijos/${studentId}/inasistencias`, { periodo_numero: periodoNumero }),
    enabled: Boolean(studentId),
    staleTime: 15_000,
  });
}

export function useConvivenciaDelHijo(studentId: string | undefined) {
  return useQuery({
    queryKey: ['portal', studentId, 'convivencia'],
    queryFn: () => api.get<ObservacionPropia[]>(`/portal/hijos/${studentId}/convivencia`),
    enabled: Boolean(studentId),
    staleTime: 60_000,
  });
}

// --- Documentos de matrícula (M04) ---

export interface DocumentoDelPortal {
  tipo_documento: TipoDocumentoMatricula;
  nombre: string;
  indicacion: string;
  obligatorio?: boolean;
  estado: EstadoDocumentoMatricula;
  comentario: string | null;
  fecha_carga: string | null;
  puede_subir: boolean;
}

export interface DocumentosDelHijo {
  enrollment_id: string;
  grado: string;
  grupo: string;
  fecha_limite_legalizacion: string | null;
  plazo_vencido: boolean;
  matricula_estado: EstadoMatricula;
  folio_matricula: string | null;
  puede_subir_documentos: boolean;
  pendientes: number;
  documentos: DocumentoDelPortal[];
}

export function useDocumentosDelHijo(studentId: string | undefined) {
  return useQuery({
    queryKey: ['portal', studentId, 'documentos'],
    queryFn: () => api.get<DocumentosDelHijo | null>(`/portal/hijos/${studentId}/documentos`),
    enabled: Boolean(studentId),
    staleTime: 15_000,
  });
}

export function useSubirDocumentoDelHijo(studentId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ tipoDocumento, file }: { tipoDocumento: TipoDocumentoMatricula; file: File }) => {
      const formData = new FormData();
      formData.append('file', file);
      return api.upload<DocumentosDelHijo>(`/portal/hijos/${studentId}/documentos/${tipoDocumento}`, formData);
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['portal', studentId, 'documentos'] });
      // El contador de pendientes del selector sale de la lista de hijos.
      void queryClient.invalidateQueries({ queryKey: ['portal', 'hijos'] });
      // Secretaría lo ve en su bandeja «Documentos por revisar».
      void queryClient.invalidateQueries({ queryKey: ['enrollments'] });
    },
  });
}

// --- Certificados de autoservicio (M26) ---

export interface TipoCertificadoAutoservicio {
  clave: string;
  nombre: string;
  descripcion: string;
  destinatarios: Array<{ clave: string; etiqueta: string }>;
  disponible: boolean;
  motivo: string | null;
}

export interface CertificadoDelPortal {
  _id: string;
  tipo: string;
  nombre_tipo: string;
  codigo: string;
  estado: 'VIGENTE' | 'ANULADO';
  grado: string;
  anio: number;
  destinatario: string;
  fecha_emision: string;
}

export interface CertificadosDelHijo {
  tipos: TipoCertificadoAutoservicio[];
  emitidos: CertificadoDelPortal[];
}

export function useCertificadosDelHijo(studentId: string | undefined) {
  return useQuery({
    queryKey: ['portal', studentId, 'certificados'],
    queryFn: () => api.get<CertificadosDelHijo>(`/portal/hijos/${studentId}/certificados`),
    enabled: Boolean(studentId),
    staleTime: 15_000,
  });
}

export function useGenerarCertificadoDelHijo(studentId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (entrada: { tipo: string; destinatario?: { clave: string; otro?: string } }) => api.post<CertificadoDelPortal>(`/portal/hijos/${studentId}/certificados`, entrada),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['portal', studentId, 'certificados'] });
      // Secretaría lo ve en su historial de documentos expedidos.
      void queryClient.invalidateQueries({ queryKey: ['certificados'] });
    },
  });
}

export const descargarPdfCertificadoDelHijo = (studentId: string, certificadoId: string) => api.downloadBlob(`/portal/hijos/${studentId}/certificados/${certificadoId}/pdf`);
