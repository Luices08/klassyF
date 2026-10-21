import { Button } from '../../ui/Button';
import { Logo, MenuEnlaces, SeccionesVisibles, TextoHero, enlacesDeMenu, type PropsPlantilla } from '../seccionesSitio';

/** Menú fijo a la izquierda con el logo arriba; en pantallas pequeñas pasa a ser una franja superior. Sin carrusel. */
export function PlantillaLateral(props: PropsPlantilla) {
  const { info, config, acciones, vistaPrevia } = props;
  return (
    <div className={`${vistaPrevia ? '' : 'min-h-screen'} flex flex-col bg-soft text-body lg:flex-row`}>
      <aside
        className={`flex shrink-0 flex-col gap-6 border-b border-border bg-surface p-5 lg:w-64 lg:self-start lg:border-b-0 lg:border-r ${
          vistaPrevia ? 'lg:min-h-[900px]' : 'lg:sticky lg:top-0 lg:h-screen'
        }`}
      >
        <div className="flex flex-col items-start gap-3">
          <Logo info={info} className="h-14 w-14" />
          <span className="text-h3 text-ink">{info.nombre}</span>
        </div>
        <MenuEnlaces enlaces={enlacesDeMenu(config)} vertical vistaPrevia={vistaPrevia} className="hidden lg:flex" />
        <Button className="mt-auto" onClick={acciones.iniciarSesion}>
          Iniciar sesión
        </Button>
      </aside>
      <div className="min-w-0 flex-1">
        <section id="inicio" className="mx-auto max-w-5xl px-4 py-16 sm:px-6">
          <TextoHero info={info} acciones={acciones} centrado={false} />
        </section>
        <SeccionesVisibles info={info} config={config} acciones={acciones} />
      </div>
    </div>
  );
}
