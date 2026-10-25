import { EnvolturaSitio } from './EnvolturaSitio';
import { COMPONENTES_PLANTILLA, PLANTILLA_POR_DEFECTO } from './plantillas';
import type { PropsPlantilla } from './seccionesSitio';

/** La página pública con la plantilla, tipografía y secciones elegidas. La usan la página del colegio y la vista previa del módulo. */
export function SitioRenderizado(props: PropsPlantilla) {
  const Plantilla = COMPONENTES_PLANTILLA[props.config.plantilla] ?? COMPONENTES_PLANTILLA[PLANTILLA_POR_DEFECTO];
  return (
    <EnvolturaSitio tipografia={props.config.tipografia}>
      <Plantilla {...props} />
    </EnvolturaSitio>
  );
}
