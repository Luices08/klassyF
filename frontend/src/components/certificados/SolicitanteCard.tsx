import { Alert } from '../ui/Alert';
import { Card, CardHeader } from '../ui/Card';
import { Input, Select } from '../ui/Field';
import { Switch } from '../ui/Switch';
import { ETIQUETA_SOLICITANTE, type FichaEstudiante, type SolicitanteEntrada, type TipoSolicitante } from '../../hooks/useCertificados';
import { solicitanteInicial } from '../../lib/solicitanteCertificado';

/**
 * ¿Quién pide el documento? Queda registrado con el documento (no se imprime): un certificado trae datos personales de un menor y saber a quién
 * se entregó es parte de su trazabilidad. Quien llega no siendo acudiente se registra como tercero con la autorización escrita del acudiente.
 */
export function SolicitanteCard({ ficha, valor, onChange }: { ficha: FichaEstudiante; valor: SolicitanteEntrada; onChange: (s: SolicitanteEntrada) => void }) {
  const tipos: TipoSolicitante[] = [...(ficha.acudientes.length > 0 ? (['ACUDIENTE'] as const) : []), ...(ficha.estudiante.mayor_de_edad ? (['ESTUDIANTE'] as const) : []), 'TERCERO', 'AUTORIDAD'];
  const campo = (cambio: Partial<SolicitanteEntrada>) => onChange({ ...valor, ...cambio });

  return (
    <Card className="space-y-4">
      <CardHeader title="¿Quién solicita el documento?" subtitle="Verifica su documento de identidad. Queda registrado con el documento; no se imprime en él." />
      <Select
        label="Solicitante"
        value={valor.tipo}
        onChange={(e) => {
          const tipo = e.target.value as TipoSolicitante;
          onChange(tipo === 'ACUDIENTE' ? solicitanteInicial(ficha) : { tipo });
        }}
      >
        {tipos.map((t) => (
          <option key={t} value={t}>
            {ETIQUETA_SOLICITANTE[t]}
          </option>
        ))}
      </Select>

      {valor.tipo === 'ACUDIENTE' && (
        <Select label="Acudiente" value={valor.guardian_id ?? ''} onChange={(e) => campo({ guardian_id: e.target.value })}>
          {ficha.acudientes.map((a) => (
            <option key={a.guardian_id} value={a.guardian_id}>
              {a.nombre} · {a.parentesco.toLowerCase().replace(/_/g, ' ')} · {a.tipo_documento} {a.numero_documento}
              {a.es_principal ? ' (responsable principal)' : ''}
            </option>
          ))}
        </Select>
      )}

      {valor.tipo === 'ESTUDIANTE' && <p className="text-sm text-body">El estudiante es mayor de edad: puede solicitar sus propios documentos.</p>}

      {valor.tipo === 'TERCERO' && (
        <div className="space-y-3">
          <Alert tone="warning">
            Entrega el documento solo si trae la autorización escrita del acudiente y su documento de identidad. Un certificado incluye datos personales de un menor de edad.
          </Alert>
          <div className="grid gap-3 sm:grid-cols-2">
            <Input label="Nombre completo" value={valor.nombre ?? ''} maxLength={120} onChange={(e) => campo({ nombre: e.target.value })} />
            <Input label="Documento de identidad" value={valor.numero_documento ?? ''} maxLength={30} onChange={(e) => campo({ numero_documento: e.target.value })} />
            <Input label="Relación con el estudiante" value={valor.detalle ?? ''} maxLength={120} placeholder="Ej. tía, transportador autorizado" onChange={(e) => campo({ detalle: e.target.value })} />
          </div>
          <Switch
            label="Presentó la autorización escrita del acudiente y su documento"
            checked={valor.presento_autorizacion === true}
            onChange={(v) => campo({ presento_autorizacion: v })}
          />
        </div>
      )}

      {valor.tipo === 'AUTORIDAD' && (
        <div className="grid gap-3 sm:grid-cols-2">
          <Input label="Entidad o autoridad" value={valor.nombre ?? ''} maxLength={120} placeholder="Ej. Juzgado 4 de Familia" onChange={(e) => campo({ nombre: e.target.value })} />
          <Input label="Número de oficio" value={valor.detalle ?? ''} maxLength={120} onChange={(e) => campo({ detalle: e.target.value })} />
        </div>
      )}
    </Card>
  );
}
