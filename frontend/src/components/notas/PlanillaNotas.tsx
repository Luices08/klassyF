import { type KeyboardEvent, useMemo, useRef, useState } from 'react';
import { Alert, errorMessage } from '../ui/Alert';
import { DesempenoBadge, EstadoNotaBadge } from '../ui/Badge';
import { Button } from '../ui/Button';
import { Input } from '../ui/Field';
import { type CeldaPlanilla, type EstadoNota, type FilaPlanilla, type Planilla } from '../../hooks/useNotas';
import { calcularNotaAsignatura, desempenoDe } from '../../lib/calculoNotas';
import { NOMBRES_TIPO_ACTIVIDAD } from '../../lib/actividades';
import type { ComponenteEvaluativo } from '../../types/domain';

interface PlanillaNotasProps {
  planilla: Planilla;
  /** Sin esto la planilla es de consulta (coordinación, administración). */
  onGuardar?: (celdas: CeldaPlanilla[]) => Promise<unknown>;
  guardando?: boolean;
}

const claveActividad = (estudiante: string, actividad: string) => `${estudiante}|a|${actividad}`;
const claveDirecta = (estudiante: string, componente: string) => `${estudiante}|c|${componente}`;

const numeroDe = (texto: string): number | null => {
  const valor = Number(texto.replace(',', '.'));
  return texto.trim() === '' || !Number.isFinite(valor) ? null : valor;
};

const formatoNota = (n: number | null): string => (n === null ? '' : n.toFixed(2));

const CELDA = 'px-2 py-1.5 text-center align-middle';

/**
 * La planilla de una clase y periodo: una columna por actividad agrupada en el bloque (componente evaluativo) al que
 * pertenece, una casilla por nota directa y, en gris y de solo lectura, los promedios y la nota de la asignatura, que se
 * recalculan mientras se escribe. Lo que vale es lo que el servidor calcula al guardar (el mismo cálculo), y una nota
 * cerrada se muestra tal como se congeló.
 */
