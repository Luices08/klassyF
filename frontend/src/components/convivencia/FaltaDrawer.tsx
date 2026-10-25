import { type FormEvent, useMemo, useState } from 'react';
import { Alert, errorMessage } from '../ui/Alert';
import { TipoSituacionBadge } from '../ui/Badge';
import { Drawer } from '../ui/Drawer';
import { Input, Textarea } from '../ui/Field';
import { SelectBuscable } from '../ui/SelectBuscable';
import { Switch } from '../ui/Switch';
import { SelectorEstudiantesRegistro } from './SelectorEstudiantesRegistro';
import {
  type CatalogoConvivencia,
  type EstudianteObservable,
  TIPOS_SITUACION,
  type TipoSituacion,
  useRegistrarFalta,
  useReportarSituacionGrave,
} from '../../hooks/useObservaciones';

const MAX_TEXTO = 2000;
const hoyLocal = () => new Date().toLocaleDateString('en-CA');

const DETALLE_TIPO: Record<TipoSituacion, string> = {
  I: 'Leve: se resuelve con mediación en el aula',
  II: 'Grave: agresión, acoso o daño a otra persona',
  III: 'Muy grave: posible delito',
};

interface Props {
  open: boolean;
  onClose: () => void;
  catalogo: CatalogoConvivencia;
  /** Los que ya se marcaron en la tabla (opcional): en el propio formulario se pueden cambiar. */
  estudiantes: EstudianteObservable[];
  /** `grave`: se envió a coordinación de convivencia sin pasar por el Observador; `escalada`: una falta leve que el docente escaló. */
  onRegistrada?: (resultado: { grave: boolean; escalada: boolean }) => void;
}

/**
 * Registrar una falta del manual de convivencia. El docente elige el tipo y la falta (los dos selectores se buscan escribiendo):
 * - **Tipo I (leve)**: queda en el Observador como antecedente pedagógico, con la versión del estudiante y el acuerdo formativo; si no se resolvió en el aula, se escala.
 * - **Tipo II**: el docente decide si la envía a coordinación. Si la resolvió él mismo (o no fue tan grave), queda en el Observador como una Tipo I.
 * - **Tipo II enviada o Tipo III**: se envía de inmediato a coordinación de convivencia (alerta crítica) con la falta que el docente identificó y la contención que aplicó.
 *   No queda en el Observador del estudiante: eso evita marcar a quien luego resulte ajeno al hecho. Coordinación abre el caso, confirma el tipo y asigna los roles.
 * A quién se registra se elige aquí mismo (grupo y estudiantes de toda la sede): quien ve algo lo registra, aunque no dicte clase en ese grupo.
 */
export function FaltaDrawer(props: Props) {
  if (!props.open) return null;
  return <Formulario {...props} />;
}

