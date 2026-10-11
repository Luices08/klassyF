import {
  ESCUDO_TAMANO_MAXIMO,
  ESCUDO_TAMANO_MINIMO,
  MAX_FIRMAS_BOLETIN,
  MAX_LINEAS_COMPROMISOS,
  MAX_OPCIONES_PROMOCION,
  MIN_LINEAS_COMPROMISOS,
  PLANTILLA_BOLETIN_INICIAL,
  PlantillaBoletin,
  SECCIONES_BOLETIN,
  SeccionPlantilla,
} from '../constants/boletin';

type Parcial<T> = { [K in keyof T]?: T[K] extends Array<infer U> ? U[] : T[K] extends object ? Parcial<T[K]> : T[K] };

const COLOR_HEX = /^#[0-9a-fA-F]{6}$/;

/**
 * Las secciones guardadas conservan su orden, título y visibilidad. Una sección que el sistema agregó después (y por eso no está guardada) entra con su
 * valor de partida justo después de la sección que la antecede en el diseño original (o al principio, si no tiene antecesora guardada), para que una
 * función nueva aparezca en su lugar natural y no arrumbada al final. Una clave desconocida o repetida se descarta.
 */
function completarSecciones(guardadas: Array<Partial<SeccionPlantilla>> | undefined): SeccionPlantilla[] {
  const inicial = new Map(PLANTILLA_BOLETIN_INICIAL.secciones.map((s) => [s.clave, s]));
  const vistas = new Set<string>();
  const resultado: SeccionPlantilla[] = [];
  for (const s of guardadas ?? []) {
    const base = s.clave && SECCIONES_BOLETIN.includes(s.clave) ? inicial.get(s.clave) : undefined;
    if (!base || vistas.has(base.clave)) continue;
    vistas.add(base.clave);
    resultado.push({ clave: base.clave, titulo: s.titulo ?? base.titulo, visible: s.visible ?? base.visible });
  }
  PLANTILLA_BOLETIN_INICIAL.secciones.forEach((base, indice) => {
    if (vistas.has(base.clave)) return;
    const antecesora = indice > 0 ? resultado.findIndex((s) => s.clave === PLANTILLA_BOLETIN_INICIAL.secciones[indice - 1]?.clave) : -1;
    resultado.splice(antecesora + 1, 0, { ...base });
    vistas.add(base.clave);
  });
  return resultado;
}

const acotar = (valor: number, minimo: number, maximo: number): number => Math.min(maximo, Math.max(minimo, Math.round(valor)));

/**
 * Completa lo que falte de una plantilla guardada (o de un borrador a medias) con el diseño original y corrige lo que no se puede
 * imprimir (tamaño del escudo fuera de rango, color inválido, más firmas u opciones de las permitidas). Pura: la usan el PDF, la API y las pruebas.
 */
export function completarPlantilla(parcial: Parcial<PlantillaBoletin> | null | undefined): PlantillaBoletin {
  const i = PLANTILLA_BOLETIN_INICIAL;
  const p = parcial ?? {};
  return {
    titulo: p.titulo ?? i.titulo,
    subtitulo: p.subtitulo ?? i.subtitulo,
    mostrar_datos_institucion: p.mostrar_datos_institucion ?? i.mostrar_datos_institucion,
    mostrar_sede_jornada: p.mostrar_sede_jornada ?? i.mostrar_sede_jornada,
    escudo: {
      mostrar: p.escudo?.mostrar ?? i.escudo.mostrar,
      posicion: p.escudo?.posicion ?? i.escudo.posicion,
      tamano: acotar(p.escudo?.tamano ?? i.escudo.tamano, ESCUDO_TAMANO_MINIMO, ESCUDO_TAMANO_MAXIMO),
      url: p.escudo?.url ?? null,
    },
    color_acento: p.color_acento && COLOR_HEX.test(p.color_acento) ? p.color_acento : i.color_acento,
    papel: p.papel ?? i.papel,
    fuente: p.fuente ?? i.fuente,
    tamano_texto: p.tamano_texto ?? i.tamano_texto,
    secciones: completarSecciones(p.secciones),
    estudiante: { ...i.estudiante, ...p.estudiante },
    asignaturas: { ...i.asignaturas, ...p.asignaturas },
    rotulos: { ...i.rotulos, ...p.rotulos },
    textos: { ...i.textos, ...p.textos },
    texto_apoyo: p.texto_apoyo ?? i.texto_apoyo,
    compromisos_lineas: acotar(p.compromisos_lineas ?? i.compromisos_lineas, MIN_LINEAS_COMPROMISOS, MAX_LINEAS_COMPROMISOS),
    promocion_opciones: (p.promocion_opciones ?? i.promocion_opciones).filter((o) => o.trim()).slice(0, MAX_OPCIONES_PROMOCION),
    firmas: (p.firmas ?? i.firmas)
      .slice(0, MAX_FIRMAS_BOLETIN)
      .map((f) => ({ cargo: f.cargo ?? '', nombre: f.nombre ?? '', usa_director_grupo: f.usa_director_grupo ?? false })),
    pie_texto: p.pie_texto ?? i.pie_texto,
  };
}

/** Reemplaza las marcas `{nombre}` de un texto del colegio; una marca desconocida se deja tal cual para que el error se note en el PDF. */
export function rellenarTexto(texto: string, valores: Record<string, string | number>): string {
  return texto.replace(/\{(\w+)\}/g, (marca, nombre: string) => (nombre in valores ? String(valores[nombre]) : marca));
}