export function PlanillaNotas({ planilla, onGuardar, guardando }: PlanillaNotasProps) {
  const [ediciones, setEdiciones] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const tabla = useRef<HTMLTableElement>(null);

  const editable = Boolean(onGuardar) && planilla.edicion.puede_editar;
  const { nota_minima: minimo, nota_maxima: maximo } = planilla.escala;

  const componentes: ComponenteEvaluativo[] = useMemo(
    () => planilla.componentes.map((c) => ({ clave: c.clave, nombre: c.nombre, porcentaje: c.porcentaje, origen: c.origen })),
    [planilla.componentes]
  );
  const actividades = useMemo(
    () => planilla.componentes.flatMap((c) => c.actividades.map((a) => ({ id: a._id, componente: c.clave, peso: a.peso }))),
    [planilla.componentes]
  );

  // Lo guardado más lo que se está escribiendo; una casilla vacía vuelve al valor guardado (borrar una nota no existe).
  const valorActividad = (fila: FilaPlanilla, id: string): number | null => {
    const escrito = ediciones[claveActividad(fila.estudiante._id, id)];
    return (escrito !== undefined ? numeroDe(escrito) : null) ?? fila.notas_actividad[id] ?? null;
  };
  const valorDirecto = (fila: FilaPlanilla, clave: string): number | null => {
    const escrito = ediciones[claveDirecta(fila.estudiante._id, clave)];
    return (escrito !== undefined ? numeroDe(escrito) : null) ?? fila.notas_directas[clave] ?? null;
  };

  const vista = planilla.estudiantes.map((fila) => {
    const cerrada = fila.estado === 'CERRADO' || fila.estado === 'DEFINITIVO';
    if (cerrada) return { fila, cerrada, componentes: fila.componentes, nota: fila.nota_asignatura, completa: true, desempeno: fila.desempeno, estado: fila.estado };

    const notasActividad = new Map<string, number>();
    for (const a of actividades) {
      const valor = valorActividad(fila, a.id);
      if (valor !== null) notasActividad.set(a.id, valor);
    }
    const notasDirectas = new Map<string, number>();
    for (const c of componentes.filter((x) => x.origen === 'NOTA_DIRECTA')) {
      const valor = valorDirecto(fila, c.clave);
      if (valor !== null) notasDirectas.set(c.clave, valor);
    }
    const calculo = calcularNotaAsignatura(componentes, actividades, notasActividad, notasDirectas);
    const estado: EstadoNota = calculo.completa ? 'BORRADOR' : 'PENDIENTE';
    return {
      fila,
      cerrada,
      componentes: calculo.componentes,
      nota: calculo.nota,
      completa: calculo.completa,
      desempeno: calculo.nota === null ? null : desempenoDe(calculo.nota, planilla.escala),
      estado,
    };
  });

  // Celdas modificadas (las que cambian respecto de lo guardado) y las que se salen de la escala.
  const celdas: CeldaPlanilla[] = [];
  const fueraDeEscala = new Set<string>();
  for (const fila of planilla.estudiantes) {
    if (fila.estado === 'CERRADO' || fila.estado === 'DEFINITIVO') continue;
    const revisar = (clave: string, guardada: number | null, destino: Omit<CeldaPlanilla, 'nota'>) => {
      const escrito = ediciones[clave];
      const nota = escrito === undefined ? null : numeroDe(escrito);
      if (nota === null) return;
      if (nota < minimo || nota > maximo) fueraDeEscala.add(clave);
      else if (nota !== guardada) celdas.push({ ...destino, nota });
    };
    for (const a of actividades) revisar(claveActividad(fila.estudiante._id, a.id), fila.notas_actividad[a.id] ?? null, { student_id: fila.estudiante._id, actividad_id: a.id });
    for (const c of componentes.filter((x) => x.origen === 'NOTA_DIRECTA')) {
      revisar(claveDirecta(fila.estudiante._id, c.clave), fila.notas_directas[c.clave] ?? null, { student_id: fila.estudiante._id, componente_clave: c.clave });
    }
  }

  function escribir(clave: string, valor: string) {
    setEdiciones((prev) => ({ ...prev, [clave]: valor }));
  }
  function soltar(clave: string) {
    setEdiciones((prev) => {
      if (prev[clave] !== '') return prev;
      const { [clave]: _descartada, ...resto } = prev;
      return resto;
    });
  }
  function alTeclear(e: KeyboardEvent<HTMLInputElement>, columna: number, fila: number) {
    if (e.key !== 'Enter') return;
    e.preventDefault();
    tabla.current?.querySelector<HTMLInputElement>(`[data-celda="${columna}-${fila + (e.shiftKey ? -1 : 1)}"]`)?.focus();
  }

  async function guardar() {
    if (!onGuardar) return;
    setError(null);
    try {
      await onGuardar(celdas);
      setEdiciones({});
    } catch (e) {
      setError(errorMessage(e));
    }
  }

  // Posición de la primera casilla de cada bloque entre todas las casillas editables (para saltar con Enter a la de abajo).
  const inicioDeBloque = planilla.componentes.map((_, i) =>
    planilla.componentes.slice(0, i).reduce((total, b) => total + (b.origen === 'ACTIVIDADES' ? b.actividades.length : 1), 0)
  );
  const columnasPorBloque = planilla.componentes.map((b) => (b.origen === 'ACTIVIDADES' ? (b.actividades.length > 0 ? b.actividades.length + 1 : 1) : 1));

  return (
    <div className="space-y-3">
      <div className="overflow-x-auto rounded-xl border border-border bg-surface">
        <table ref={tabla} className="min-w-full border-collapse text-sm">
          <thead>
            <tr>
              <th rowSpan={2} className="sticky left-0 z-10 min-w-[14rem] border-b border-r border-border bg-primary-soft px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-primary">
                Estudiante
              </th>
              {planilla.componentes.map((b, i) => (
                <th
                  key={b.clave}
                  colSpan={columnasPorBloque[i]}
                  className={`border-b border-l border-border px-2 py-2 text-center text-xs font-semibold uppercase tracking-wide ${
                    b.origen === 'ACTIVIDADES' ? 'bg-primary-soft text-primary' : 'bg-success-soft text-success'
                  }`}
                >
                  {b.nombre} · {b.porcentaje}%
                </th>
              ))}
              <th rowSpan={2} className="border-b border-l border-border bg-soft px-3 py-2 text-xs font-semibold uppercase tracking-wide text-body">
                Nota
              </th>
              <th rowSpan={2} className="border-b border-border bg-soft px-3 py-2 text-xs font-semibold uppercase tracking-wide text-body">
                Desempeño
              </th>
              <th rowSpan={2} className="border-b border-border bg-soft px-3 py-2 text-xs font-semibold uppercase tracking-wide text-body">
                Estado
              </th>
            </tr>
            <tr>
              {planilla.componentes.flatMap((b) =>
                b.origen === 'ACTIVIDADES'
                  ? [
                      ...b.actividades.map((a) => (
                        <th key={a._id} className="min-w-[5.5rem] max-w-[8rem] border-b border-l border-border bg-surface px-2 py-1.5 text-xs font-medium text-body">
                          <span className="block truncate" title={`${a.titulo} · ${NOMBRES_TIPO_ACTIVIDAD[a.tipo]}`}>
                            {a.titulo}
                          </span>
                          <span className="font-normal text-muted">peso {a.peso}</span>
                        </th>
                      )),
                      ...(b.actividades.length > 0
                        ? [
                            <th key={`${b.clave}-prom`} className="border-b border-l border-border bg-soft px-2 py-1.5 text-xs font-medium text-muted">
                              Promedio
                            </th>,
                          ]
                        : [
                            <th key={`${b.clave}-vacio`} className="border-b border-l border-border bg-warning-soft px-2 py-1.5 text-xs font-medium text-warning">
                              Sin actividades
                            </th>,
                          ]),
                    ]
                  : [
                      <th key={b.clave} className="border-b border-l border-border bg-surface px-2 py-1.5 text-xs font-medium text-body">
                        Nota directa
                      </th>,
                    ]
              )}
            </tr>
          </thead>
          <tbody>
            {vista.map(({ fila, cerrada, componentes: notas, nota, completa, desempeno, estado }, indiceFila) => {
              const bloqueado = !editable || cerrada;
              return (
                <tr key={fila.estudiante._id} className="border-b border-border last:border-b-0">
                  <td className="sticky left-0 z-10 border-r border-border bg-surface px-3 py-1.5 font-medium text-ink">
                    {fila.estudiante.apellido} {fila.estudiante.nombre}
                  </td>
                  {planilla.componentes.flatMap((b, bloque) => {
                    if (b.origen === 'NOTA_DIRECTA') {
                      const clave = claveDirecta(fila.estudiante._id, b.clave);
                      const indice = inicioDeBloque[bloque] as number;
                      return [
                        <td key={b.clave} className={`${CELDA} border-l border-border`}>
                          <Input
                            label={`${b.nombre} de ${fila.estudiante.nombre} ${fila.estudiante.apellido}`}
                            hideLabel
                            data-celda={`${indice}-${indiceFila}`}
                            type="number"
                            inputMode="decimal"
                            step="0.1"
                            min={minimo}
                            max={maximo}
                            className={`w-16 px-1 text-center ${fueraDeEscala.has(clave) ? 'ring-2 ring-danger' : ''}`}
                            disabled={bloqueado}
                            value={ediciones[clave] ?? fila.notas_directas[b.clave] ?? ''}
                            onChange={(e) => escribir(clave, e.target.value)}
                            onBlur={() => soltar(clave)}
                            onKeyDown={(e) => alTeclear(e, indice, indiceFila)}
                          />
                        </td>,
                      ];
                    }
                    const entradas = b.actividades.map((a, k) => {
                      const clave = claveActividad(fila.estudiante._id, a._id);
                      const indice = (inicioDeBloque[bloque] as number) + k;
                      return (
                        <td key={a._id} className={`${CELDA} border-l border-border`}>
                          <Input
                            label={`${a.titulo} de ${fila.estudiante.nombre} ${fila.estudiante.apellido}`}
                            hideLabel
                            data-celda={`${indice}-${indiceFila}`}
                            type="number"
                            inputMode="decimal"
                            step="0.1"
                            min={minimo}
                            max={maximo}
                            className={`w-16 px-1 text-center ${fueraDeEscala.has(clave) ? 'ring-2 ring-danger' : ''}`}
                            disabled={bloqueado}
                            value={ediciones[clave] ?? fila.notas_actividad[a._id] ?? ''}
                            onChange={(e) => escribir(clave, e.target.value)}
                            onBlur={() => soltar(clave)}
                            onKeyDown={(e) => alTeclear(e, indice, indiceFila)}
                          />
                        </td>
                      );
                    });
                    return [
                      ...entradas,
                      ...(b.actividades.length > 0
                        ? [
                            <td key={`${b.clave}-prom`} className={`${CELDA} border-l border-border bg-soft text-body`}>
                              {formatoNota(notas[b.clave] ?? null) || <span className="text-muted">—</span>}
                            </td>,
                          ]
                        : [<td key={`${b.clave}-vacio`} className={`${CELDA} border-l border-border bg-warning-soft text-warning`}>—</td>]),
                    ];
                  })}
                  <td className={`${CELDA} border-l border-border bg-soft text-base font-bold ${completa ? 'text-ink' : 'italic text-muted'}`} title={completa ? undefined : 'Parcial: aún faltan notas'}>
                    {formatoNota(nota) || <span className="text-muted">—</span>}
                  </td>
                  <td className={`${CELDA} bg-soft`}>{desempeno ? <DesempenoBadge value={desempeno} /> : <span className="text-muted">—</span>}</td>
                  <td className={`${CELDA} bg-soft`}>
                    <EstadoNotaBadge value={estado} />
                  </td>
                </tr>
              );
            })}
            {vista.length === 0 && (
              <tr>
                <td colSpan={99} className="py-8 text-center text-muted">
                  Este grupo no tiene estudiantes con matrícula activa.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {planilla.componentes.some((b) => b.origen === 'ACTIVIDADES' && b.actividades.length === 0) && (
        <Alert tone="warning">
          Hay componentes que se alimentan de actividades y aún no tienen ninguna en este periodo: sin ellas la nota no se completa y la planilla no se puede
          cerrar. Se programan en «Actividades y tareas».
        </Alert>
      )}
      {fueraDeEscala.size > 0 && (
        <Alert tone="error">
          Hay notas fuera de la escala del año ({minimo} a {maximo}). Corrígelas para poder guardar.
        </Alert>
      )}
      {error && <Alert tone="error">{error}</Alert>}

      {editable && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border bg-surface px-4 py-3">
          <p className="text-sm text-muted">
            {celdas.length === 0 ? 'Escribe las notas y pulsa Enter para bajar a la siguiente casilla.' : `${celdas.length} nota(s) sin guardar.`}
          </p>
          <div className="flex gap-2">
            <Button type="button" variant="secondary" disabled={Object.keys(ediciones).length === 0 || guardando} onClick={() => setEdiciones({})}>
              Descartar
            </Button>
            <Button type="button" isLoading={guardando} disabled={celdas.length === 0 || fueraDeEscala.size > 0} onClick={() => void guardar()}>
              Guardar notas
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
