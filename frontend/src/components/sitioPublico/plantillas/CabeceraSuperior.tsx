import { Button } from '../../ui/Button';
import { Logo, MenuEnlaces, enlacesDeMenu, type PropsPlantilla } from '../seccionesSitio';

/** Cabecera de las plantillas con barra superior: el logo va a la izquierda o centrado y el menú en la misma fila o debajo del logo. */
export function CabeceraSuperior({ info, config, acciones, vistaPrevia }: Pick<PropsPlantilla, 'info' | 'config' | 'acciones' | 'vistaPrevia'>) {
  const enlaces = enlacesDeMenu(config);
  const centrado = config.logo_posicion === 'centro';
  const marca = (
    <div className="flex items-center gap-2">
      <Logo info={info} />
      <span className="text-h3 text-ink">{info.nombre}</span>
    </div>
  );
  const ingreso = <Button onClick={acciones.iniciarSesion}>Iniciar sesión</Button>;
  const menu = <MenuEnlaces enlaces={enlaces} vistaPrevia={vistaPrevia} />;

  return (
    <header className="sticky top-0 z-30 border-b border-border bg-surface/95 backdrop-blur">
      <div className="mx-auto max-w-6xl px-4 sm:px-6">
        {config.menu_posicion === 'bajo_logo' ? (
          <div className="py-3">
            <div className={`flex items-center gap-4 ${centrado ? 'justify-center' : 'justify-between'}`}>
              {marca}
              <div className={centrado ? 'absolute right-4 sm:right-6' : ''}>{ingreso}</div>
            </div>
            <div className={`mt-3 hidden sm:flex ${centrado ? 'justify-center' : ''}`}>{menu}</div>
          </div>
        ) : centrado ? (
          <div className="grid h-16 grid-cols-[1fr_auto_1fr] items-center gap-4">
            <div className="hidden sm:block">{menu}</div>
            <div className="col-start-2">{marca}</div>
            <div className="flex justify-end">{ingreso}</div>
          </div>
        ) : (
          <div className="flex h-16 items-center justify-between gap-4">
            {marca}
            <div className="hidden sm:block">{menu}</div>
            {ingreso}
          </div>
        )}
      </div>
    </header>
  );
}
