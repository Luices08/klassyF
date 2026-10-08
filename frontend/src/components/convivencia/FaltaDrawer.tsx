import { type FormEvent, useState } from 'react';
import { Alert, errorMessage } from '../ui/Alert';
import { TipoSituacionBadge } from '../ui/Badge';
import { Drawer } from '../ui/Drawer';
import { Input, Select, Textarea } from '../ui/Field';
import {
  NOMBRES_GRAVEDAD,
  NOMBRES_ROL_INVOLUCRADO,
  ROLES_INVOLUCRADO,
  TIPOS_SITUACION,
  type CatalogoConvivencia,
  type EstudianteObservable,
  type ResultadoFalta,
  type RolInvolucrado,
  useRegistrarFalta,
} from '../../hooks/useObservaciones';

const MAX_TEXTO = 2000;
const hoyLocal = () => new Date().toLocaleDateString('en-CA');

interface Props {
  open: boolean;
  onClose: () => void;
  catalogo: CatalogoConvivencia;
  estudiantes: EstudianteObservable[];
  onRegistrada?: (resultado: ResultadoFalta) => void;
}

/**
 * Registrar una falta del manual de convivencia. El docente elige la falta y la gravedad sale de ella (no tipifica):
 * una Tipo I se queda en el Observador como antecedente pedagógico; una Tipo II o III (o una Tipo I que decide remitir) se envía a
 * convivencia con los hechos, los involucrados y las acciones de contención.
 */
export function FaltaDrawer(props: Props) {
  if (!props.open) return null;
  return <Formulario {...props} />;
}

