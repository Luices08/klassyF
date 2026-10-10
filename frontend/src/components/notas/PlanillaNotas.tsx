import { type ClipboardEvent, type KeyboardEvent, useMemo, useRef, useState } from 'react';
import { Alert, errorMessage } from '../ui/Alert';
import { DesempenoBadge, EstadoNotaBadge } from '../ui/Badge';
import { Button } from '../ui/Button';
import { Input } from '../ui/Field';
import { IconButton } from '../ui/IconButton';
import { PencilIcon, PlusIcon } from '../ui/icons';
import type { EstadoActividadEstudiante } from '../../hooks/useActividades';
import { type CasillaPlanilla, type CeldaPlanilla, type EstadoNota, type FilaPlanilla, type Planilla } from '../../hooks/useNotas';
import { calcularNotaAsignatura, desempenoDe, pesoExcedido, pesosEfectivos, sumaDePesosPuestos } from '../../lib/calculoNotas';
import { NOMBRES_TIPO_ACTIVIDAD } from '../../lib/actividades';

export interface CambiosPlanilla {
  celdas: CeldaPlanilla[];
  /** Solo los pesos que cambian; `peso: null` devuelve la casilla a automático. */
  pesos: Array<{ casilla_id: string; peso: number | null }>;
}

interface PlanillaNotasProps {
  planilla: Planilla;
  /** Sin esto la planilla es de consulta (coordinación, administración). */
  onGuardar?: (cambios: CambiosPlanilla) => Promise<unknown>;
  guardando?: boolean;
  /** Abre las entregas de una actividad (evidencias de los estudiantes) para revisarlas y calificar desde la planilla. */
  onRevisarActividad?: (actividad: { _id: string; titulo: string }) => void;
  /** Abre el formulario para agregar una nota suelta a un bloque. */
  onAgregarCasilla?: (bloqueClave: string) => void;
  /** Abre el formulario de una casilla (renombrar, mover de bloque, pesar o eliminar). */
  onEditarCasilla?: (casillaId: string) => void;
}

type Ediciones = Record<string, string>;

const claveCelda = (estudiante: string, casilla: string) => `${estudiante}|${casilla}`;

const numeroDe = (texto: string): number | null => {
  const valor = Number(texto.replace(',', '.'));
  return texto.trim() === '' || !Number.isFinite(valor) ? null : valor;
};

const formatoNota = (n: number | null): string => (n === null ? '' : n.toFixed(2));

const CELDA = 'px-2 py-1.5 text-center align-middle';
const MAX_DESHACER = 50;

// Qué entregó el estudiante, en un punto bajo su casilla: los mismos tonos de la guía visual.
const PUNTO_ENTREGA: Record<EstadoActividadEstudiante, { color: string; texto: string } | null> = {
  PROGRAMADA: null,
  ENTREGADA: { color: 'bg-success', texto: 'Entregó a tiempo' },
  ENTREGADA_TARDE: { color: 'bg-warning', texto: 'Entregó con retraso' },
  CALIFICADA: { color: 'bg-primary', texto: 'Entregó y ya está calificada' },
};

function Punto({ estado, tieneArchivo }: { estado: EstadoActividadEstudiante; tieneArchivo: boolean }) {
  const punto = PUNTO_ENTREGA[estado];
  if (!punto) return <span className="mt-1 block h-2" aria-hidden />;
  return (
    <span
      className={`mx-auto mt-1 block h-2 w-2 rounded-full ${punto.color}`}
      title={`${punto.texto}${tieneArchivo ? ' (con archivo)' : ' (respuesta escrita)'}`}
      role="img"
      aria-label={punto.texto}
    />
  );
}

interface Estadisticas {
  promedio: number | null;
  maxima: number | null;
  minima: number | null;
  pierden: number;
}

function estadisticasDe(valores: Array<number | null>, aprobatoria: number): Estadisticas {
  const notas = valores.filter((v): v is number => v !== null);
  if (notas.length === 0) return { promedio: null, maxima: null, minima: null, pierden: 0 };
  return {
    promedio: notas.reduce((suma, n) => suma + n, 0) / notas.length,
    maxima: Math.max(...notas),
    minima: Math.min(...notas),
    pierden: notas.filter((n) => n < aprobatoria).length,
  };
}

