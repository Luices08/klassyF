import { type FormEvent, useMemo, useState } from 'react';
import { Alert, errorMessage } from '../ui/Alert';
import { Chip, type Tone } from '../ui/Badge';
import { Drawer } from '../ui/Drawer';
import { Input, Select, Textarea } from '../ui/Field';
import {
  type CatalogoConvivencia,
  type Descriptor,
  type EstudianteObservable,
  type ObservacionVista,
  type TipoSituacion,
  useEnmendarObservacion,
  useRegistrarObservacion,
} from '../../hooks/useObservaciones';

const MAX_COMENTARIO = 2000;
const TONO_SITUACION: Record<TipoSituacion, Tone> = { I: 'blue', II: 'orange', III: 'red' };

/** Fecha de hoy en el calendario local (YYYY-MM-DD), el formato que espera el servidor. */
const hoyLocal = () => new Date().toLocaleDateString('en-CA');

const vistaPrevia = (descriptores: Descriptor[], comentario: string) =>
  [...descriptores.map((d) => (d.codigo ? `${d.codigo}. ${d.texto}` : d.texto)), comentario.trim()].filter(Boolean).join('\n');

interface Props {
  open: boolean;
  onClose: () => void;
  catalogo: CatalogoConvivencia;
  /** Registro nuevo: uno o varios estudiantes (un registro por cada uno). */
  estudiantes?: EstudianteObservable[];
  /** Enmienda: la observación que se corrige (tipo y fecha no cambian). */
  observacion?: ObservacionVista;
}

export function ObservacionDrawer(props: Props) {
  if (!props.open) return null;
  return <Formulario {...props} />;
}

