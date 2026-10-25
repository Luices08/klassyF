import { type FormEvent, useState } from 'react';
import { Alert, errorMessage } from '../ui/Alert';
import { Chip } from '../ui/Badge';
import { Drawer } from '../ui/Drawer';
import { Input, Textarea } from '../ui/Field';
import { SelectBuscable } from '../ui/SelectBuscable';
import { useAuth } from '../../context/AuthContext';
import { SelectorEstudiantesRegistro } from './SelectorEstudiantesRegistro';
import {
  type CatalogoConvivencia,
  type EstudianteObservable,
  type ObservacionVista,
  useEnmendarObservacion,
  useRegistrarObservacion,
} from '../../hooks/useObservaciones';

const MAX_DESCRIPCION = 2000;
const MAX_COMPROMISO = 500;

/** Fecha de hoy en el calendario local (YYYY-MM-DD), el formato que espera el servidor. */
const hoyLocal = () => new Date().toLocaleDateString('en-CA');

interface Props {
  open: boolean;
  onClose: () => void;
  /** Solo para registrar: al enmendar no hace falta. */
  catalogo?: CatalogoConvivencia;
  /** Registro nuevo: los que ya se marcaron en la tabla (opcional); en el formulario se eligen o cambian. Un registro por cada estudiante. */
  estudiantes?: EstudianteObservable[];
  /** Enmienda: el registro que se corrige (la clase, el tipo y la fecha no cambian). */
  observacion?: ObservacionVista;
}

/** Registrar una observación (M14, cotidiana) o enmendar una observación o una falta Tipo I. */
export function ObservacionDrawer(props: Props) {
  if (!props.open) return null;
  return <Formulario {...props} />;
}

const SIN_CATALOGO: CatalogoConvivencia = { tipos: [], faltas: [] };