/**
 * La planilla de una clase y periodo, armada con el molde del colegio: cada bloque (Heteroevaluación 70%, Autoevaluación 15%…)
 * trae las casillas que el docente puso en él —actividades de M11 y notas sueltas—, hasta el máximo que fijó el administrador.
 * El docente puede ponerle un peso a cada casilla (un % del bloque; sin peso se reparten en partes iguales lo que queda) y edita
 * como en una hoja de cálculo: flechas y Enter para moverse, pegar un rango copiado de Excel, Ctrl+D para rellenar hacia abajo
 * y Ctrl+Z para deshacer. Los promedios y la nota de la asignatura (en gris) se recalculan mientras escribe; lo que vale es lo que
 * el servidor calcula al guardar (el mismo cálculo), y una nota cerrada se muestra como se congeló.
 */
export function PlanillaNotas({ planilla, onGuardar, guardando, onRevisarActividad, onAgregarCasilla, onEditarCasilla }: PlanillaNotasProps) {
  const [ediciones, setEdiciones] = useState<Ediciones>({});
  const [pesosEditados, setPesosEditados] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [busqueda, setBusqueda] = useState('');
  const [soloPendientes, setSoloPendientes] = useState(false);
  const tabla = useRef<HTMLTableElement>(null);
  // Cada vez que el docente entra a una casilla o pega/rellena se guarda cómo estaba todo: Ctrl+Z vuelve a ese punto.
  const historial = useRef<Array<{ ediciones: Ediciones; pesos: Record<string, string> }>>([]);

  const editable = Boolean(onGuardar) && planilla.edicion.puede_editar;
  const { nota_minima: minimo, nota_maxima: maximo, nota_aprobatoria: aprobatoria } = planilla.escala;
  const { plantilla } = planilla;
  const mostrarPesos = editable || plantilla.columnas.pesos;

  const bloquesMolde = useMemo(() => planilla.bloques.map((b) => ({ clave: b.clave, porcentaje: b.porcentaje })), [planilla.bloques]);
  const columnas = useMemo(() => planilla.bloques.flatMap((b) => b.casillas.map((casilla) => ({ casilla, bloque: b.clave }))), [planilla.bloques]);

  // El peso vigente de cada casilla: lo que se está escribiendo o, si no se ha tocado, lo guardado.
  const casillasCalculo = columnas.map(({ casilla, bloque }) => ({
    id: casilla.id,
    bloque,
    peso: pesosEditados[casilla.id] !== undefined ? numeroDe(pesosEditados[casilla.id] as string) : casilla.peso,
  }));
  const efectivos = pesosEfectivos(casillasCalculo);
  const sumasPuestas = sumaDePesosPuestos(casillasCalculo);
  const bloquesExcedidos = planilla.bloques.filter((b) => pesoExcedido(sumasPuestas.get(b.clave) ?? 0));

  // Lo guardado más lo que se está escribiendo; una casilla vacía vuelve al valor guardado (borrar una nota no existe).
  const valorDe = (fila: FilaPlanilla, casillaId: string): number | null => {
    const escrito = ediciones[claveCelda(fila.estudiante._id, casillaId)];
    return (escrito !== undefined ? numeroDe(escrito) : null) ?? fila.notas[casillaId] ?? null;
  };

  const vista = planilla.estudiantes.map((fila) => {
    const cerrada = fila.estado === 'CERRADO' || fila.estado === 'DEFINITIVO';
    if (cerrada) return { fila, cerrada, bloques: fila.bloques, nota: fila.nota_asignatura, completa: true, desempeno: fila.desempeno, estado: fila.estado };

    const notas = new Map<string, number>();
    for (const { casilla } of columnas) {
      const valor = valorDe(fila, casilla.id);
      if (valor !== null) notas.set(casilla.id, valor);
    }
    const calculo = calcularNotaAsignatura(bloquesMolde, casillasCalculo, notas);
    const estado: EstadoNota = calculo.completa ? 'BORRADOR' : 'PENDIENTE';
    return {
      fila,
      cerrada,
      bloques: calculo.bloques,
      nota: calculo.nota,
      completa: calculo.completa,
      desempeno: calculo.nota === null ? null : desempenoDe(calculo.nota, planilla.escala),
      estado,
    };
  });

  // Los filtros solo cambian lo que se ve: las notas escritas en filas ocultas siguen en la lista de cambios por guardar.
  const texto = busqueda.trim().toLowerCase();
  const visibles = vista.filter(
    ({ fila, completa, cerrada }) =>
      (texto === '' || `${fila.estudiante.apellido} ${fila.estudiante.nombre} ${fila.estudiante.numero_documento}`.toLowerCase().includes(texto)) &&
      (!soloPendientes || (!cerrada && !completa))
  );

  // Cambios por guardar: notas que difieren de lo guardado, pesos que difieren, y notas que se salen de la escala.
  const celdas: CeldaPlanilla[] = [];
  const fueraDeEscala = new Set<string>();
  for (const fila of planilla.estudiantes) {
    if (fila.estado === 'CERRADO' || fila.estado === 'DEFINITIVO') continue;
    for (const { casilla } of columnas) {
      const clave = claveCelda(fila.estudiante._id, casilla.id);
      const escrito = ediciones[clave];
      const nota = escrito === undefined ? null : numeroDe(escrito);
      if (nota === null) continue;
      if (nota < minimo || nota > maximo) fueraDeEscala.add(clave);
      else if (nota !== (fila.notas[casilla.id] ?? null)) celdas.push({ student_id: fila.estudiante._id, casilla_id: casilla.id, nota });
    }
  }
  const pesos: CambiosPlanilla['pesos'] = [];
  const pesosInvalidos = new Set<string>();
  for (const { casilla } of columnas) {
    const escrito = pesosEditados[casilla.id];
    if (escrito === undefined) continue;
    const peso = numeroDe(escrito);
    if (peso !== null && (peso < 0 || peso > 100)) pesosInvalidos.add(casilla.id);
    else if (peso !== casilla.peso) pesos.push({ casilla_id: casilla.id, peso });
  }

  // --- Edición tipo hoja de cálculo ---

  function recordarEstado() {
    const ultimo = historial.current[historial.current.length - 1];
    if (ultimo && ultimo.ediciones === ediciones && ultimo.pesos === pesosEditados) return;
    historial.current = [...historial.current.slice(-(MAX_DESHACER - 1)), { ediciones, pesos: pesosEditados }];
  }
  function deshacer() {
    const anterior = historial.current.pop();
    if (!anterior) return;
    setEdiciones(anterior.ediciones);
    setPesosEditados(anterior.pesos);
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
  function irA(columna: number, fila: number) {
    const destino = tabla.current?.querySelector<HTMLInputElement>(`[data-celda="${columna}-${fila}"]`);
    destino?.focus();
    destino?.select();
  }
  function rellenarDesdeArriba(columna: number, fila: number) {
    const origen = visibles[fila - 1];
    const actual = visibles[fila];
    const destino = columnas[columna];
    if (!origen || !actual || !destino || actual.cerrada) return;
    const valor = valorDe(origen.fila, destino.casilla.id);
    if (valor === null) return;
    recordarEstado();
    escribir(claveCelda(actual.fila.estudiante._id, destino.casilla.id), String(valor));
  }
  function alTeclear(e: KeyboardEvent<HTMLInputElement>, columna: number, fila: number) {
    const ctrl = e.ctrlKey || e.metaKey;
    if (ctrl && e.key.toLowerCase() === 'z') {
      e.preventDefault();
      deshacer();
      return;
    }
    if (ctrl && e.key.toLowerCase() === 'd') {
      e.preventDefault();
      rellenarDesdeArriba(columna, fila);
      return;
    }
    const campo = e.currentTarget;
    const alInicio = campo.selectionStart === 0 && campo.selectionEnd === 0;
    const alFinal = campo.selectionStart === campo.value.length && campo.selectionEnd === campo.value.length;
    const movimientos: Record<string, [number, number] | null> = {
      Enter: [0, e.shiftKey ? -1 : 1],
      ArrowDown: [0, 1],
      ArrowUp: [0, -1],
      ArrowLeft: alInicio ? [-1, 0] : null,
      ArrowRight: alFinal ? [1, 0] : null,
    };
    const movimiento = movimientos[e.key];
    if (!movimiento) return;
    e.preventDefault();
    irA(columna + movimiento[0], fila + movimiento[1]);
  }
  // Un rango copiado de Excel o de Google Sheets (celdas separadas por tabulación y filas por salto de línea) se reparte
  // desde la casilla donde se pega; lo que no tiene casilla editable o es de una fila cerrada se ignora.
  function alPegar(e: ClipboardEvent<HTMLInputElement>, columna: number, fila: number) {
    const pegado = e.clipboardData.getData('text');
    if (!/[\t\n]/.test(pegado.trim())) return;
    e.preventDefault();
    const rango = pegado.replace(/\r/g, '').replace(/\n+$/, '').split('\n').map((linea) => linea.split('\t'));
    recordarEstado();
    setEdiciones((prev) => {
      const siguiente = { ...prev };
      rango.forEach((valores, i) =>
        valores.forEach((valor, j) => {
          const destinoFila = visibles[fila + i];
          const destinoColumna = columnas[columna + j];
          const limpio = valor.trim();
          if (!destinoFila || !destinoColumna || destinoFila.cerrada || limpio === '') return;
          siguiente[claveCelda(destinoFila.fila.estudiante._id, destinoColumna.casilla.id)] = limpio;
        })
      );
      return siguiente;
    });
  }

  async function guardar() {
    if (!onGuardar) return;
    setError(null);
    try {
      await onGuardar({ celdas, pesos });
      setEdiciones({});
      setPesosEditados({});
      historial.current = [];
    } catch (e) {
      setError(errorMessage(e));
    }
  }
  function descartar() {
    recordarEstado();
    setEdiciones({});
    setPesosEditados({});
  }

  // --- Estructura de columnas por bloque ---
  const hayEntregas = columnas.some(({ casilla }) => casilla.requiere_entrega);
  const conPromedio = (casillas: CasillaPlanilla[]) => plantilla.columnas.promedios_componente && casillas.length > 0;
  const conAgregar = (b: Planilla['bloques'][number]) => editable && Boolean(onAgregarCasilla) && b.casillas.length < b.max_casillas;
  // Un bloque sin casillas que no ofrece «+» ocupa una columna de aviso; con «+» ocupa solo la del botón.
  const columnasDeBloque = (b: Planilla['bloques'][number]) =>
    (b.casillas.length === 0 && !conAgregar(b) ? 1 : b.casillas.length) + (conAgregar(b) ? 1 : 0) + (conPromedio(b.casillas) ? 1 : 0);
  // Posición de la primera casilla de cada bloque entre todas las casillas (para moverse con el teclado).
  const inicioDeBloque = planilla.bloques.map((_, i) => planilla.bloques.slice(0, i).reduce((total, b) => total + b.casillas.length, 0));

  const estadisticasPorCasilla = columnas.map(({ casilla }) => estadisticasDe(vista.map(({ fila }) => valorDe(fila, casilla.id)), aprobatoria));
  const estadisticasPorBloque = new Map(planilla.bloques.map((b) => [b.clave, estadisticasDe(vista.map((v) => v.bloques[b.clave] ?? null), aprobatoria)]));
  const estadisticasNota = estadisticasDe(vista.map((v) => v.nota), aprobatoria);
  const FILAS_ESTADISTICAS: Array<{ nombre: string; valor: (s: Estadisticas) => string }> = [
    { nombre: 'Promedio', valor: (s) => formatoNota(s.promedio) },
    { nombre: 'Máxima', valor: (s) => formatoNota(s.maxima) },
    { nombre: 'Mínima', valor: (s) => formatoNota(s.minima) },
    { nombre: 'Pierden', valor: (s) => (s.promedio === null ? '' : String(s.pierden)) },
  ];

  const sinGuardar = celdas.length + pesos.length;
  const hayErrores = fueraDeEscala.size > 0 || pesosInvalidos.size > 0 || bloquesExcedidos.length > 0;

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-sm font-semibold text-ink">{plantilla.titulo}</p>
          {plantilla.subtitulo && <p className="text-xs text-muted">{plantilla.subtitulo}</p>}
        </div>
        <div className="flex flex-wrap items-end gap-3">
          <div className="w-56">
            <Input label="Buscar estudiante" hideLabel placeholder="Buscar por nombre o documento…" value={busqueda} onChange={(e) => setBusqueda(e.target.value)} />
          </div>
          <label className="flex items-center gap-2 pb-2 text-sm text-body">
            <input type="checkbox" checked={soloPendientes} onChange={(e) => setSoloPendientes(e.target.checked)} />
            Solo con notas pendientes
          </label>
        </div>
      </div>

      <div className="overflow-x-auto rounded-xl border border-border bg-surface">
        <table ref={tabla} className="min-w-full border-collapse text-sm">
          <thead>
            <tr>
              <th rowSpan={2} className="sticky left-0 z-10 min-w-[14rem] border-b border-r border-border bg-primary-soft px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-primary">
                Estudiante
              </th>
              {planilla.bloques.map((b) => {
                const lleno = b.casillas.length >= b.max_casillas;
                const excedido = pesoExcedido(sumasPuestas.get(b.clave) ?? 0);
                return (
                  <th key={b.clave} colSpan={columnasDeBloque(b)} className="border-b border-l border-border bg-primary-soft px-2 py-2 text-center text-xs font-semibold uppercase tracking-wide text-primary">
                    {b.nombre} · {b.porcentaje}%
                    <span className={`ml-2 font-normal normal-case ${lleno ? 'text-warning' : 'text-muted'}`} title="Casillas usadas / máximo que fijó el administrador">
                      {b.casillas.length}/{b.max_casillas}
                    </span>
                    {excedido && <span className="ml-2 font-normal normal-case text-danger">pesos &gt; 100%</span>}
                  </th>
                );
              })}
              <th rowSpan={2} className="border-b border-l border-border bg-soft px-3 py-2 text-xs font-semibold uppercase tracking-wide text-body">
                Nota
              </th>
              {plantilla.columnas.desempeno && (
                <th rowSpan={2} className="border-b border-border bg-soft px-3 py-2 text-xs font-semibold uppercase tracking-wide text-body">
                  Desempeño
                </th>
              )}
              {plantilla.columnas.estado && (
                <th rowSpan={2} className="border-b border-border bg-soft px-3 py-2 text-xs font-semibold uppercase tracking-wide text-body">
                  Estado
                </th>
              )}
            </tr>
            <tr>
              {planilla.bloques.flatMap((b) => [
                ...b.casillas.map((c) => (
                  <th key={c.id} className="min-w-[6.5rem] max-w-[9rem] border-b border-l border-border bg-surface px-2 py-1.5 align-top text-xs font-medium text-body">
                    <div className="flex items-start justify-between gap-1">
                      {c.tipo === 'ACTIVIDAD' && onRevisarActividad && c.requiere_entrega ? (
                        <button
                          type="button"
                          className="block min-w-0 flex-1 truncate text-left text-primary hover:underline"
                          title={`${c.titulo}${c.tipo_actividad ? ` · ${NOMBRES_TIPO_ACTIVIDAD[c.tipo_actividad]}` : ''} — ver las entregas de los estudiantes`}
                          onClick={() => onRevisarActividad({ _id: c.id, titulo: c.titulo })}
                        >
                          {c.titulo}
                        </button>
                      ) : (
                        <span
                          className="block min-w-0 flex-1 truncate text-left"
                          title={`${c.titulo}${c.tipo === 'MANUAL' ? ' · nota suelta' : c.tipo_actividad ? ` · ${NOMBRES_TIPO_ACTIVIDAD[c.tipo_actividad]}${c.requiere_entrega ? '' : ' · actividad de aula'}` : ''}`}
                        >
                          {c.titulo}
                        </span>
                      )}
                      {editable && onEditarCasilla && (
                        <IconButton tone="neutral" label={`Editar ${c.titulo}`} icon={<PencilIcon />} onClick={() => onEditarCasilla(c.id)} />
                      )}
                    </div>
                    {mostrarPesos &&
                      (editable ? (
                        <div className="mt-1 flex items-center justify-center gap-1 font-normal text-muted">
                          <Input
                            label={`Peso de ${c.titulo} dentro del bloque`}
                            hideLabel
                            type="number"
                            min={0}
                            max={100}
                            step="0.5"
                            placeholder={String(Math.round((efectivos.get(c.id) ?? 0) * 100) / 100)}
                            className={`w-16 px-1 py-1 text-center text-xs ${pesosInvalidos.has(c.id) ? 'ring-2 ring-danger' : ''}`}
                            value={pesosEditados[c.id] ?? (c.peso === null ? '' : String(c.peso))}
                            onFocus={recordarEstado}
                            onChange={(e) => setPesosEditados((prev) => ({ ...prev, [c.id]: e.target.value }))}
                          />
                          <span>%</span>
                        </div>
                      ) : (
                        <span className="mt-1 block text-center font-normal text-muted" title={c.peso === null ? 'Peso automático' : 'Peso que puso el docente'}>
                          {Math.round((efectivos.get(c.id) ?? 0) * 100) / 100}%
                        </span>
                      ))}
                  </th>
                )),
                ...(b.casillas.length === 0 && !conAgregar(b)
                  ? [
                      <th key={`${b.clave}-vacio`} className="border-b border-l border-border bg-warning-soft px-2 py-1.5 text-xs font-medium text-warning">
                        Sin casillas
                      </th>,
                    ]
                  : []),
                ...(conAgregar(b)
                  ? [
                      <th key={`${b.clave}-agregar`} className="border-b border-l border-border bg-surface px-2 py-1.5 text-center align-middle">
                        <IconButton tone="edit" label={`Agregar casilla a ${b.nombre}`} icon={<PlusIcon />} onClick={() => onAgregarCasilla?.(b.clave)} />
                      </th>,
                    ]
                  : []),
                ...(conPromedio(b.casillas)
                  ? [
                      <th key={`${b.clave}-prom`} className="border-b border-l border-border bg-soft px-2 py-1.5 text-xs font-medium text-muted">
                        Promedio
                      </th>,
                    ]
                  : []),
              ])}
            </tr>
          </thead>
          <tbody>
            {visibles.map(({ fila, cerrada, bloques: notasBloque, nota, completa, desempeno, estado }, indiceFila) => {
              const bloqueado = !editable || cerrada;
              return (
                <tr key={fila.estudiante._id} className="border-b border-border last:border-b-0">
                  <td className="sticky left-0 z-10 border-r border-border bg-surface px-3 py-1.5 font-medium text-ink">
                    {fila.estudiante.apellido} {fila.estudiante.nombre}
                    {plantilla.columnas.documento && <span className="block text-xs font-normal text-muted">{fila.estudiante.numero_documento}</span>}
                  </td>
                  {planilla.bloques.flatMap((b, bloque) => [
                    ...b.casillas.map((c, k) => {
                      const clave = claveCelda(fila.estudiante._id, c.id);
                      const indice = (inicioDeBloque[bloque] as number) + k;
                      const entrega = fila.entregas[c.id];
                      return (
                        <td key={c.id} className={`${CELDA} border-l border-border`}>
                          <Input
                            label={`${c.titulo} de ${fila.estudiante.nombre} ${fila.estudiante.apellido}`}
                            hideLabel
                            data-celda={`${indice}-${indiceFila}`}
                            type="text"
                            inputMode="decimal"
                            autoComplete="off"
                            className={`w-16 px-1 text-center ${fueraDeEscala.has(clave) ? 'ring-2 ring-danger' : ''}`}
                            disabled={bloqueado}
                            value={ediciones[clave] ?? fila.notas[c.id] ?? ''}
                            onFocus={recordarEstado}
                            onChange={(e) => escribir(clave, e.target.value)}
                            onBlur={() => soltar(clave)}
                            onKeyDown={(e) => alTeclear(e, indice, indiceFila)}
                            onPaste={(e) => alPegar(e, indice, indiceFila)}
                          />
                          {entrega && <Punto estado={entrega.estado} tieneArchivo={entrega.tiene_archivo} />}
                        </td>
                      );
                    }),
                    ...(b.casillas.length === 0 && !conAgregar(b)
                      ? [<td key={`${b.clave}-vacio`} className={`${CELDA} border-l border-border bg-warning-soft text-warning`}>—</td>]
                      : []),
                    ...(conAgregar(b) ? [<td key={`${b.clave}-agregar`} className={`${CELDA} border-l border-border bg-soft/40`} />] : []),
                    ...(conPromedio(b.casillas)
                      ? [
                          <td key={`${b.clave}-prom`} className={`${CELDA} border-l border-border bg-soft text-body`}>
                            {formatoNota(notasBloque[b.clave] ?? null) || <span className="text-muted">—</span>}
                          </td>,
                        ]
                      : []),
                  ])}
                  <td className={`${CELDA} border-l border-border bg-soft text-base font-bold ${completa ? 'text-ink' : 'italic text-muted'}`} title={completa ? undefined : 'Parcial: aún faltan notas'}>
                    {formatoNota(nota) || <span className="text-muted">—</span>}
                  </td>
                  {plantilla.columnas.desempeno && <td className={`${CELDA} bg-soft`}>{desempeno ? <DesempenoBadge value={desempeno} /> : <span className="text-muted">—</span>}</td>}
                  {plantilla.columnas.estado && (
                    <td className={`${CELDA} bg-soft`}>
                      <EstadoNotaBadge value={estado} />
                    </td>
                  )}
                </tr>
              );
            })}
            {visibles.length === 0 && (
              <tr>
                <td colSpan={99} className="py-8 text-center text-muted">
                  {vista.length === 0 ? 'Este grupo no tiene estudiantes con matrícula activa.' : 'Ningún estudiante coincide con el filtro.'}
                </td>
              </tr>
            )}
          </tbody>
          {vista.length > 0 && (
            <tfoot>
              {FILAS_ESTADISTICAS.map((estadistica) => (
                <tr key={estadistica.nombre} className="border-t border-border bg-soft/60 text-xs text-body">
                  <td className="sticky left-0 z-10 border-r border-border bg-soft px-3 py-1 text-left font-semibold uppercase tracking-wide text-muted">{estadistica.nombre}</td>
                  {planilla.bloques.flatMap((b, bloque) => [
                    ...b.casillas.map((c, k) => (
                      <td key={c.id} className="border-l border-border px-2 py-1 text-center">
                        {estadistica.valor(estadisticasPorCasilla[(inicioDeBloque[bloque] as number) + k] as Estadisticas)}
                      </td>
                    )),
                    ...(b.casillas.length === 0 && !conAgregar(b) ? [<td key={`${b.clave}-vacio`} className="border-l border-border" />] : []),
                    ...(conAgregar(b) ? [<td key={`${b.clave}-agregar`} className="border-l border-border" />] : []),
                    ...(conPromedio(b.casillas)
                      ? [
                          <td key={`${b.clave}-prom`} className="border-l border-border px-2 py-1 text-center font-medium">
                            {estadistica.valor(estadisticasPorBloque.get(b.clave) as Estadisticas)}
                          </td>,
                        ]
                      : []),
                  ])}
                  <td className="border-l border-border px-2 py-1 text-center font-semibold">{estadistica.valor(estadisticasNota)}</td>
                  {plantilla.columnas.desempeno && <td />}
                  {plantilla.columnas.estado && <td />}
                </tr>
              ))}
            </tfoot>
          )}
        </table>
      </div>

      {hayEntregas && (
        <p className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted">
          <span>Punto bajo la nota = lo que entregó el estudiante:</span>
          <span className="inline-flex items-center gap-1">
            <span className="h-2 w-2 rounded-full bg-success" /> a tiempo
          </span>
          <span className="inline-flex items-center gap-1">
            <span className="h-2 w-2 rounded-full bg-warning" /> con retraso
          </span>
          <span className="inline-flex items-center gap-1">
            <span className="h-2 w-2 rounded-full bg-primary" /> ya calificada
          </span>
          <span>(sin punto: aún no entrega). Pulsa el título de una actividad para ver sus evidencias.</span>
        </p>
      )}

      {planilla.bloques.some((b) => b.casillas.length === 0) && (
        <Alert tone="warning">
          Hay bloques sin casillas en este periodo: sin ellas la nota no se completa y la planilla no se puede cerrar. Agrega una nota con el botón «+» del bloque
          o programa una actividad en «Actividades y tareas».
        </Alert>
      )}
      {bloquesExcedidos.length > 0 && (
        <Alert tone="error">
          Los pesos puestos en {bloquesExcedidos.map((b) => `«${b.nombre}» (${Math.round((sumasPuestas.get(b.clave) ?? 0) * 100) / 100}%)`).join(', ')} pasan de 100%. Ajústalos para poder
          guardar.
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
            {sinGuardar === 0
              ? 'Flechas y Enter para moverte · pega un rango copiado de Excel · Ctrl+D rellena hacia abajo · Ctrl+Z deshace.'
              : `${celdas.length} nota(s) y ${pesos.length} peso(s) sin guardar.`}
          </p>
          <div className="flex gap-2">
            <Button type="button" variant="secondary" disabled={(Object.keys(ediciones).length === 0 && Object.keys(pesosEditados).length === 0) || guardando} onClick={descartar}>
              Descartar
            </Button>
            <Button type="button" isLoading={guardando} disabled={sinGuardar === 0 || hayErrores} onClick={() => void guardar()}>
              Guardar cambios
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
