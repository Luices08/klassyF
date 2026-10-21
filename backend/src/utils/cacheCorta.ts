interface Entrada<T> {
  vence: number;
  valor: Promise<T>;
}

const entradas = new Map<string, Entrada<unknown>>();

/**
 * Reutiliza por unos segundos el resultado de un cálculo caro (los dashboards se refrescan seguido y varios usuarios los abren a la vez). Guarda
 * también la promesa en curso: dos peticiones simultáneas comparten un solo cálculo. Una falla no se guarda, para que el siguiente intento lo repita.
 * La caché vive en el proceso: con varias instancias cada una calcula lo suyo, que es suficiente para datos que se aceptan con segundos de atraso.
 * La clave debe llevar todo lo que cambia el resultado, incluido el alcance de quien consulta si no es el mismo para todos.
 */
export function memorizar<T>(clave: string, ttlMs: number, calcular: () => Promise<T>): Promise<T> {
  const ahora = Date.now();
  const existente = entradas.get(clave) as Entrada<T> | undefined;
  if (existente && existente.vence > ahora) return existente.valor;

  const valor = calcular().catch((error: unknown) => {
    if (entradas.get(clave) === (entrada as Entrada<unknown>)) entradas.delete(clave);
    throw error;
  });
  const entrada: Entrada<T> = { vence: ahora + ttlMs, valor };
  entradas.set(clave, entrada as Entrada<unknown>);
  return valor;
}

/** Vacía la caché (las pruebas la necesitan entre casos para no leer lo de otro). */
export function vaciarCacheCorta(): void {
  entradas.clear();
}
