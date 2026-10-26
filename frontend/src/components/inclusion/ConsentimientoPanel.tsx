import { type FormEvent, useState } from 'react';
import { Alert, errorMessage } from '../ui/Alert';
import { Button } from '../ui/Button';
import { Input, Select, Textarea } from '../ui/Field';
import { type Expediente, useRegistrarConsentimiento, useRevocarConsentimiento } from '../../hooks/useInclusion';
import { formatoFechaLocal } from '../../lib/fechas';

const ESTUDIANTE = 'ESTUDIANTE';
const OTRA_PERSONA = 'OTRA_PERSONA';

/**
 * Autorización del responsable legal para tratar los datos sensibles de salud de un menor (Ley 1581 de 2012, Ley 1098 de 2006).
 * Es propia de este módulo y distinta de la autorización de salud de la matrícula. Sin ella no se guarda nada clínico ni se
 * emite ningún documento. Quien autoriza se elige entre los acudientes vinculados al estudiante (M03): el principal viene
 * preseleccionado y su nombre y parentesco no se vuelven a digitar. El sistema no contacta al acudiente: solo registra lo que orientación obtuvo.
 */
export function ConsentimientoPanel({ exp }: { exp: Expediente }) {
  const registrar = useRegistrarConsentimiento(exp._id);
  const revocar = useRevocarConsentimiento(exp._id);
  const acudientes = exp.acudientes ?? [];
  const mayorDeEdad = Boolean(exp.estudiante_mayor_de_edad);
  const [quien, setQuien] = useState(acudientes.find((a) => a.es_principal)?._id ?? acudientes[0]?._id ?? (mayorDeEdad ? ESTUDIANTE : OTRA_PERSONA));
  const [nombre, setNombre] = useState('');
  const [parentesco, setParentesco] = useState('');
  const [motivo, setMotivo] = useState('');
  const [revocando, setRevocando] = useState(false);
  const consentimiento = exp.consentimiento;
  const editable = exp.permisos.gestiona && exp.editable;
  const aMano = quien === OTRA_PERSONA;

  const enviar = async (e: FormEvent) => {
    e.preventDefault();
    if (quien === ESTUDIANTE) await registrar.mutateAsync({ otorgado_por_estudiante: true });
    else if (aMano) await registrar.mutateAsync({ otorgado_por_nombre: nombre, parentesco });
    else await registrar.mutateAsync({ acudiente_id: quien });
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
          {acudientes.length === 0 && !mayorDeEdad && (
            <Alert tone="info">El estudiante no tiene acudientes vinculados en su ficha. Vincúlalos en la ficha del estudiante o escribe los datos del responsable legal.</Alert>
          )}
          <Select label="Quién autoriza" value={quien} onChange={(e) => setQuien(e.target.value)}>
            {acudientes.map((a) => (
              <option key={a._id} value={a._id}>
                {a.nombre} — {a.parentesco}
                {a.es_principal ? ' (principal)' : ''}
              </option>
            ))}
            {mayorDeEdad && <option value={ESTUDIANTE}>El propio estudiante (mayor de edad)</option>}
            <option value={OTRA_PERSONA}>Otra persona (no vinculada en la ficha)</option>
          </Select>
          {aMano && (
            <div className="grid gap-3 sm:grid-cols-2">
              <Input label="Nombre de quien autoriza" value={nombre} onChange={(e) => setNombre(e.target.value)} />
              <Input label="Parentesco" value={parentesco} onChange={(e) => setParentesco(e.target.value)} />
            </div>
          )}
          <Button type="submit" isLoading={registrar.isPending} disabled={aMano && (nombre.trim().length < 3 || parentesco.trim().length < 2)}>
            Registrar autorización
          </Button>
        </>
      )}
    </form>
  );
}
