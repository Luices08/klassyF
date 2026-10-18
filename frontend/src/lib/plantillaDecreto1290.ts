import type { PoliticaPromocion } from '../hooks/usePromocion';

/**
 * Valores típicos del Decreto 1290 que el directivo puede ajustar antes de guardar. Solo rellena el formulario: no guarda nada ni
 * toca las reglas personalizadas, los grados, las críticas ni el arrastre que el colegio ya haya definido.
 */
export function aplicarPlantillaDecreto1290(actual: PoliticaPromocion): PoliticaPromocion {
  return {
    ...actual,
    unidad: 'AMBAS',
    inasistencia: { activa: true, porcentaje: 25, faltas: 'SOLO_INJUSTIFICADAS' },
    umbrales: { recuperacion_hasta: 2, reprueba_desde_areas: 2, efecto_nota_recuperacion: 'LIMITA_A_APROBATORIA' },
    sin_regla: { cierre: 'PENDIENTE_RECUPERACION', tras_recuperacion: 'NO_PROMUEVE' },
    piar: { derivar_a_comision: true },
  };
}