function Formulario({ onClose, catalogo, estudiantes, onRegistrada }: Props) {
  const registrar = useRegistrarFalta();
  const [faltaId, setFaltaId] = useState('');
  const [fecha, setFecha] = useState(hoyLocal());
  const [hechos, setHechos] = useState('');
  const [version, setVersion] = useState('');
  const [compromiso, setCompromiso] = useState('');
  const [contencion, setContencion] = useState('');
  const [remitir, setRemitir] = useState(false);
  const [roles, setRoles] = useState<Record<string, RolInvolucrado>>({});

  const falta = catalogo.faltas.find((f) => f._id === faltaId);
  const grave = falta?.gravedad === 'II' || falta?.gravedad === 'III';
  const rolDe = (id: string): RolInvolucrado => (grave ? (roles[id] ?? 'PRESUNTO_RESPONSABLE') : 'PRESUNTO_RESPONSABLE');
  const hayPresunto = estudiantes.some((e) => rolDe(e.student_id) === 'PRESUNTO_RESPONSABLE');
  const incompleto =
    !falta || !hechos.trim() || estudiantes.length === 0 || !hayPresunto || (grave && contencion.trim().length < 5);

  const guardar = async (e: FormEvent) => {
    e.preventDefault();
    if (!falta) return;
    const resultado = await registrar.mutateAsync({
      falta_id: falta._id,
      fecha_hecho: fecha,
      hechos,
      involucrados: estudiantes.map((s) => ({ student_id: s.student_id, rol: rolDe(s.student_id) })),
      ...(grave ? { acciones_contencion: contencion } : { version_estudiante: version || undefined, compromiso: compromiso || undefined, remitir_comite: remitir }),
    });
    onRegistrada?.(resultado);
    onClose();
  };

  return (
    <Drawer
      open
      size="lg"
      title="Registrar falta"
      subtitle={estudiantes.length === 1 ? `${estudiantes[0]?.nombre} ${estudiantes[0]?.apellido} · ${estudiantes[0]?.grupo}` : `${estudiantes.length} estudiantes`}
      onClose={onClose}
      onSubmit={guardar}
      submitLabel={grave || remitir ? 'Registrar y enviar a convivencia' : 'Registrar'}
      isSubmitting={registrar.isPending}
      submitDisabled={incompleto}
    >
      {registrar.isError && <Alert tone="error">{errorMessage(registrar.error)}</Alert>}
      {catalogo.faltas.length === 0 && (
        <Alert tone="warning">Aún no hay faltas del manual. Pídele al coordinador de convivencia que las cargue en el catálogo.</Alert>
      )}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Select label="Falta del manual" value={faltaId} onChange={(e) => setFaltaId(e.target.value)} required>
          <option value="">Elige una falta</option>
          {TIPOS_SITUACION.map((g) => {
            const delGrado = catalogo.faltas.filter((f) => f.gravedad === g);
            if (delGrado.length === 0) return null;
            return (
              <optgroup key={g} label={NOMBRES_GRAVEDAD[g]}>
                {delGrado.map((f) => (
                  <option key={f._id} value={f._id}>
                    {f.codigo} · {f.descripcion.length > 70 ? `${f.descripcion.slice(0, 70)}…` : f.descripcion}
                  </option>
                ))}
              </optgroup>
            );
          })}
        </Select>
        <Input label="Fecha del hecho" type="date" max={hoyLocal()} value={fecha} onChange={(e) => setFecha(e.target.value)} required />
      </div>

      {falta && (
        <div className="space-y-2 rounded-xl bg-soft p-3 text-sm text-body">
          <p className="flex items-center gap-2">
            <TipoSituacionBadge value={falta.gravedad} /> <span className="font-semibold text-ink">{falta.codigo}</span>
          </p>
          <p>{falta.descripcion}</p>
          {grave ? (
            <p className="text-xs text-muted">Esta falta es grave: no se cierra aquí. Se enviará a convivencia, que abre el caso y continúa el proceso.</p>
          ) : (
            <p className="text-xs text-muted">Esta falta es leve: queda en el Observador del estudiante como antecedente pedagógico.</p>
          )}
        </div>
      )}

      <Textarea label="Hechos" rows={4} maxLength={MAX_TEXTO} value={hechos} onChange={(e) => setHechos(e.target.value)} required hint="Relata lo ocurrido de forma objetiva, sin juicios. No incluyas diagnósticos ni datos de salud." />

      {falta && !grave && (
        <>
          <Textarea label="Versión del estudiante (opcional)" rows={3} maxLength={MAX_TEXTO} value={version} onChange={(e) => setVersion(e.target.value)} />
          <Textarea label="Acuerdo o compromiso formativo (opcional)" rows={2} maxLength={500} value={compromiso} onChange={(e) => setCompromiso(e.target.value)} />
          <label className="flex items-start gap-2 text-sm text-body">
            <input type="checkbox" className="mt-0.5 h-4 w-4 rounded border-border text-primary focus:ring-primary" checked={remitir} onChange={(e) => setRemitir(e.target.checked)} />
            <span>
              Remitir al comité de convivencia
              <span className="block text-xs text-muted">Solo si consideras que debe atenderla coordinación de convivencia.</span>
            </span>
          </label>
        </>
      )}

      {falta && grave && (
        <>
          <fieldset className="space-y-2">
            <legend className="mb-1 text-label text-body">Involucrados y su rol en el hecho</legend>
            {estudiantes.map((s) => (
              <div key={s.student_id} className="flex items-center gap-3">
                <span className="flex-1 text-sm text-body">
                  {s.apellido} {s.nombre} · {s.grupo}
                </span>
                <Select label={`Rol de ${s.nombre} ${s.apellido}`} hideLabel value={rolDe(s.student_id)} onChange={(e) => setRoles((previa) => ({ ...previa, [s.student_id]: e.target.value as RolInvolucrado }))}>
                  {ROLES_INVOLUCRADO.map((r) => (
                    <option key={r} value={r}>
                      {NOMBRES_ROL_INVOLUCRADO[r]}
                    </option>
                  ))}
                </Select>
              </div>
            ))}
            {!hayPresunto && <p className="text-xs text-danger">Indica al menos un presunto responsable.</p>}
            <p className="text-xs text-muted">
              Solo puedes nombrar a estudiantes de tus grupos. Si hay otros involucrados, descríbelos en los hechos: convivencia los agrega al abrir el caso.
            </p>
          </fieldset>
          <Textarea label="Acciones inmediatas de contención" rows={3} maxLength={1000} value={contencion} onChange={(e) => setContencion(e.target.value)} required hint="Qué hiciste de inmediato para proteger a las personas (separar a los estudiantes, llevar a enfermería, avisar a un directivo…)." />
        </>
      )}
    </Drawer>
  );
}
