import { TipoCorreo } from './citaciones';

/** Los correos a la familia que no son una citación (M28 → correo): se arman en `avisoFamiliaCorreo.service`. */
export const TIPOS_AVISO_FAMILIA = ['AVISO_INASISTENCIA', 'AVISO_BOLETIN'] as const satisfies readonly TipoCorreo[];
export type TipoAvisoFamilia = (typeof TIPOS_AVISO_FAMILIA)[number];

/** Espera antes de enviar el aviso de inasistencia: así varias clases del mismo día salen en un solo correo. */
export const MINUTOS_ESPERA_AVISO_INASISTENCIA = 60;
