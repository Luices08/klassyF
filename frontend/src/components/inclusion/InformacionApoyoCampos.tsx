import { Input, Textarea } from '../ui/Field';
import type { ApoyoDeclarado } from '../../lib/apoyoDeclarado';

/**
 * «Información de apoyo / enfoque diferencial» (M16 al matricular o preinscribir): quien registra solo transcribe lo que la
 * familia dice. No determina si hay una condición ni qué proceso sigue: eso lo valora orientación, que recibe la solicitud.
 */
export function InformacionApoyoCampos({ valor, onChange }: { valor: ApoyoDeclarado; onChange: (v: ApoyoDeclarado) => void }) {
  return (
    <fieldset className="space-y-3 rounded-lg border border-border p-3">
      <legend className="px-1 text-sm font-semibold text-ink">Información de apoyo / enfoque diferencial</legend>
      <label className="flex items-center gap-2 text-sm text-body">
        <input type="checkbox" checked={valor.declara} onChange={(e) => onChange({ ...valor, declara: e.target.checked })} className="h-4 w-4 rounded border-border text-primary focus:ring-primary" />
        El estudiante cuenta con algún diagnóstico médico, discapacidad o apoyo previo
      </label>
      {valor.declara && (
        <>
          <Input label="Lo que declara la familia" value={valor.motivo_declarado} onChange={(e) => onChange({ ...valor, motivo_declarado: e.target.value })} maxLength={500} hint="En sus palabras (ej.: «usa gafas de aumento», «es hiperactivo y se distrae»). No se valora aquí." />
          <label className="flex items-center gap-2 text-sm text-body">
            <input type="checkbox" checked={valor.aporta_soporte} onChange={(e) => onChange({ ...valor, aporta_soporte: e.target.checked })} className="h-4 w-4 rounded border-border text-primary focus:ring-primary" />
            La familia aporta un soporte médico (entréguelo a orientación)
          </label>
          <Textarea label="Observación (opcional)" rows={2} value={valor.observacion} onChange={(e) => onChange({ ...valor, observacion: e.target.value })} maxLength={2000} />
        </>
      )}
    </fieldset>
  );
}
