import { CarruselSitio } from '../CarruselSitio';
import { SeccionesVisibles, TextoHero, type PropsPlantilla } from '../seccionesSitio';
import { CabeceraSuperior } from './CabeceraSuperior';

/** Titular a la izquierda y carrusel a la derecha; en pantallas pequeñas el carrusel pasa debajo del titular. */
export function PlantillaDividida(props: PropsPlantilla) {
  const { info, config, acciones, imagenes, vistaPrevia } = props;
  return (
    <div className={`${vistaPrevia ? '' : 'min-h-screen'} bg-soft text-body`}>
      <CabeceraSuperior info={info} config={config} acciones={acciones} vistaPrevia={vistaPrevia} />
      <section id="inicio" className="mx-auto grid max-w-6xl grid-cols-1 items-center gap-10 px-4 py-14 sm:px-6 lg:grid-cols-2">
        <TextoHero info={info} acciones={acciones} centrado={false} />
        <CarruselSitio imagenes={imagenes} className="h-72 w-full rounded-2xl shadow-lg sm:h-96" />
      </section>
      <SeccionesVisibles info={info} config={config} acciones={acciones} />
    </div>
  );
}
