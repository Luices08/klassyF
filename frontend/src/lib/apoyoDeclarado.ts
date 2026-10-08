export interface ApoyoDeclarado {
  declara: boolean;
  motivo_declarado: string;
  aporta_soporte: boolean;
  observacion: string;
}

export const APOYO_VACIO: ApoyoDeclarado = { declara: false, motivo_declarado: '', aporta_soporte: false, observacion: '' };

/** Lo que se envía al servidor: nada si la familia no declara apoyos, y solo lo declarado (sin diagnosticar) si sí. */
export function aApoyoDeclarado(a: ApoyoDeclarado) {
  return a.declara && a.motivo_declarado.trim().length >= 3
    ? { motivo_declarado: a.motivo_declarado.trim(), aporta_soporte: a.aporta_soporte, observacion: a.observacion.trim() || undefined }
    : undefined;
}

