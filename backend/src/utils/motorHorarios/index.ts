export { aplicaA, coincideAlcance, especificidad, resolverVariables } from './alcance';
export { EstadoHorario, PESO_ASIGNATURA_MISMO_DIA, PESO_ASIGNATURA_SEGUIDA, PESO_BLOQUE_PARTIDO, PESO_DURO } from './evaluacion';
export { ajustarBloquesATramos, tramosDeSemana } from './bloques';
export { evaluarHorario, generarHorario } from './generador';
export type { OpcionesGeneracion, ResultadoMotor, UbicacionSesion } from './generador';
export { construirEstructura, diagnosticarCapacidad, expandirSesiones } from './sesiones';
export * from './tipos';
export { generarEnHilo } from './hilo';
