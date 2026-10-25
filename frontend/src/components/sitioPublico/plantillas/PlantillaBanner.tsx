import { CarruselSitio } from '../CarruselSitio';
import { SeccionesVisibles, TextoHero, type PropsPlantilla } from '../seccionesSitio';
import { CabeceraSuperior } from './CabeceraSuperior';

/** Carrusel bajo la barra superior y el titular debajo, sobre el fondo: las imágenes no tapan el texto. */
export function PlantillaBanner(props: PropsPlantilla) {
  const { info, config, acciones, imagenes, vistaPrevia } = props;
  return (
    <div className={`${vistaPrevia ? '' : 'min-h-screen'} bg-soft text-body`}>
      <CabeceraSuperior info={info} config={config} acciones={acciones} vistaPrevia={vistaPrevia} />
      <section id="inicio">
        <CarruselSitio imagenes={imagenes} className="h-64 w-full sm:h-80" />
        <div className="mx-auto max-w-6xl px-4 py-12 sm:px-6">
          <TextoHero info={info} acciones={acciones} />
        </div>
      </section>
      <SeccionesVisibles info={info} config={config} acciones={acciones} />
    </div>
  );
}
