import { useMemo, useState } from 'react';
import { Alert, errorMessage } from '../ui/Alert';
import { Chip, EstadoEntregaBadge } from '../ui/Badge';
import { Button } from '../ui/Button';
import { Input } from '../ui/Field';
import { Spinner } from '../ui/Spinner';
import { Tabs } from '../ui/Tabs';
import { AccesoEspecialForm } from './AccesoEspecialForm';
import {
  type ActividadDetalleGestion,
  type FilaEntrega,
  descargarEntrega,
  useCalificarEntrega,
  useElegirIntentoValido,
  useEntregasDeActividad,
} from '../../hooks/useActividades';
import { ORIGENES_NOTA_ETIQUETA, formatoInstante } from '../../lib/actividades';
import type { EscalaEvaluacion } from '../../types/domain';

type Filtro = 'todos' | 'entregaron' | 'sin_entregar' | 'por_calificar';

const entrego = (f: FilaEntrega) => (f.entrega?.intentos.length ?? 0) > 0;

interface EntregasRevisionProps {
  actividad: ActividadDetalleGestion;
  /** Escala del año lectivo: acota la nota que se puede digitar; el servidor la vuelve a validar. */
  escala: EscalaEvaluacion | null;
  /** El docente titular califica y da accesos especiales; coordinación y administración solo consultan. */
  puedeGestionar: boolean;
}

/** Los estudiantes del grupo con lo que entregaron, la entrega válida (si hubo varias), el plazo personal y la nota. */
export function EntregasRevision({ actividad, escala, puedeGestionar }: EntregasRevisionProps) {
  const entregas = useEntregasDeActividad(actividad._id);
  const [filtro, setFiltro] = useState<Filtro>('todos');
  const [busqueda, setBusqueda] = useState('');

  const filas = useMemo(() => entregas.data ?? [], [entregas.data]);
  const conteo = useMemo(
    () => ({
      todos: filas.length,
      entregaron: filas.filter(entrego).length,
      sin_entregar: filas.filter((f) => !entrego(f) && f.estado !== 'CALIFICADA').length,
      por_calificar: filas.filter((f) => f.estado !== 'CALIFICADA' && (entrego(f) || !actividad.requiere_entrega)).length,
    }),
    [filas, actividad.requiere_entrega]
  );

  const visibles = useMemo(() => {
    const q = busqueda.trim().toLowerCase();
    return filas.filter((f) => {
      if (filtro === 'entregaron' && !entrego(f)) return false;
      if (filtro === 'sin_entregar' && (entrego(f) || f.estado === 'CALIFICADA')) return false;
      if (filtro === 'por_calificar' && !(f.estado !== 'CALIFICADA' && (entrego(f) || !actividad.requiere_entrega))) return false;
      return !q || `${f.estudiante.apellido} ${f.estudiante.nombre} ${f.estudiante.numero_documento}`.toLowerCase().includes(q);
    });
  }, [filas, filtro, busqueda, actividad.requiere_entrega]);

  return (
    <div className="space-y-3">
      <Tabs
        value={filtro}
        onChange={(k) => setFiltro(k as Filtro)}
        items={[
          { key: 'todos', label: `Todos (${conteo.todos})` },
          ...(actividad.requiere_entrega
            ? [
                { key: 'entregaron', label: `Entregaron (${conteo.entregaron})` },
                { key: 'sin_entregar', label: `Sin entregar (${conteo.sin_entregar})` },
              ]
            : []),
          { key: 'por_calificar', label: `Por calificar (${conteo.por_calificar})` },
        ]}
      />
      <Input label="Buscar estudiante" hideLabel placeholder="Buscar por nombre o documento…" value={busqueda} onChange={(e) => setBusqueda(e.target.value)} />

      {entregas.isLoading && (
        <div className="flex justify-center p-8">
          <Spinner />
        </div>
      )}
      {entregas.isError && <Alert tone="error">{errorMessage(entregas.error)}</Alert>}
      {entregas.data && filas.length === 0 && <Alert tone="info">Este grupo no tiene estudiantes con matrícula activa.</Alert>}
      {entregas.data && filas.length > 0 && visibles.length === 0 && <p className="py-4 text-center text-sm text-muted">Nadie coincide con este filtro.</p>}

      <ul className="space-y-3">
        {visibles.map((fila) => (
          <FilaEntregaEstudiante
            key={`${fila.estudiante._id}-${fila.entrega?.fecha_calificacion ?? ''}-${fila.entrega?.intento_valido ?? ''}`}
            actividad={actividad}
            fila={fila}
            escala={escala}
            puedeGestionar={puedeGestionar}
          />
        ))}
      </ul>
    </div>
  );
}

