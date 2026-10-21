import { CarruselSitio } from '../CarruselSitio';
import { SeccionesVisibles, TextoHero, type PropsPlantilla } from '../seccionesSitio';
import { CabeceraSuperior } from './CabeceraSuperior';

/** Carrusel a todo el ancho con el titular sobre un panel claro, para que el color elegido siempre se lea. */
export function PlantillaGaleria(props: PropsPlantilla) {
  const { info, config, acciones, imagenes, vistaPrevia } = props;
  return (
    <div className={`${vistaPrevia ? '' : 'min-h-screen'} bg-soft text-body`}>
      <CabeceraSuperior info={info} config={config} acciones={acciones} vistaPrevia={vistaPrevia} />
      <section id="inicio" className="relative">
        <CarruselSitio imagenes={imagenes} className="h-[26rem] w-full sm:h-[32rem]" />
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center px-4">
          <div className="pointer-events-auto max-w-3xl rounded-2xl bg-surface/90 px-6 py-8 shadow-lg backdrop-blur sm:px-10">
            <TextoHero info={info} acciones={acciones} />
          </div>
        </div>
      </section>
      <SeccionesVisibles info={info} config={config} acciones={acciones} />
    </div>
  );
}
