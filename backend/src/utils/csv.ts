/**
 * Parser CSV minimo (sin dependencia externa: evita el historial de CVEs sin
 * parche de librerias tipo `xlsx` al procesar archivos subidos por usuarios).
 * Soporta comillas dobles, comas dentro de campos citados y comillas escapadas ("").
 */
export function parseCsv(contenido: string): string[][] {
  const filas: string[][] = [];
  let fila: string[] = [];
  let campo = '';
  let dentroDeComillas = false;

  const texto = contenido.replace(/\r\n/g, '\n').replace(/\r/g, '\n');

  for (let i = 0; i < texto.length; i++) {
    const char = texto[i];

    if (dentroDeComillas) {
      if (char === '"') {
        if (texto[i + 1] === '"') {
          campo += '"';
          i++;
        } else {
          dentroDeComillas = false;
        }
      } else {
        campo += char;
      }
      continue;
    }

    if (char === '"') {
      dentroDeComillas = true;
    } else if (char === ',') {
      fila.push(campo);
      campo = '';
    } else if (char === '\n') {
      fila.push(campo);
      filas.push(fila);
      fila = [];
      campo = '';
    } else {
      campo += char;
    }
  }

  if (campo.length > 0 || fila.length > 0) {
    fila.push(campo);
    filas.push(fila);
  }

  return filas.filter((f) => f.some((v) => v.trim() !== ''));
}

/** Convierte filas CSV (con encabezado) a objetos { encabezado: valor }. */
export function csvARegistros(filas: string[][]): Array<Record<string, string>> {
  if (filas.length === 0) return [];
  const encabezados = filas[0]!.map((h) => h.trim().toLowerCase());
  return filas.slice(1).map((fila) => {
    const registro: Record<string, string> = {};
    encabezados.forEach((h, idx) => {
      registro[h] = (fila[idx] ?? '').trim();
    });
    return registro;
  });
}
