import { type PointerEvent as ReactPointerEvent, useCallback, useEffect, useRef, useState } from 'react';

export interface Punto {
  x: number;
  y: number;
}

const CLAVE_POSICION = 'klassy.asistente.posicion';
// Menos de esto entre bajar y soltar el puntero es un clic, no un arrastre (el dedo o el mouse tiemblan un poco).
const UMBRAL_ARRASTRE_PX = 5;

function margenDe(ancho: number): number {
  return ancho >= 640 ? 24 : 16;
}

function leerGuardada(): Punto | null {
  try {
    const valor = JSON.parse(localStorage.getItem(CLAVE_POSICION) ?? 'null') as Partial<Punto> | null;
    return valor && typeof valor.x === 'number' && typeof valor.y === 'number' ? { x: valor.x, y: valor.y } : null;
  } catch {
    return null;
  }
}

function guardar(punto: Punto): void {
  try {
    localStorage.setItem(CLAVE_POSICION, JSON.stringify(punto));
  } catch {
    // Sin almacenamiento (navegación privada) el botón igual se mueve; solo no se recuerda.
  }
}

function tamanoVentana() {
  return { ancho: window.innerWidth, alto: window.innerHeight };
}

/**
 * Posición de un botón flotante que se arrastra con mouse o dedo, se queda dentro de la ventana y se recuerda en
 * este navegador. Sin posición guardada va abajo a la derecha. `debeIgnorarClic()` dice si el clic que sigue al
 * soltar viene de un arrastre (y no debe abrir nada).
 */
export function useBotonArrastrable(tamano: number) {
  const [ventana, setVentana] = useState(tamanoVentana);
  const [guardada, setGuardada] = useState<Punto | null>(leerGuardada);
  const arrastre = useRef<{ inicio: Punto; origen: Punto; movido: boolean } | null>(null);
  // Momento en que terminó el último arrastre: el clic que el navegador dispara al soltar no debe abrir el chat.
  const finArrastre = useRef(0);

  useEffect(() => {
    const alCambiar = () => setVentana(tamanoVentana());
    window.addEventListener('resize', alCambiar);
    return () => window.removeEventListener('resize', alCambiar);
  }, []);

  const margen = margenDe(ventana.ancho);
  const acotar = useCallback(
    (p: Punto): Punto => ({
      x: Math.min(Math.max(p.x, margen), Math.max(margen, ventana.ancho - tamano - margen)),
      y: Math.min(Math.max(p.y, margen), Math.max(margen, ventana.alto - tamano - margen)),
    }),
    [margen, tamano, ventana]
  );

  const posicion = acotar(guardada ?? { x: ventana.ancho - tamano - margen, y: ventana.alto - tamano - margen });

  function onPointerDown(e: ReactPointerEvent<HTMLElement>) {
    if (e.button !== 0) return;
    arrastre.current = { inicio: { x: e.clientX, y: e.clientY }, origen: posicion, movido: false };
    e.currentTarget.setPointerCapture(e.pointerId);
  }

  function onPointerMove(e: ReactPointerEvent<HTMLElement>) {
    const a = arrastre.current;
    if (!a) return;
    const dx = e.clientX - a.inicio.x;
    const dy = e.clientY - a.inicio.y;
    if (!a.movido && Math.hypot(dx, dy) < UMBRAL_ARRASTRE_PX) return;
    a.movido = true;
    setGuardada(acotar({ x: a.origen.x + dx, y: a.origen.y + dy }));
  }

  function onPointerUp(e: ReactPointerEvent<HTMLElement>) {
    const a = arrastre.current;
    arrastre.current = null;
    if (e.currentTarget.hasPointerCapture(e.pointerId)) e.currentTarget.releasePointerCapture(e.pointerId);
    if (!a?.movido) return;
    finArrastre.current = Date.now();
    guardar(acotar({ x: a.origen.x + e.clientX - a.inicio.x, y: a.origen.y + e.clientY - a.inicio.y }));
  }

  function onPointerCancel() {
    arrastre.current = null;
  }

  function debeIgnorarClic(): boolean {
    return Date.now() - finArrastre.current < 400;
  }

  return {
    posicion,
    ventana,
    margen,
    debeIgnorarClic,
    handlers: { onPointerDown, onPointerMove, onPointerUp, onPointerCancel },
  };
}
