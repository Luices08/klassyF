import { type FormEvent, useState } from 'react';
import { Alert, errorMessage } from '../ui/Alert';
import { TipoSituacionBadge } from '../ui/Badge';
import { Drawer } from '../ui/Drawer';
import { Input, Select, Textarea } from '../ui/Field';
import { type CatalogoConvivencia, type EstudianteObservable, type ResultadoFalta, useRegistrarFalta } from '../../hooks/useObservaciones';

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
 * Registrar una falta leve (Tipo I) del manual de convivencia: queda en el Observador como antecedente pedagógico, con la versión del
 * estudiante y el acuerdo formativo. Lo grave (Tipo II o III) no se registra aquí: el docente no lo tipifica, usa el «Reporte urgente».
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
  const [escalar, setEscalar] = useState(false);

  const leves = catalogo.faltas.filter((f) => f.gravedad === 'I');
  const falta = leves.find((f) => f._id === faltaId);
  const incompleto = !falta || !hechos.trim() || estudiantes.length === 0;

  const guardar = async (e: FormEvent) => {
    e.preventDefault();
    if (!falta) return;
    const resultado = await registrar.mutateAsync({
      falta_id: falta._id,
      fecha_hecho: fecha,
      hechos,
      estudiantes_ids: estudiantes.map((s) => s.student_id),
      version_estudiante: version || undefined,
      compromiso: compromiso || undefined,
      escalar_a_coordinacion: escalar,
    });
    onRegistrada?.(resultado);
    onClose();
  };

  return (
    <Drawer
      open
      size="lg"
      title="Registrar falta leve"
      subtitle={estudiantes.length === 1 ? `${estudiantes[0]?.nombre} ${estudiantes[0]?.apellido} · ${estudiantes[0]?.grupo}` : `${estudiantes.length} estudiantes`}
      onClose={onClose}
      onSubmit={guardar}
      submitLabel={escalar ? 'Registrar y escalar a coordinación' : 'Registrar'}
      isSubmitting={registrar.isPending}
      submitDisabled={incompleto}
    >
      {registrar.isError && <Alert tone="error">{errorMessage(registrar.error)}</Alert>}
      <Alert tone="info">Si la situación es grave (agresión, daño al cuerpo o a la salud, posible delito), no la registres aquí: usa «Reporte urgente» y coordinación abre el caso.</Alert>
      {leves.length === 0 && <Alert tone="warning">Aún no hay faltas leves del manual. Pídele al coordinador de convivencia que las cargue en el catálogo.</Alert>}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Select label="Falta del manual" value={faltaId} onChange={(e) => setFaltaId(e.target.value)} required>
          <option value="">Elige una falta</option>
          {leves.map((f) => (
            <option key={f._id} value={f._id}>
              {f.codigo} · {f.descripcion.length > 70 ? `${f.descripcion.slice(0, 70)}…` : f.descripcion}
            </option>
          ))}
        </Select>
        <Input label="Fecha del hecho" type="date" max={hoyLocal()} value={fecha} onChange={(e) => setFecha(e.target.value)} required />
      </div>

      {falta && (
        <div className="space-y-2 rounded-xl bg-soft p-3 text-sm text-body">
          <p className="flex items-center gap-2">
            <TipoSituacionBadge value={falta.gravedad} /> <span className="font-semibold text-ink">{falta.codigo}</span>
          </p>
          <p>{falta.descripcion}</p>
          <p className="text-xs text-muted">Queda en el Observador del estudiante como antecedente pedagógico.</p>
        </div>
      )}

      <Textarea label="Hechos" rows={4} maxLength={MAX_TEXTO} value={hechos} onChange={(e) => setHechos(e.target.value)} required hint="Relata lo ocurrido de forma objetiva, sin juicios. No incluyas diagnósticos ni datos de salud." />
      <Textarea label="Versión del estudiante (opcional)" rows={3} maxLength={MAX_TEXTO} value={version} onChange={(e) => setVersion(e.target.value)} />
      <Textarea label="Acuerdo o compromiso formativo (opcional)" rows={2} maxLength={500} value={compromiso} onChange={(e) => setCompromiso(e.target.value)} />
      <label className="flex items-start gap-2 text-sm text-body">
        <input type="checkbox" className="mt-0.5 h-4 w-4 rounded border-border text-primary focus:ring-primary" checked={escalar} onChange={(e) => setEscalar(e.target.checked)} />
        <span>
          Escalar a coordinación de convivencia
          <span className="block text-xs text-muted">Solo si es reincidente o no se resolvió con la mediación en el aula.</span>
        </span>
      </label>
    </Drawer>
  );
}