interface FilaProps {
  actividad: ActividadDetalleGestion;
  fila: FilaEntrega;
  escala: EscalaEvaluacion | null;
  puedeGestionar: boolean;
}

function FilaEntregaEstudiante({ actividad, fila, escala, puedeGestionar }: FilaProps) {
  const { entrega } = fila;
  const calificar = useCalificarEntrega();
  const elegir = useElegirIntentoValido();
  const [nota, setNota] = useState(entrega?.calificacion_numerica?.toString() ?? '');
  const [retro, setRetro] = useState(entrega?.retroalimentacion ?? '');
  const [mensaje, setMensaje] = useState<{ tone: 'success' | 'error'; texto: string } | null>(null);
  const [descargando, setDescargando] = useState<number | null>(null);
  const [verAcceso, setVerAcceso] = useState(false);

  const notaNumerica = Number(nota);
  const notaValida = nota.trim() !== '' && Number.isFinite(notaNumerica) && notaNumerica >= 0;
  const intentos = entrega?.intentos ?? [];
  const variosIntentos = intentos.length > 1;
  const bloqueadaPorElegir = Boolean(entrega?.requiere_elegir_intento);
  const puedeDarAcceso = actividad.requiere_entrega && typeof entrega?.calificacion_numerica !== 'number';

  async function bajar(numero: number, nombre: string | null) {
    if (!entrega) return;
    setMensaje(null);
    setDescargando(numero);
    try {
      await descargarEntrega(entrega._id, nombre ?? 'entrega', numero);
    } catch (error) {
      setMensaje({ tone: 'error', texto: errorMessage(error) });
    } finally {
      setDescargando(null);
    }
  }

  async function elegirValida(numero: number) {
    setMensaje(null);
    try {
      await elegir.mutateAsync({ actividadId: actividad._id, studentId: fila.estudiante._id, intento: numero });
    } catch (error) {
      setMensaje({ tone: 'error', texto: errorMessage(error) });
    }
  }

  async function guardarNota() {
    setMensaje(null);
    try {
      await calificar.mutateAsync({
        actividadId: actividad._id,
        student_id: fila.estudiante._id,
        calificacion_numerica: notaNumerica,
        retroalimentacion: retro.trim(),
      });
      setMensaje({ tone: 'success', texto: 'Nota guardada.' });
    } catch (error) {
      setMensaje({ tone: 'error', texto: errorMessage(error) });
    }
  }

  const cambioExterno = entrega?.ultimo_cambio_nota && entrega.ultimo_cambio_nota.origen !== 'ACTIVIDAD' ? entrega.ultimo_cambio_nota : null;

  return (
    <li className="space-y-3 rounded-xl border border-border bg-surface p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="font-semibold text-ink">
            {fila.estudiante.apellido} {fila.estudiante.nombre}
          </p>
          <p className="text-xs text-muted">Documento {fila.estudiante.numero_documento}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {fila.acceso_especial && <Chip tone="blue">Plazo personal</Chip>}
          {variosIntentos && <Chip tone="neutral">{intentos.length} entregas</Chip>}
          {entrega?.con_retraso && <Chip tone="orange">Con retraso</Chip>}
          <EstadoEntregaBadge value={fila.estado} sinEntrega />
        </div>
      </div>

      {intentos.length > 0 && (
        <ul className="space-y-2">
          {intentos.map((i) => (
            <li key={i.numero} className={`space-y-1.5 rounded-lg border p-3 text-sm ${i.considerado ? 'border-primary/40 bg-primary-soft/40' : 'border-border bg-soft'}`}>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex flex-wrap items-center gap-2">
                  {variosIntentos && puedeGestionar && (
                    <label className="flex items-center gap-1.5 font-semibold text-ink">
                      <input
                        type="radio"
                        name={`valida-${fila.estudiante._id}`}
                        checked={entrega?.intento_valido === i.numero}
                        disabled={elegir.isPending || typeof entrega?.calificacion_numerica === 'number'}
                        onChange={() => void elegirValida(i.numero)}
                      />
                      Entrega {i.numero}
                    </label>
                  )}
                  {(!variosIntentos || !puedeGestionar) && <span className="font-semibold text-ink">{variosIntentos ? `Entrega ${i.numero}` : 'Entrega'}</span>}
                  <span className="text-xs text-muted">{formatoInstante(i.fecha_entrega)}</span>
                  {i.con_retraso && <Chip tone="orange">Con retraso</Chip>}
                  {i.acceso_especial && <Chip tone="blue">Plazo personal</Chip>}
                  {variosIntentos && i.considerado && <Chip tone="green">Válida</Chip>}
                </div>
                {i.tiene_archivo && (
                  <Button type="button" variant="soft-edit" isLoading={descargando === i.numero} onClick={() => void bajar(i.numero, i.archivo_nombre)}>
                    Descargar {i.archivo_nombre ?? 'archivo'}
                  </Button>
                )}
              </div>
              {i.texto_entrega && <p className="whitespace-pre-wrap rounded-lg bg-surface p-3 text-body">{i.texto_entrega}</p>}
            </li>
          ))}
        </ul>
      )}

      {bloqueadaPorElegir && (
        <Alert tone="warning">
          Este estudiante entregó {intentos.length} veces. {puedeGestionar ? 'Marca cuál es la entrega válida para poder calificar.' : 'El docente debe marcar cuál es la entrega válida.'}
        </Alert>
      )}

      {cambioExterno && (
        <p className="text-xs text-warning">
          Esta nota se modificó desde {ORIGENES_NOTA_ETIQUETA[cambioExterno.origen]} ({formatoInstante(cambioExterno.fecha)}).
        </p>
      )}

      {puedeGestionar ? (
        <div className="grid grid-cols-1 items-end gap-3 sm:grid-cols-[8rem_1fr_auto]">
          <Input
            label="Nota"
            type="number"
            inputMode="decimal"
            min={escala?.nota_minima ?? 0}
            max={escala?.nota_maxima}
            step="0.1"
            value={nota}
            disabled={bloqueadaPorElegir}
            onChange={(e) => setNota(e.target.value)}
          />
          <Input label="Retroalimentación" value={retro} disabled={bloqueadaPorElegir} onChange={(e) => setRetro(e.target.value)} />
          <Button type="button" isLoading={calificar.isPending} disabled={!notaValida || bloqueadaPorElegir} onClick={() => void guardarNota()}>
            Guardar nota
          </Button>
        </div>
      ) : (
        typeof entrega?.calificacion_numerica === 'number' && (
          <p className="text-sm text-body">
            Nota: <strong>{entrega.calificacion_numerica}</strong>
            {entrega.retroalimentacion ? ` · ${entrega.retroalimentacion}` : ''}
          </p>
        )
      )}
      {mensaje && <Alert tone={mensaje.tone}>{mensaje.texto}</Alert>}

      {actividad.requiere_entrega && (puedeDarAcceso || fila.acceso_especial) && (
        <div>
          <button type="button" className="text-xs font-semibold text-primary hover:underline" onClick={() => setVerAcceso((v) => !v)}>
            {verAcceso ? 'Ocultar acceso especial' : fila.acceso_especial ? 'Ver acceso especial' : 'Acceso especial (excusa válida)'}
          </button>
          {verAcceso && (
            <div className="mt-2">
              <AccesoEspecialForm
                actividadId={actividad._id}
                estudianteId={fila.estudiante._id}
                fechaEntrega={actividad.fecha_entrega}
                acceso={fila.acceso_especial}
                puedeGestionar={puedeGestionar && puedeDarAcceso}
              />
            </div>
          )}
        </div>
      )}
    </li>
  );
}
