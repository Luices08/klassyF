/** Punto rojo con número (puntos del menú y de las pestañas, M28). No se dibuja con 0. */
export function ContadorInsignia({ valor }: { valor: number }) {
  if (valor <= 0) return null;
  return (
    <span
      aria-label={`${valor} novedades`}
      className="ml-auto inline-flex min-w-[20px] items-center justify-center rounded-full bg-danger px-1.5 text-[11px] font-semibold leading-5 text-white"
    >
      {valor > 99 ? '99+' : valor}
    </span>
  );
}