function Formulario({ onClose, catalogo, estudiantes = [], observacion }: Props) {
  const enmienda = Boolean(observacion);
  const registrar = useRegistrarObservacion();
  const enmendar = useEnmendarObservacion();
  const mutation = enmienda ? enmendar : registrar;

  const tiposActivos = catalogo.tipos;
  const [tipoId, setTipoId] = useState(observacion?.tipo_id ?? tiposActivos[0]?._id ?? '');
  const [seleccion, setSeleccion] = useState<Set<string>>(
    () => new Set((observacion?.descriptores ?? []).map((d) => d.descriptor_id))
  );
  const [comentario, setComentario] = useState(observacion?.comentario ?? '');
  const [fecha, setFecha] = useState(hoyLocal());

  const tipo = catalogo.tipos.find((t) => t._id === tipoId);

  // Al enmendar se conservan las frases que la observación ya traía aunque hoy estén inactivas.
  const disponibles = useMemo(() => {
    const delTipo = catalogo.descriptores.filter((d) => d.tipo_id === tipoId);
    const previos = (observacion?.descriptores ?? []).filter((p) => !delTipo.some((d) => d._id === p.descriptor_id));
    return [
      ...delTipo,
      ...previos.map(
        (p): Descriptor => ({
          _id: p.descriptor_id,
          tipo_id: tipoId,
          categoria_id: null,
          codigo: p.codigo,
          texto: p.texto,
          tipo_situacion: p.tipo_situacion,
          descuento_decimas: null,
          orden: 0,
          estado: 'inactivo',
        })
      ),
    ];
  }, [catalogo.descriptores, tipoId, observacion]);

  const porCategoria = new Map<string, Descriptor[]>();
  for (const d of disponibles) {
    const clave = d.categoria_id ?? '';
    porCategoria.set(clave, [...(porCategoria.get(clave) ?? []), d]);
  }
  const grupos = [...porCategoria.entries()].map(([id, items]) => ({
    nombre: catalogo.categorias.find((c) => c._id === id)?.nombre ?? 'Otras',
    items,
  }));

  const elegidos = disponibles.filter((d) => seleccion.has(d._id));
  const esDisciplinaria = tipo?.familia === 'DISCIPLINARIA';
  const faltaContenido = (elegidos.length === 0 && !comentario.trim()) || (esDisciplinaria && !comentario.trim());
  const sinDestino = !enmienda && estudiantes.length === 0;

  const alternar = (id: string) =>
    setSeleccion((previa) => {
      const siguiente = new Set(previa);
      if (siguiente.has(id)) siguiente.delete(id);
      else siguiente.add(id);
      return siguiente;
    });

  const guardar = async (e: FormEvent) => {
    e.preventDefault();
    if (observacion) {
      await enmendar.mutateAsync({ id: observacion._id, descriptores_ids: [...seleccion], comentario });
    } else {
      await registrar.mutateAsync({
        estudiantes_ids: estudiantes.map((s) => s.student_id),
        tipo_id: tipoId,
        descriptores_ids: [...seleccion],
        comentario,
        fecha_hecho: fecha,
      });
    }
    onClose();
  };

  return (
    <Drawer
      open
      size="lg"
      title={enmienda ? 'Enmendar observación' : 'Registrar observación'}
      subtitle={
        enmienda
          ? 'La versión anterior queda guardada en el historial.'
          : estudiantes.length === 1
            ? `${estudiantes[0]?.nombre} ${estudiantes[0]?.apellido} · ${estudiantes[0]?.grupo}`
            : `${estudiantes.length} estudiantes: se crea un registro independiente por cada uno`
      }
      onClose={onClose}
      onSubmit={guardar}
      submitLabel={enmienda ? 'Guardar enmienda' : 'Registrar'}
      isSubmitting={mutation.isPending}
      submitDisabled={faltaContenido || !tipoId || sinDestino}
    >
      {mutation.isError && <Alert tone="error">{errorMessage(mutation.error)}</Alert>}
      <Alert tone="info">
        Describe solo hechos observables. No escribas diagnósticos ni datos de salud, ni nombres de otros estudiantes.
      </Alert>

      {!enmienda && (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Select
            label="Tipo de observación"
            value={tipoId}
            onChange={(e) => {
              setTipoId(e.target.value);
              setSeleccion(new Set());
            }}
          >
            {tiposActivos.map((t) => (
              <option key={t._id} value={t._id}>
                {t.nombre}
              </option>
            ))}
          </Select>
          <Input label="Fecha del hecho" type="date" max={hoyLocal()} value={fecha} onChange={(e) => setFecha(e.target.value)} required />
        </div>
      )}
      {enmienda && observacion && <Chip tone="neutral">{observacion.tipo_nombre}</Chip>}

      {grupos.length > 0 && (
        <fieldset className="space-y-3">
          <legend className="mb-1 text-label text-body">
            {esDisciplinaria ? 'Faltas del manual de convivencia' : 'Frases del catálogo'}
          </legend>
          {grupos.map((g) => (
            <div key={g.nombre} className="rounded-xl border border-border p-3">
              <p className="mb-2 text-label text-ink">{g.nombre}</p>
              <ul className="space-y-1.5">
                {g.items.map((d) => (
                  <li key={d._id}>
                    <label className="flex cursor-pointer items-start gap-2 text-sm text-body">
                      <input
                        type="checkbox"
                        className="mt-0.5 h-4 w-4 rounded border-border text-primary focus:ring-primary"
                        checked={seleccion.has(d._id)}
                        onChange={() => alternar(d._id)}
                      />
                      <span>
                        {d.codigo && <span className="font-semibold text-ink">{d.codigo} </span>}
                        {d.texto}
                        {d.tipo_situacion && (
                          <span className="ml-1.5 align-middle">
                            <Chip tone={TONO_SITUACION[d.tipo_situacion]}>Tipo {d.tipo_situacion}</Chip>
                          </span>
                        )}
                      </span>
                    </label>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </fieldset>
      )}
      {grupos.length === 0 && (
        <p className="text-sm text-muted">Este tipo todavía no tiene frases: escribe el comentario.</p>
      )}

      <Textarea
        label={esDisciplinaria ? 'Descripción de los hechos' : 'Comentario'}
        rows={4}
        maxLength={MAX_COMENTARIO}
        value={comentario}
        onChange={(e) => setComentario(e.target.value)}
        hint={`${comentario.length}/${MAX_COMENTARIO}${esDisciplinaria ? ' · obligatorio en una observación disciplinaria' : ''}`}
      />

      <div>
        <p className="mb-1.5 text-label text-body">Vista previa del texto final</p>
        <p className="min-h-12 whitespace-pre-line rounded-lg bg-soft p-3 text-sm text-body">
          {vistaPrevia(elegidos, comentario) || 'Elige frases o escribe un comentario.'}
        </p>
      </div>
    </Drawer>
  );
}
