import { useState } from 'react';
import { useActualizarComponentesEvaluativos } from '../../hooks/useAniosLectivos';
import type { AcademicYear } from '../../types/domain';
import { Alert, errorMessage } from '../ui/Alert';
import { Chip } from '../ui/Badge';
import { Button } from '../ui/Button';
import { Card, CardHeader } from '../ui/Card';
import { Input } from '../ui/Field';
import { IconButton } from '../ui/IconButton';
import { PlusIcon, TrashIcon } from '../ui/icons';

interface FilaBloque {
  /** Los bloques que ya existían conservan su clave: las actividades y notas de los docentes la referencian. */
  clave?: string;
  nombre: string;
  porcentaje: string;
  max_casillas: string;
}

const MAX_BLOQUES = 8;
const MAX_CASILLAS = 50;
const CASILLAS_EN_VISTA_PREVIA = 6;

// Puntos de partida: el administrador los ajusta. Ningún colegio está obligado a usarlos.
const PLANTILLAS: Array<{ nombre: string; bloques: Array<{ nombre: string; porcentaje: number; max_casillas: number }> }> = [
  {
    nombre: 'Saber · Hacer · Ser',
    bloques: [
      { nombre: 'Saber (cognitivo)', porcentaje: 40, max_casillas: 10 },
      { nombre: 'Hacer (procedimental)', porcentaje: 40, max_casillas: 10 },
      { nombre: 'Ser (actitudinal)', porcentaje: 20, max_casillas: 5 },
    ],
  },
  {
    nombre: 'Hetero, auto, coevaluación y comportamiento',
    bloques: [
      { nombre: 'Heteroevaluación', porcentaje: 70, max_casillas: 30 },
      { nombre: 'Autoevaluación', porcentaje: 15, max_casillas: 1 },
      { nombre: 'Coevaluación', porcentaje: 10, max_casillas: 1 },
      { nombre: 'Comportamiento', porcentaje: 5, max_casillas: 1 },
    ],
  },
  {
    nombre: 'Hetero y autoevaluación',
    bloques: [
      { nombre: 'Heteroevaluación', porcentaje: 80, max_casillas: 30 },
      { nombre: 'Autoevaluación', porcentaje: 20, max_casillas: 1 },
    ],
  },
  { nombre: 'Un solo bloque', bloques: [{ nombre: 'Valoración del periodo', porcentaje: 100, max_casillas: 30 }] },
];

// Los 4 tonos de la guía visual rotan por bloque en la barra de reparto; el color solo distingue, no significa nada.
const TONOS_BARRA = ['bg-primary', 'bg-success', 'bg-warning', 'bg-danger', 'bg-ink', 'bg-muted', 'bg-primary/60', 'bg-success/60'];

const filasDe = (anio: AcademicYear): FilaBloque[] =>
  anio.componentes_efectivos.map((c) => ({ clave: c.clave, nombre: c.nombre, porcentaje: String(c.porcentaje), max_casillas: String(c.max_casillas) }));

/**
 * El molde de la planilla (CU-ADM-04): el administrador divide el 100% de la nota en bloques y fija cuántas casillas
 * (actividades o notas) admite cada uno. Es la plantilla que usan todos los docentes del colegio el resto del año: en su
 * planilla cada bloque aparece con ese cupo, y ellos ponen las notas y, si quieren, el peso de cada casilla dentro del bloque.
 * Se puede ajustar hasta que se registre la primera nota del año; después queda congelado para no alterar los promedios en curso.
 */
export function MoldePlanilla({ anio }: { anio: AcademicYear }) {
  // La clave reinicia el formulario al cambiar de año o cuando el servidor devuelve lo guardado.
  return <Formulario key={`${anio._id}-${JSON.stringify(anio.componentes_efectivos)}`} anio={anio} />;
}

