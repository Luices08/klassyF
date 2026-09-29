import { Chip } from './Badge';
import { ChevronDownIcon } from './icons';
import { Table, TableBody, TableHead, Td, Th } from './Table';

export interface ColumnaGuia {
  nombre: string;
  obligatoria: boolean;
  /** Qué formato o valores acepta la columna. */
  formato: string;
  ejemplo: string;
}

interface GuiaColumnasProps {
  titulo?: string;
  /** Reglas generales del archivo (separador, codificación, tamaño...). */
  notas?: string[];
  columnas: ColumnaGuia[];
}

/**
 * Guía colapsable de un archivo de carga masiva: reglas generales y una tabla con el formato
 * que espera cada columna. Reemplaza el texto plano con la lista de encabezados.
 */
export function GuiaColumnas({ titulo = 'Guía de columnas y formato', notas = [], columnas }: GuiaColumnasProps) {
  return (
    <details className="group rounded-xl border border-border bg-surface">
      <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-4 py-3 text-sm font-semibold text-ink [&::-webkit-details-marker]:hidden">
        <span>
          {titulo} <span className="font-normal text-muted">· {columnas.length} columnas</span>
        </span>
        <ChevronDownIcon className="h-4 w-4 shrink-0 text-muted transition-transform group-open:rotate-180" />
      </summary>

      <div className="space-y-3 border-t border-border px-4 py-3">
        {notas.length > 0 && (
          <ul className="list-disc space-y-1 pl-4 text-xs text-body">
            {notas.map((nota) => (
              <li key={nota}>{nota}</li>
            ))}
          </ul>
        )}

        <div className="max-h-96 overflow-y-auto rounded-xl">
          <Table>
            <TableHead>
              <Th>Columna</Th>
              <Th>Obligatoria</Th>
              <Th>Formato o valores válidos</Th>
              <Th>Ejemplo</Th>
            </TableHead>
            <TableBody>
              {columnas.map((c) => (
                <tr key={c.nombre}>
                  <Td className="whitespace-nowrap font-mono text-xs font-semibold text-ink">{c.nombre}</Td>
                  <Td>
                    <Chip tone={c.obligatoria ? 'green' : 'neutral'}>{c.obligatoria ? 'Sí' : 'No'}</Chip>
                  </Td>
                  <Td className="text-xs">{c.formato}</Td>
                  <Td className="whitespace-nowrap font-mono text-xs">{c.ejemplo}</Td>
                </tr>
              ))}
            </TableBody>
          </Table>
        </div>
      </div>
    </details>
  );
}
