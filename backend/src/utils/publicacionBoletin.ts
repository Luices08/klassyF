export type OrigenAccesoBoletin = 'EXCEPCION' | 'GRUPO' | 'SIN_PUBLICAR';

export interface PublicacionPlana {
  publicado: boolean;
  excepciones: Array<{ student_id: string; permitir: boolean }>;
}

export interface AccesoBoletin {
  visible: boolean;
  origen: OrigenAccesoBoletin;
}

/**
 * Si la familia de un estudiante puede ver su boletín. Una excepción del estudiante manda sobre el grupo (en cualquier sentido);
 * sin excepción, vale lo que se decidió para el grupo; sin publicación, no se ve. Función pura: el servicio solo le pasa los datos.
 */
export function accesoFamilia(publicacion: PublicacionPlana | null, studentId: string): AccesoBoletin {
  const excepcion = publicacion?.excepciones.find((e) => e.student_id === studentId);
  if (excepcion) return { visible: excepcion.permitir, origen: 'EXCEPCION' };
  if (publicacion?.publicado) return { visible: true, origen: 'GRUPO' };
  return { visible: false, origen: 'SIN_PUBLICAR' };
}
