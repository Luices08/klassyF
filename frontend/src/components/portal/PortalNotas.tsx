import { useState } from 'react';
import { useAnioDeTrabajo } from '../../hooks/useAniosLectivos';
import { useNotasDelAnioDelHijo, useNotasDelHijo } from '../../hooks/usePortal';
import { ResumenAnualNotas } from '../notas/ResumenAnualNotas';
import { TarjetaNotasAsignatura } from '../notas/TarjetaNotasAsignatura';
import { Alert, errorMessage } from '../ui/Alert';
import { Card } from '../ui/Card';
import { Select } from '../ui/Field';
import { Spinner } from '../ui/Spinner';

/** Las notas del estudiante elegido por asignatura y periodo (provisionales mientras el periodo está abierto) o el resumen del año, con sus recuperaciones. */
export function PortalNotas({ studentId }: { studentId: string }) {
  const { anio } = useAnioDeTrabajo();
  const [periodoElegido, setPeriodoElegido] = useState<number | null>(null);
  const periodoAbierto = anio?.periodos.find((p) => p.estado === 'ABIERTO' || p.estado === 'EN_DIGITACION')?.numero ?? 1;
  const periodo = periodoElegido ?? periodoAbierto;
  const resumenDelAnio = periodo === 0;
  const { data, isLoading, isError, error } = useNotasDelHijo(studentId, anio ? periodo : undefined, anio?._id);
  const anual = useNotasDelAnioDelHijo(studentId, anio?._id, resumenDelAnio);

  return (
    <div className="space-y-4">
      {anio && (
        <Card>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <Select label="Periodo" value={periodo} onChange={(e) => setPeriodoElegido(Number(e.target.value))}>
              {anio.periodos.map((p) => (
                <option key={p.numero} value={p.numero}>
                  {p.nombre}
                </option>
              ))}
              <option value={0}>Resumen del año</option>
            </Select>
          </div>
        </Card>
      )}
      {resumenDelAnio && anual.isError && <Alert tone="error">{errorMessage(anual.error)}</Alert>}
      {resumenDelAnio && anual.isLoading && (
        <div className="flex justify-center p-12">
          <Spinner />
        </div>
      )}
      {resumenDelAnio && anual.data && <ResumenAnualNotas datos={anual.data} paraFamilia />}
      {isError && <Alert tone="error">{errorMessage(error)}</Alert>}
      {isLoading && (
        <div className="flex justify-center p-12">
          <Spinner />
        </div>
      )}
      {data && data.asignaturas.length === 0 && <Alert tone="info">El estudiante no tiene asignaturas con matrícula activa en este año lectivo.</Alert>}
      {data?.asignaturas.map((a) => (
        <TarjetaNotasAsignatura key={a.teacher_assignment_id} asignatura={a} aprobatoria={data.nota_aprobatoria} paraFamilia />
      ))}
    </div>
  );
}
