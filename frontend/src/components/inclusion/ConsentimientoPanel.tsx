import { type FormEvent, useState } from 'react';
import { Alert, errorMessage } from '../ui/Alert';
import { Button } from '../ui/Button';
import { Input, Textarea } from '../ui/Field';
import { type Expediente, useRegistrarConsentimiento, useRevocarConsentimiento } from '../../hooks/useInclusion';
import {} from './campos';
import { formatoFechaLocal } from '../../lib/fechas';

/**
 * Autorización del responsable legal para tratar los datos sensibles de salud de un menor (Ley 1581 de 2012, Ley 1098 de 2006).
 * Es propia de este módulo y distinta de la autorización de salud de la matrícula. Sin ella no se guarda nada clínico ni se
 * emite ningún documento.
 */
export function ConsentimientoPanel({ exp }: { exp: Expediente }) {
  const registrar = useRegistrarConsentimiento(exp._id);
  const revocar = useRevocarConsentimiento(exp._id);
  const [nombre, setNombre] = useState('');
  const [parentesco, setParentesco] = useState('');
  const [motivo, setMotivo] = useState('');
  const [revocando, setRevocando] = useState(false);
  const consentimiento = exp.consentimiento;
  const editable = exp.permisos.gestiona && exp.editable;

  const enviar = async (e: FormEvent) => {
    e.preventDefault();
    await registrar.mutateAsync({ otorgado_por_nombre: nombre, parentesco });
  };

  if (consentimiento?.otorgado) {
    return (
      <div className="space-y-3">
        <Alert tone="success">
          Autorizado por {consentimiento.otorgado_por_nombre} ({consentimiento.parentesco}) el {formatoFechaLocal(consentimiento.fecha)} · política versión {consentimiento.version_politica}.
        </Alert>
        {editable && !revocando && (
          <Button variant="soft-danger" onClick={() => setRevocando(true)}>
            Revocar autorización
          </Button>
        )}
        {revocando && (
          <form
            className="space-y-3"
            onSubmit={async (e) => {
              e.preventDefault();
              await revocar.mutateAsync(motivo);
              setRevocando(false);
              setMotivo('');
            }}
          >
            {revocar.isError && <Alert tone="error">{errorMessage(revocar.error)}</Alert>}
            <Alert tone="warning">Al revocar no se podrá registrar información clínica nueva ni emitir documentos hasta contar con una autorización vigente.</Alert>
            <Textarea label="Motivo de la revocación" value={motivo} onChange={(e) => setMotivo(e.target.value)} maxLength={500} />
            <div className="flex gap-2">
              <Button type="submit" variant="soft-danger" isLoading={revocar.isPending} disabled={motivo.trim().length < 5}>
                Confirmar revocación
              </Button>
              <Button type="button" variant="secondary" onClick={() => setRevocando(false)}>
                Cancelar
              </Button>
            </div>
          </form>
        )}
      </div>
    );
  }

  return (
    <form onSubmit={enviar} className="space-y-3">
      {consentimiento?.revocado && <Alert tone="warning">La autorización fue revocada el {formatoFechaLocal(consentimiento.revocado.fecha)}: {consentimiento.revocado.motivo}</Alert>}
      <Alert tone="warning">Antes de registrar datos de salud o emitir documentos, el responsable legal debe autorizar de forma expresa el tratamiento de los datos sensibles de su acudido.</Alert>
      {registrar.isError && <Alert tone="error">{errorMessage(registrar.error)}</Alert>}
      {editable && (
        <>
          <div className="grid gap-3 sm:grid-cols-2">
            <Input label="Nombre de quien autoriza" value={nombre} onChange={(e) => setNombre(e.target.value)} />
            <Input label="Parentesco" value={parentesco} onChange={(e) => setParentesco(e.target.value)} />
          </div>
          <Button type="submit" isLoading={registrar.isPending} disabled={nombre.trim().length < 3 || parentesco.trim().length < 2}>
            Registrar autorización
          </Button>
        </>
      )}
    </form>
  );
}
