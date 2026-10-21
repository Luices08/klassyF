import { useState } from 'react';
import type { Eficiencia } from '../../hooks/useDashboard';
import { type MedidasDeEficiencia, agruparPorNivel, medidasDeTotales, textoPorcentajeEntero } from '../../lib/matrizEficiencia';
import { formatoNumero } from '../../lib/dashboard';
import { Chip, type Tone } from '../ui/Badge';
import { ChevronRightIcon } from '../ui/icons';
import { EmptyRow, Table, TableBody, TableHead, Td, Th } from '../ui/Table';

/** Una medida en píldora; 0 % o sin datos se leen como texto quieto para que el color solo llame la atención donde hay algo. */
function Medida({ valor, tono }: { valor: number | null; tono: Tone }) {
  const texto = textoPorcentajeEntero(valor);
  if (texto === null) return <span className="text-muted">—</span>;
  if (valor === 0) return <span className="text-muted">{texto}</span>;
  return <Chip tone={tono}>{texto}</Chip>;
}

function Celdas({ m }: { m: MedidasDeEficiencia }) {
  return (
    <>
      <Td className="text-center">
        <Medida valor={m.aprobados} tono="green" />
      </Td>
      <Td className="text-center">
        <Medida valor={m.reprobados} tono="orange" />
      </Td>
      <Td className="text-center">
        <Medida valor={m.desertores} tono="red" />
      </Td>
      <Td className="text-right tabular-nums">{formatoNumero(m.total)}</Td>
    </>
  );
}

/**
 * Matriz de eficiencia interna resumida por nivel (Preescolar, Primaria…); cada nivel se abre para ver sus grados. Aprobados y reprobados se miden sobre quienes ya
 * tienen resultado (igual que el indicador de rendimiento, así el total coincide) y desertores sobre la matrícula inicial. «Desertores» incluye los traslados a otro
 * colegio: el sistema no los distingue de una deserción.
 */
export function MatrizEficienciaCompacta({ datos }: { datos: Eficiencia }) {
  const [abiertos, setAbiertos] = useState<string[]>([]);
  const oficial = datos.rendimiento.modo === 'OFICIAL';
  const niveles = agruparPorNivel(datos.filas);
  const alternar = (clave: string) => setAbiertos((a) => (a.includes(clave) ? a.filter((c) => c !== clave) : [...a, clave]));

  return (
    <div className="space-y-3 [&_td]:px-3 [&_th]:px-3">
      <div className="flex flex-wrap items-center gap-2">
        <Chip tone={oficial ? 'green' : 'orange'}>{oficial ? 'Resultado oficial' : `Provisional · periodo ${datos.periodo_notas}`}</Chip>
        <span className="text-xs text-muted">Toca un nivel para ver sus grados.</span>
      </div>
      <Table>
        <TableHead>
          <Th>Nivel</Th>
          <Th className="text-center" title="Sobre quienes ya tienen resultado">
            Aprobados
          </Th>
          <Th className="text-center" title="Con asignaturas perdidas o por resolver, sobre quienes ya tienen resultado">
            Reprobados
          </Th>
          <Th className="text-center" title="Retirados y traslados, sobre la matrícula inicial">
            Desertores
          </Th>
          <Th className="text-right">Total</Th>
        </TableHead>
        <TableBody>
          {niveles.length === 0 && <EmptyRow colSpan={5}>No hay grupos con estudiantes en este alcance.</EmptyRow>}
          {niveles.map((n) => {
            const abierto = abiertos.includes(n.clave);
            return [
              <tr key={n.clave}>
                <Td className="font-medium text-ink">
                  <button
                    type="button"
                    onClick={() => alternar(n.clave)}
                    aria-expanded={abierto}
                    className="flex items-center gap-2 text-left font-medium text-ink hover:text-primary"
                  >
                    <ChevronRightIcon className={`h-4 w-4 shrink-0 text-muted transition-transform ${abierto ? 'rotate-90' : ''}`} />
                    {n.etiqueta}
                  </button>
                </Td>
                <Celdas m={n} />
              </tr>,
              ...(abierto
                ? n.grados.map((g) => (
                    <tr key={g.clave} className="bg-soft/60">
                      <Td className="pl-10 text-sm text-body">{g.etiqueta}</Td>
                      <Celdas m={g} />
                    </tr>
                  ))
                : []),
            ];
          })}
          {niveles.length > 0 && (
            <tr className="bg-soft font-semibold text-ink">
              <Td>Total institucional</Td>
              <Celdas m={medidasDeTotales(datos.totales)} />
            </tr>
          )}
        </TableBody>
      </Table>
    </div>
  );
}
