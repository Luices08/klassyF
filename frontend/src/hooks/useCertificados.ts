import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../lib/apiClient';

// --- Catálogos de la pantalla (el contrato lo fija el backend: constants/certificados.ts) ---

export type ClaveCertificado = 'CONSTANCIA_ESTUDIO' | 'CERTIFICADO_MATRICULA';
export type ElementoAutenticacion = 'rectoria' | 'secretaria' | 'sello';
export type ModoElemento = 'NO_APLICA' | 'OPCIONAL_APAGADO' | 'OPCIONAL_ENCENDIDO' | 'OBLIGATORIO';
export type EstadoCertificado = 'VIGENTE' | 'ANULADO';

export const ELEMENTOS_AUTENTICACION: ElementoAutenticacion[] = ['rectoria', 'secretaria', 'sello'];
export const ETIQUETA_ELEMENTO: Record<ElementoAutenticacion, string> = {
  rectoria: 'Firma de Rectoría',
  secretaria: 'Firma de Secretaría Académica',
  sello: 'Sello institucional',
};
export const MODOS_ELEMENTO: { codigo: ModoElemento; nombre: string }[] = [
  { codigo: 'OPCIONAL_ENCENDIDO', nombre: 'Opcional · encendido' },
  { codigo: 'OPCIONAL_APAGADO', nombre: 'Opcional · apagado' },
  { codigo: 'OBLIGATORIO', nombre: 'Obligatorio' },
  { codigo: 'NO_APLICA', nombre: 'No aplica' },
];

/** Solo los estados con los que se expide algo (la matrícula formalizada o retirada). */
export const ETIQUETA_ESTADO_MATRICULA: Record<string, string> = {
  MATRICULADO_CONDICIONAL: 'Matriculado (condicional)',
  MATRICULADO_DEFINITIVO: 'Matriculado (definitivo)',
  RETIRADO: 'Retirado',
};

export interface EstadoDeElemento {
  valor_inicial: boolean;
  bloqueado: boolean;
  obligatorio: boolean;
  disponible: boolean;
  motivo: string | null;
}

export interface FirmanteConfigurado {
  usuario_id: string | null;
  nombre: string | null;
  cargo: string;
  tiene_imagen: boolean;
}

export interface ConfiguracionCertificados {
  rectoria: FirmanteConfigurado;
  secretaria: FirmanteConfigurado;
  sello: { tiene_imagen: boolean };
  permitir_firma_rectoria_a_secretaria: boolean;
  politica: Record<ClaveCertificado, Record<ElementoAutenticacion, ModoElemento>>;
  tipos: { clave: ClaveCertificado; nombre: string; descripcion: string; elementos: Record<ElementoAutenticacion, EstadoDeElemento> }[];
}

export interface CambiosConfiguracionCertificados {
  rectoria?: { usuario_id?: string | null; cargo?: string };
  secretaria?: { usuario_id?: string | null; cargo?: string };
  permitir_firma_rectoria_a_secretaria?: boolean;
  politica?: Partial<Record<ClaveCertificado, Partial<Record<ElementoAutenticacion, ModoElemento>>>>;
}

export interface MatriculaExpedible {
  _id: string;
  anio: number;
  grado: string;
  grupo: string;
  estado: string;
  folio_matricula: string | null;
  tipos: ClaveCertificado[];
}

export interface CertificadoExpedido {
  _id: string;
  tipo: ClaveCertificado;
  nombre_tipo: string;
  codigo: string;
  estado: EstadoCertificado;
  student_id: string;
  estudiante: string;
  documento: string;
  grado: string;
  anio: number | null;
  destinatario: string | null;
  firmas: Record<ElementoAutenticacion, boolean>;
  fecha_emision: string;
  emitido_por: string | null;
  huella: string;
  anulacion: { fecha: string; motivo: string } | null;
}

export interface EntradaExpedicion {
  enrollment_id: string;
  tipo: ClaveCertificado;
  destinatario?: string | null;
  firmas: Partial<Record<ElementoAutenticacion, boolean>>;
}

export interface FiltroCertificados {
  student_id?: string;
  tipo?: ClaveCertificado;
  estado?: EstadoCertificado;
  pagina?: number;
}

// --- Configuración (firmas y sellos) ---

