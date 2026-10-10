import { useEffect, useState } from 'react';

/** El valor de `valor` pero solo después de `ms` sin cambios: sirve para pedir al servidor cuando se deja de escribir, no en cada tecla. */
export function useDebouncedValue<T>(valor: T, ms = 600): T {
  const [retrasado, setRetrasado] = useState(valor);
  useEffect(() => {
    const temporizador = setTimeout(() => setRetrasado(valor), ms);
    return () => clearTimeout(temporizador);
  }, [valor, ms]);
  return retrasado;
}