function Formulario({ onClose, catalogo, estudiantes, onRegistrada }: Props) {
  const registrar = useRegistrarFalta();
  const reportar = useReportarSituacionGrave();
  const [tipo, setTipo] = useState<TipoSituacion | ''>('');
  const [faltaId, setFaltaId] = useState('');
  const [fecha, setFecha] = useState(hoyLocal());
  const [hechos, setHechos] = useState('');
  const [version, setVersion] = useState('');
  const [compromiso, setCompromiso] = useState('');
  const [contencion, setContencion] = useState('');
  const [escalar, setEscalar] = useState(false);
  // Una Tipo II se envía por defecto: el docente la deja en el Observador solo si la resolvió él mismo.
  const [enviar, setEnviar] = useState(true);
  const [todos, setTodos] = useState(estudiantes);

  const grave = tipo === 'III' || (tipo === 'II' && enviar);
  const delTipo = useMemo(() => catalogo.faltas.filter((f) => f.gravedad === tipo), [catalogo.faltas, tipo]);
  const falta = delTipo.find((f) => f._id === faltaId);
  const mutacion = grave ? reportar : registrar;
  const incompleto = !falta || !hechos.trim() || todos.length === 0 || (grave && contencion.trim().length < 5);

  const guardar = async (e: FormEvent) => {
    e.preventDefault();
    if (!falta) return;
    const estudiantes_ids = todos.map((s) => s.student_id);
    if (grave) {
      await reportar.mutateAsync({ falta_id: falta._id, fecha_hecho: fecha, hechos, acciones_contencion: contencion, estudiantes_ids });
      onRegistrada?.({ grave: true, escalada: true });
    } else {
      const resultado = await registrar.mutateAsync({
        falta_id: falta._id,
        fecha_hecho: fecha,
        hechos,
        estudiantes_ids,
        version_estudiante: version || undefined,
        compromiso: compromiso || undefined,
        escalar_a_coordinacion: tipo === 'I' && escalar,
      });
      onRegistrada?.({ grave: false, escalada: resultado.escalada });
    }
    onClose();
  };

  return (
    <Drawer
      open
      size="lg"
      title="Registrar falta"
      subtitle={todos.length === 0 ? undefined : todos.length === 1 ? `${todos[0]?.nombre} ${todos[0]?.apellido} · ${todos[0]?.grupo}` : `${todos.length} estudiantes · ${[...new Set(todos.map((s) => s.grupo))].join(', ')}`}
      onClose={onClose}
      onSubmit={guardar}
      submitLabel={grave ? 'Enviar a coordinación de convivencia' : tipo === 'I' && escalar ? 'Registrar y escalar a coordinación' : 'Registrar'}
      submitVariant={grave ? 'soft-danger' : 'primary'}
      isSubmitting={mutacion.isPending}
      submitDisabled={incompleto}
    >
      {mutacion.isError && <Alert tone="error">{errorMessage(mutacion.error)}</Alert>}
      {catalogo.faltas.length === 0 && <Alert tone="warning">Aún no hay faltas del manual. Pídele al coordinador de convivencia que las cargue en el catálogo.</Alert>}

      <SelectorEstudiantesRegistro seleccion={todos} onChange={setTodos} />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <SelectBuscable
          label="Tipo de falta"
          required
          value={tipo}
          onChange={(valor) => {
            setTipo(valor as TipoSituacion | '');
            setFaltaId('');
            setEnviar(true);
          }}
          placeholder="Elige el tipo"
          opciones={TIPOS_SITUACION.map((t) => ({ value: t, label: `Tipo ${t}`, detalle: DETALLE_TIPO[t] }))}
        />
        <Input label="Fecha del hecho" type="date" max={hoyLocal()} value={fecha} onChange={(e) => setFecha(e.target.value)} required />
      </div>

      <SelectBuscable
        label="Falta del manual"
        required
        value={faltaId}
        onChange={setFaltaId}
        disabled={!tipo}
        placeholder={tipo ? 'Busca por código o descripción…' : 'Elige primero el tipo'}
        opciones={delTipo.map((f) => ({ value: f._id, label: `${f.codigo} · ${f.descripcion}` }))}
        hint={tipo && delTipo.length === 0 ? `No hay faltas Tipo ${tipo} en el manual.` : undefined}
      />

      {falta && (
        <div className="space-y-2 rounded-xl bg-soft p-3 text-sm text-body">
          <p className="flex items-center gap-2">
            <TipoSituacionBadge value={falta.gravedad} /> <span className="font-semibold text-ink">{falta.codigo}</span>
          </p>
          <p>{falta.descripcion}</p>
          <p className="text-xs text-muted">
            {grave
              ? 'Se envía de inmediato a coordinación de convivencia, que abre el caso y asigna el papel de cada estudiante. No queda anotada en el Observador del estudiante mientras no haya una decisión.'
              : 'Queda en el Observador del estudiante como antecedente pedagógico.'}
          </p>
        </div>
      )}

      {tipo === 'II' && (
        <Switch
          checked={enviar}
          onChange={setEnviar}
          label="Enviar a coordinación de convivencia"
          description="Apágalo si la situación no fue tan grave o ya la resolviste tú: queda en el Observador del estudiante, sin abrir un caso."
        />
      )}

      <Textarea
        label={grave ? 'Qué pasó' : 'Hechos'}
        rows={4}
        maxLength={MAX_TEXTO}
        value={hechos}
        onChange={(e) => setHechos(e.target.value)}
        required
        hint="Relata lo ocurrido de forma objetiva, sin juicios. No incluyas diagnósticos ni datos de salud. Si hay otros estudiantes involucrados que no seleccionaste, descríbelos aquí: coordinación los agrega al caso."
      />

      {grave ? (
        <Textarea
          label="Medida de contención inmediata"
          rows={3}
          maxLength={1000}
          value={contencion}
          onChange={(e) => setContencion(e.target.value)}
          required
          hint="Qué hiciste de inmediato para proteger a las personas (separar a los estudiantes, llevar a enfermería, avisar a un directivo…)."
        />
      ) : (
        <>
          <Textarea label="Versión del estudiante (opcional)" rows={3} maxLength={MAX_TEXTO} value={version} onChange={(e) => setVersion(e.target.value)} />
          <Textarea label="Acuerdo o compromiso formativo (opcional)" rows={2} maxLength={500} value={compromiso} onChange={(e) => setCompromiso(e.target.value)} />
          {/* En una Tipo II el envío ya lo decide el interruptor de arriba: aquí solo se escala una Tipo I. */}
          {tipo === 'I' && (
            <label className="flex items-start gap-2 text-sm text-body">
              <input type="checkbox" className="mt-0.5 h-4 w-4 rounded border-border text-primary focus:ring-primary" checked={escalar} onChange={(e) => setEscalar(e.target.checked)} />
              <span>
                Escalar a coordinación de convivencia
                <span className="block text-xs text-muted">Solo si es reincidente o no se resolvió con la mediación en el aula.</span>
              </span>
            </label>
          )}
        </>
      )}
    </Drawer>
  );
}
