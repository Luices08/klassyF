import type { ComponentType } from 'react';
import type { PropsPlantilla } from '../seccionesSitio';
import { PlantillaClasica } from './PlantillaClasica';
import { PlantillaGaleria } from './PlantillaGaleria';
import { PlantillaLateral } from './PlantillaLateral';

/** Una plantilla nueva: su entrada en `PLANTILLAS_SITIO` (backend) y su componente aquí con el mismo id. */
export const COMPONENTES_PLANTILLA: Record<string, ComponentType<PropsPlantilla>> = {
  clasica: PlantillaClasica,
  galeria: PlantillaGaleria,
  lateral: PlantillaLateral,
};

export const PLANTILLA_POR_DEFECTO = 'clasica';
