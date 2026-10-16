import type { Rol } from '../types/api';

/** A dónde llega cada perfil al abrir sesión: el acudiente tiene su propio portal (M27); el resto, el panel de inicio. */
export const rutaInicialDe = (rol: Rol): string => (rol === 'ACUDIENTE' ? '/portal' : '/panel');