function Formulario({ onClose, catalogo = SIN_CATALOGO, estudiantes: inicial = [], observacion }: Props) {
  const esOrientador = useAuth().user?.rol === 'ORIENTADOR';
  const enmienda = Boolean(observacion);
  const registrar = useRegistrarObservacion();
  const enmendar = useEnmendarObservacion();
  const mutation = enmienda ? enmendar : registrar;

  const esFalta = observacion?.clase === 'FALTA';
  // Una falta Tipo II/III que sigue su curso en convivencia (tiene solicitud o caso): la versión del estudiante y el acuerdo los gestiona convivencia, no se editan aquí.
  // La Tipo II que el docente resolvió él mismo no tiene solicitud y se edita como una Tipo I.
  const faltaLeve = esFalta && (observacion?.gravedad === 'I' || !observacion?.solicitud_id);
  const [tipoId, setTipoId] = useState(catalogo.tipos[0]?._id ?? '');
  const [fecha, setFecha] = useState(hoyLocal());
  const [descripcion, setDescripcion] = useState(observacion?.descripcion ?? '');
  const [compromiso, setCompromiso] = useState(observacion?.compromiso ?? '');
  const [versionEstudiante, setVersionEstudiante] = useState(observacion?.version_estudiante ?? '');
  const [requiereCitacion, setRequiereCitacion] = useState(observacion?.requiere_citacion ?? false);
  // El seguimiento psicosocial de orientación es confidencial siempre, lo escriba quien lo escriba o lo corrija quien lo corrija.
  const siempreConfidencial = esOrientador || observacion?.contexto === 'ORIENTACION';
  const [confidencial, setConfidencial] = useState(siempreConfidencial ? true : (observacion?.confidencial ?? false));

  const [estudiantes, setEstudiantes] = useState(inicial);
  const sinDestino = !enmienda && estudiantes.length === 0;

  const guardar = async (e: FormEvent) => {
    e.preventDefault();
    if (observacion) {
      await enmendar.mutateAsync({
        id: observacion._id,
        descripcion,
        ...(esFalta ? (faltaLeve ? { compromiso, version_estudiante: versionEstudiante } : {}) : { compromiso, version_estudiante: versionEstudiante, requiere_citacion: requiereCitacion, confidencial }),
      });
    } else {
      await registrar.mutateAsync({
        estudiantes_ids: estudiantes.map((s) => s.student_id),
        tipo_id: tipoId,
        descripcion,
        compromiso: compromiso || undefined,
        version_estudiante: versionEstudiante || undefined,
        requiere_citacion: requiereCitacion,
        confidencial,
        fecha_hecho: fecha,
      });
    }
    onClose();
  };

  return (
    <Drawer
      open
      size="lg"
      title={enmienda ? (esFalta ? 'Editar falta' : 'Editar observación') : 'Registrar observación'}
      subtitle={
        enmienda
          ? 'La versión anterior queda guardada en el historial del registro.'
          : estudiantes.length === 0
            ? 'Elige a quién se registra'
            : estudiantes.length === 1
              ? `${estudiantes[0]?.nombre} ${estudiantes[0]?.apellido} · ${estudiantes[0]?.grupo}`
              : `${estudiantes.length} estudiantes: se crea un registro independiente por cada uno`
      }
      onClose={onClose}
      onSubmit={guardar}
      submitLabel={enmienda ? 'Guardar cambios' : 'Registrar'}
      isSubmitting={mutation.isPending}
      submitDisabled={!descripcion.trim() || (!enmienda && !tipoId) || sinDestino}
    >
      {mutation.isError && <Alert tone="error">{errorMessage(mutation.error)}</Alert>}
      <Alert tone="info">
        Describe solo hechos observables. No escribas diagnósticos ni datos de salud, ni nombres de otros estudiantes.
      </Alert>

      {!enmienda && <SelectorEstudiantesRegistro seleccion={estudiantes} onChange={setEstudiantes} />}

      {!enmienda && (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <SelectBuscable
            label="Tipo de observación"
            required
            value={tipoId}
            onChange={setTipoId}
            placeholder="Busca el tipo…"
            opciones={catalogo.tipos.map((t) => ({ value: t._id, label: t.nombre }))}
          />
          <Input label="Fecha del hecho" type="date" max={hoyLocal()} value={fecha} onChange={(e) => setFecha(e.target.value)} required />
        </div>
      )}
      {enmienda && observacion?.tipo_nombre && <Chip tone="neutral">{observacion.tipo_nombre}</Chip>}
      {!enmienda && catalogo.tipos.length === 0 && (
        <Alert tone="warning">Aún no hay tipos de observación. Pídele al coordinador de convivencia que los configure.</Alert>
      )}

      <Textarea
        label={esFalta ? 'Hechos' : 'Descripción de los hechos'}
        rows={4}
        maxLength={MAX_DESCRIPCION}
        value={descripcion}
        onChange={(e) => setDescripcion(e.target.value)}
        required
        hint={`${descripcion.length}/${MAX_DESCRIPCION} · relata lo ocurrido de forma objetiva`}
      />

      {(!esFalta || faltaLeve) && (
        <Textarea
          label="Versión del estudiante (opcional)"
          rows={3}
          maxLength={MAX_DESCRIPCION}
          value={versionEstudiante}
          onChange={(e) => setVersionEstudiante(e.target.value)}
        />
      )}

      {(!esFalta || faltaLeve) && (
        <Textarea
          label={faltaLeve ? 'Acuerdo o compromiso formativo (opcional)' : 'Compromiso (opcional)'}
          rows={2}
          maxLength={MAX_COMPROMISO}
          value={compromiso}
          onChange={(e) => setCompromiso(e.target.value)}
          hint={faltaLeve ? undefined : 'Solo si hay un acuerdo: para situaciones cotidianas no hace falta redactar uno.'}
        />
      )}

      {!esFalta && (
        <>
          <label className="flex items-start gap-2 text-sm text-body">
            <input
              type="checkbox"
              className="mt-0.5 h-4 w-4 rounded border-border text-primary focus:ring-primary"
              checked={requiereCitacion}
              onChange={(e) => setRequiereCitacion(e.target.checked)}
            />
            <span>Amerita citar al acudiente</span>
          </label>
          <label className="flex items-start gap-2 text-sm text-body">
            <input
              type="checkbox"
              className="mt-0.5 h-4 w-4 rounded border-border text-primary focus:ring-primary"
              checked={confidencial}
              disabled={siempreConfidencial}
              onChange={(e) => setConfidencial(e.target.checked)}
            />
            <span>
              Confidencial
              <span className="block text-xs text-muted">
                {siempreConfidencial
                  ? 'El seguimiento de orientación siempre es confidencial y solo lo lee quien lo escribió.'
                  : 'Solo la leerán tú, orientación y coordinación de convivencia. Úsalo si contiene datos sensibles.'}
              </span>
            </span>
          </label>
        </>
      )}
    </Drawer>
  );
}
