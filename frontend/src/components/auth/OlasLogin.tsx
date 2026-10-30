/**
 * Las olas del panel de marca del login: dos formas azules (los colores de la paleta, con transparencia) que suben desde la esquina inferior derecha. Es solo adorno:
 * va detrás del texto y los lectores de pantalla lo ignoran.
 */
export function OlasLogin() {
  return (
    <svg viewBox="0 0 600 300" preserveAspectRatio="none" aria-hidden="true" className="pointer-events-none absolute bottom-0 right-0 h-2/5 w-full text-primary">
      <path d="M0 300V250C90 215 180 150 290 95C380 50 480 25 600 0V300Z" fill="currentColor" fillOpacity="0.35" />
      <path d="M180 300C250 240 330 190 420 150C490 118 550 100 600 92V300Z" fill="currentColor" fillOpacity="0.75" />
    </svg>
  );
}