function Formulario({ anio }: { anio: AcademicYear }) {
  const guardar = useActualizarComponentesEvaluativos();
  const [filas, setFilas] = useState<FilaBloque[]>(() => filasDe(anio));
  const [guardado, setGuardado] = useState(false);
  const editable = anio.evaluacion_editable;

  const cambiar = (indice: number, cambios: Partial<FilaBloque>) => {
    setGuardado(false);
    setFilas((prev) => prev.map((f, i) => (i === indice ? { ...f, ...cambios } : f)));
  };
  const reemplazar = (siguientes: FilaBloque[]) => {
    setGuardado(false);
    setFilas(siguientes);
  };

  const suma = Math.round(filas.reduce((total, f) => total + (Number(f.porcentaje) || 0), 0) * 100) / 100;
  const nombres = filas.map((f) => f.nombre.trim().toLowerCase());
  const casillasInvalidas = (f: FilaBloque) => !Number.isInteger(Number(f.max_casillas)) || Number(f.max_casillas) < 1 || Number(f.max_casillas) > MAX_CASILLAS;
  const problema =
    filas.length === 0
      ? 'Define al menos un bloque.'
      : filas.some((f) => f.nombre.trim() === '' || f.porcentaje === '' || Number(f.porcentaje) < 0)
        ? 'Cada bloque necesita nombre y porcentaje.'
        : new Set(nombres).size !== nombres.length
          ? 'Hay dos bloques con el mismo nombre.'
          : filas.some(casillasInvalidas)
            ? `Las casillas máximas de cada bloque deben ser un número entero entre 1 y ${MAX_CASILLAS}.`
            : suma !== 100
              ? 'Los porcentajes deben sumar exactamente 100%.'
              : null;
  const sinCambios = JSON.stringify(filas) === JSON.stringify(filasDe(anio));

  async function enviar() {
    guardar.reset();
    try {
      await guardar.mutateAsync({
        anioId: anio._id,
        componentes: filas.map((f) => ({ ...(f.clave ? { clave: f.clave } : {}), nombre: f.nombre.trim(), porcentaje: Number(f.porcentaje), max_casillas: Number(f.max_casillas) })),
      });
      setGuardado(true);
    } catch {
      // el detalle lo muestra `guardar.error`
    }
  }

  return (
    <div className="space-y-4">
      {!editable && (
        <Alert tone="info">
          {anio.estado === 'CERRADO'
            ? 'El año está cerrado: el molde de la planilla solo se puede consultar.'
            : 'Ya se registró la primera nota del año: el molde queda congelado para no alterar los promedios en curso y solo se puede consultar. Para el próximo año se copiará este mismo molde.'}
        </Alert>
      )}
      {editable && (
        <p className="text-xs text-muted">
          Se puede ajustar hasta que se registre la primera nota del año. Un año nuevo arranca con el molde del anterior.
        </p>
      )}
      {guardar.isError && <Alert tone="error">{errorMessage(guardar.error)}</Alert>}
      {guardado && <Alert tone="success">Molde guardado. Las planillas de los docentes ya lo usan.</Alert>}

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[3fr_2fr]">
        <Card>
          <CardHeader
            title="Bloques de la nota"
            subtitle="Divide el 100% de la nota de cada asignatura y fija cuántas casillas puede tener cada bloque."
            action={<Chip tone={suma === 100 ? 'green' : 'red'}>Suma: {suma}%</Chip>}
          />
          <ul className="space-y-3">
            {filas.map((fila, i) => (
              <li key={fila.clave ?? `nuevo-${i}`} className="grid grid-cols-1 items-end gap-3 rounded-lg border border-border p-3 sm:grid-cols-[1fr_6rem_7rem_auto]">
                <Input label="Nombre del bloque" value={fila.nombre} maxLength={60} disabled={!editable} onChange={(e) => cambiar(i, { nombre: e.target.value })} />
                <Input
                  label="Porcentaje"
                  type="number"
                  min={0}
                  max={100}
                  step="any"
                  disabled={!editable}
                  value={fila.porcentaje}
                  onChange={(e) => cambiar(i, { porcentaje: e.target.value })}
                />
                <Input
                  label="Casillas máx."
                  type="number"
                  min={1}
                  max={MAX_CASILLAS}
                  step={1}
                  disabled={!editable}
                  value={fila.max_casillas}
                  error={fila.max_casillas !== '' && casillasInvalidas(fila) ? `1 a ${MAX_CASILLAS}` : undefined}
                  onChange={(e) => cambiar(i, { max_casillas: e.target.value })}
                />
                <IconButton
                  tone="danger"
                  label="Quitar bloque"
                  icon={<TrashIcon />}
                  disabled={!editable || filas.length === 1}
                  onClick={() => reemplazar(filas.filter((_, j) => j !== i))}
                />
              </li>
            ))}
          </ul>

          <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
            <Button
              type="button"
              variant="outline"
              disabled={!editable || filas.length >= MAX_BLOQUES}
              onClick={() => reemplazar([...filas, { nombre: '', porcentaje: '0', max_casillas: '1' }])}
            >
              <PlusIcon className="h-4 w-4" />
              Agregar bloque
            </Button>
            <Button type="button" isLoading={guardar.isPending} disabled={!editable || problema !== null || sinCambios} onClick={() => void enviar()}>
              Guardar molde
            </Button>
          </div>
          {problema && <p className="mt-2 text-xs text-danger">{problema}</p>}

          {editable && (
            <div className="mt-5 border-t border-border pt-4">
              <p className="mb-2 text-label text-body">Partir de un ejemplo</p>
              <div className="flex flex-wrap gap-2">
                {PLANTILLAS.map((p) => (
                  <Button
                    key={p.nombre}
                    type="button"
                    variant="secondary"
                    onClick={() =>
                      // Los bloques que ya existen conservan su clave (por posición) para no soltar las casillas que ya tienen.
                      reemplazar(
                        p.bloques.map((b, i) => ({
                          ...(filas[i]?.clave ? { clave: filas[i]?.clave } : {}),
                          nombre: b.nombre,
                          porcentaje: String(b.porcentaje),
                          max_casillas: String(b.max_casillas),
                        }))
                      )
                    }
                  >
                    {p.nombre}
                  </Button>
                ))}
              </div>
              <p className="mt-2 text-xs text-muted">Solo rellena el formulario; nada cambia hasta que guardes.</p>
            </div>
          )}
        </Card>

        <Card>
          <CardHeader title="Así la ve el docente" subtitle="Cada bloque con su cupo de casillas; en cada una escribe sus notas." />
          <div className="mb-4 flex h-3 overflow-hidden rounded-full bg-soft" role="img" aria-label="Reparto del 100% de la nota entre los bloques">
            {filas.map((f, i) => (
              <div key={f.clave ?? `barra-${i}`} className={TONOS_BARRA[i % TONOS_BARRA.length]} style={{ width: `${Math.max(0, Number(f.porcentaje) || 0)}%` }} title={`${f.nombre}: ${f.porcentaje}%`} />
            ))}
          </div>
          <div className="space-y-3">
            {filas.map((f, i) => {
              const maximo = Math.max(0, Math.min(MAX_CASILLAS, Math.floor(Number(f.max_casillas) || 0)));
              const visibles = Math.min(maximo, CASILLAS_EN_VISTA_PREVIA);
              return (
                <div key={f.clave ?? `vista-${i}`} className="rounded-lg border border-border p-3">
                  <div className="flex items-center justify-between gap-2">
                    <p className="flex items-center gap-2 text-sm font-semibold text-ink">
                      <span className={`h-2.5 w-2.5 rounded-full ${TONOS_BARRA[i % TONOS_BARRA.length]}`} />
                      {f.nombre.trim() || 'Bloque sin nombre'}
                    </p>
                    <Chip tone="blue">{Number(f.porcentaje) || 0}%</Chip>
                  </div>
                  <div className="mt-2 flex flex-wrap items-center gap-1.5">
                    {Array.from({ length: visibles }, (_, k) => (
                      <span key={k} className="inline-flex h-7 min-w-[2.75rem] items-center justify-center rounded-md border border-border bg-surface px-1 text-xs text-muted">
                        nota {k + 1}
                      </span>
                    ))}
                    {maximo > visibles && <span className="text-xs text-muted">… hasta {maximo}</span>}
                  </div>
                  <p className="mt-1.5 text-xs text-muted">
                    {maximo === 1 ? 'Una sola casilla.' : `Hasta ${maximo} casillas.`} El docente puede darle a cada casilla un % del bloque; sin %, se reparten por igual.
                  </p>
                </div>
              );
            })}
          </div>
        </Card>
      </div>
    </div>
  );
}
