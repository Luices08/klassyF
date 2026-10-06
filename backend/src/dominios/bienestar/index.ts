// Única puerta del dominio: los demás dominios importan de aquí, nunca de sus subcarpetas.
// Las rutas (`./rutas`) las monta solo `routes/index.ts`: no van aquí para no cargar controladores al importar un servicio.
export { crearDesdeMatricula } from './inclusion/solicitudApoyo.service';
