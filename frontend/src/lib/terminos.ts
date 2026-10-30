// Los textos y sus versiones viven en el backend (`constants/terminos.ts`) y llegan por `GET /public/terminos`.
export type TipoTerminos = 'GENERAL' | 'DOCENTE' | 'ESTUDIANTE' | 'ADMINISTRATIVO';

export interface SeccionTerminos {
  titulo: string;
  parrafos: string[];
}

export interface DocumentoTerminos {
  tipo: TipoTerminos;
  titulo: string;
  version: string;
  vigente_desde: string;
  introduccion: string;
  secciones: SeccionTerminos[];
}

export interface TerminoPendiente {
  tipo: TipoTerminos;
  version: string;
}

export function conInstitucion(texto: string, institucion: string): string {
  return texto.replaceAll('{institucion}', institucion);
}

// Antes de iniciar sesión no hay a quién atribuir la aceptación: los generales se recuerdan por navegador. Ya con sesión, la
// constancia se guarda en el servidor; si la persona los acaba de aceptar en esta misma pestaña, no se le vuelven a mostrar.
const CLAVE_NAVEGADOR = 'klassy.terminos.GENERAL';
const CLAVE_PESTANA = 'klassy.terminos.GENERAL.pestana';

export function generalesAceptadosEnNavegador(version: string): boolean {
  try {
    return localStorage.getItem(CLAVE_NAVEGADOR) === version;
  } catch {
    return false;
  }
}

export function generalesAceptadosEnEstaPestana(version: string): boolean {
  try {
    return sessionStorage.getItem(CLAVE_PESTANA) === version;
  } catch {
    return false;
  }
}

export function guardarGeneralesEnNavegador(version: string): void {
  try {
    localStorage.setItem(CLAVE_NAVEGADOR, version);
    sessionStorage.setItem(CLAVE_PESTANA, version);
  } catch {
    // Sin almacenamiento (ventana privada): la aceptación vale mientras la pestaña siga abierta.
  }
}