export function useConfiguracionCertificados() {
  return useQuery({ queryKey: ['certificados', 'configuracion'], queryFn: () => api.get<ConfiguracionCertificados>('/certificados/configuracion') });
}

export function useActualizarConfiguracionCertificados() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (cambios: CambiosConfiguracionCertificados) => api.put<ConfiguracionCertificados>('/certificados/configuracion', cambios),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['certificados'] });
    },
  });
}

export function useSubirImagenCertificado() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ elemento, archivo }: { elemento: ElementoAutenticacion; archivo: File }) => {
      const formData = new FormData();
      formData.append('file', archivo);
      return api.upload<ConfiguracionCertificados>(`/certificados/configuracion/imagenes/${elemento}`, formData);
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['certificados'] });
    },
  });
}

export function useQuitarImagenCertificado() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (elemento: ElementoAutenticacion) => api.delete<ConfiguracionCertificados>(`/certificados/configuracion/imagenes/${elemento}`),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['certificados'] });
    },
  });
}

/** La imagen es de acceso autenticado: se baja con el token y se muestra como blob, nunca por URL directa. */
export function useImagenCertificado(elemento: ElementoAutenticacion, tieneImagen: boolean) {
  return useQuery({
    queryKey: ['certificados', 'imagen', elemento, tieneImagen],
    queryFn: async () => (await api.downloadBlob(`/certificados/configuracion/imagenes/${elemento}`)).url,
    enabled: tieneImagen,
    staleTime: 0,
  });
}

// --- Expedición ---

export function useMatriculasExpedibles(studentId: string | undefined) {
  return useQuery({
    queryKey: ['certificados', 'matriculas', studentId],
    queryFn: () =>
      api.get<{ estudiante: { _id: string; nombre: string; apellido: string; numero_documento: string }; matriculas: MatriculaExpedible[] }>(`/certificados/estudiantes/${studentId}/matriculas`),
    enabled: Boolean(studentId),
  });
}

export function useExpedirCertificado() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (entrada: EntradaExpedicion) => api.post<CertificadoExpedido>('/certificados', entrada),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['certificados', 'lista'] });
    },
  });
}

/** El PDF de la vista previa no guarda nada: es el mismo documento sin consecutivo, huella ni QR. */
export async function abrirVistaPrevia(entrada: EntradaExpedicion): Promise<void> {
  const { url } = await api.downloadBlob('/certificados/vista-previa', { method: 'POST', body: entrada });
  window.open(url, '_blank');
}

export async function abrirPdfCertificado(id: string): Promise<void> {
  const { url } = await api.downloadBlob(`/certificados/${id}/pdf`);
  window.open(url, '_blank');
}

// --- Historial ---

export function useCertificados(filtro: FiltroCertificados) {
  return useQuery({
    queryKey: ['certificados', 'lista', filtro],
    queryFn: () =>
      api.raw<{ success: true; data: CertificadoExpedido[]; total: number; page: number; pages: number }>('/certificados', { query: { ...filtro, limite: 15 } }),
    select: (res) => ({ data: res.data, total: res.total, page: res.page, pages: res.pages }),
  });
}

export function useAnularCertificado() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, motivo }: { id: string; motivo: string }) => api.post<CertificadoExpedido>(`/certificados/${id}/anular`, { motivo }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['certificados', 'lista'] });
    },
  });
}

export function useVerificarIntegridadCertificado() {
  return useMutation({ mutationFn: (id: string) => api.get<{ codigo: string; estado: EstadoCertificado; integro: boolean }>(`/certificados/${id}/integridad`) });
}

// --- Verificación pública (sin sesión) ---

export interface ResultadoVerificacion {
  resultado: 'VALIDO' | 'ANULADO' | 'NO_VERIFICABLE';
  tipo: string;
  codigo: string;
  fecha_emision: string;
  institucion: string;
  estudiante?: string;
  documento?: string;
  anulado_el?: string | null;
  mensaje?: string;
}

export interface ConsultaVerificacion {
  token?: string;
  codigo?: string;
  clave?: string;
}

export function useVerificacionPublica(consulta: ConsultaVerificacion | null) {
  return useQuery({
    queryKey: ['public', 'certificados', 'verificar', consulta],
    queryFn: () => api.get<ResultadoVerificacion>('/public/certificados/verificar', { ...consulta }),
    enabled: consulta !== null,
    retry: false,
    staleTime: 0,
  });
}
