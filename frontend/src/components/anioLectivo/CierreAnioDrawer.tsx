import { type FormEvent, useState } from 'react';
import { useCerrarAnio, useVerificacionCierre } from '../../hooks/useAniosLectivos';
import type { AcademicYear } from '../../types/domain';
import { Alert, errorMessage } from '../ui/Alert';
import { Input } from '../ui/Field';
import { CheckCircleIcon, XCircleIcon } from '../ui/icons';
import { Spinner } from '../ui/Spinner';
import { Stepper } from '../ui/Stepper';
import { Drawer } from '../ui/Drawer';

interface CierreAnioDrawerProps {
  open: boolean;
  anio: AcademicYear;
  onClose: () => void;
}

/** Cierre de vigencia en dos pasos (CU-REC-05): 1) verificación de condiciones, 2) confirmación con año y contraseña. */
export function CierreAnioDrawer(props: CierreAnioDrawerProps) {
  if (!props.open) return null;
  return <PasosCierre {...props} />;
}

function PasosCierre({ anio, onClose }: CierreAnioDrawerProps) {
  const [paso, setPaso] = useState<1 | 2>(1);
  const [yearConfirmado, setYearConfirmado] = useState('');
  const [password, setPassword] = useState('');

  const verificacion = useVerificacionCierre(anio._id, true);
  const cerrar = useCerrarAnio();

  const puedeCerrar = verificacion.data?.puede_cerrar === true;

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (paso === 1) {
      setPaso(2);
      return;
    }
    cerrar.reset();
    await cerrar.mutateAsync({ id: anio._id, confirm_password: password, confirmar_year: Number(yearConfirmado) });
    onClose();
  }

  return (
    <Drawer
      open
      title="Cerrar año lectivo"
      subtitle={anio.nombre}
      onClose={onClose}
      onSubmit={handleSubmit}
      submitLabel={paso === 1 ? 'Continuar' : 'Cerrar año lectivo'}
      submitVariant={paso === 1 ? 'primary' : 'soft-danger'}
      submitDisabled={paso === 1 ? !puedeCerrar : Number(yearConfirmado) !== anio.year || !password}
      isSubmitting={cerrar.isPending}
    >
      <Stepper steps={['Verificación', 'Confirmación']} current={paso} />

      {paso === 1 && (
        <>
          <p className="text-sm text-body">
            Antes de congelar el año se verifica que todo haya concluido. Los periodos cerrados y las planillas no se
            podrán volver a tocar.
          </p>
          {verificacion.isLoading && <Spinner label="Verificando..." />}
          {verificacion.isError && <Alert tone="error">{errorMessage(verificacion.error)}</Alert>}
          {verificacion.data && (
            <ul className="space-y-2">
              {verificacion.data.verificaciones.map((v) => (
                <li key={v.clave} className="flex items-start gap-2 text-sm">
                  {v.cumple ? (
                    <CheckCircleIcon className="mt-0.5 h-4 w-4 shrink-0 text-success" />
                  ) : (
                    <XCircleIcon className="mt-0.5 h-4 w-4 shrink-0 text-danger" />
                  )}
                  <div>
                    <p className="font-medium text-ink">{v.descripcion}</p>
                    {v.detalle && <p className="text-muted">{v.detalle}</p>}
                  </div>
                </li>
              ))}
            </ul>
          )}
          {verificacion.data && !puedeCerrar && (
            <Alert tone="warning">Resuelve los puntos pendientes para poder continuar.</Alert>
          )}
        </>
      )}

      {paso === 2 && (
        <>
          {cerrar.isError && <Alert tone="error">{errorMessage(cerrar.error)}</Alert>}
          <Alert tone="warning">
            Esta acción es irreversible: el año {anio.year} pasa a histórico de solo lectura, se revocan las prórrogas
            pendientes y se habilita activar el siguiente año.
          </Alert>
          <Input
            label={`Escribe ${anio.year} para confirmar`}
            inputMode="numeric"
            required
            value={yearConfirmado}
            onChange={(e) => setYearConfirmado(e.target.value)}
          />
          <Input
            label="Tu contraseña de administrador"
            type="password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
          <button type="button" onClick={() => setPaso(1)} className="text-sm font-semibold text-primary hover:underline">
            ← Volver a la verificación
          </button>
        </>
      )}
    </Drawer>
  );
}
