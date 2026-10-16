import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Alert, errorMessage } from '../components/ui/Alert';
import { Card } from '../components/ui/Card';
import { Select } from '../components/ui/Field';
import { PageHeader } from '../components/ui/PageHeader';
import { Spinner } from '../components/ui/Spinner';
import { TarjetaNotasAsignatura } from '../components/notas/TarjetaNotasAsignatura';
import { useMisNotas } from '../hooks/useNotas';
import { useAnioDeTrabajo } from '../hooks/useAniosLectivos';

/**
 * Las notas del estudiante por asignatura y periodo: cada bloque del molde del colegio con las actividades y notas que lo forman.
 * Mientras el periodo está abierto son provisionales; la nota final es la que el docente cierra y la que lleva el boletín.
 */
export function MisNotasPage() {
  const { anio } = useAnioDeTrabajo();
  const [periodoElegido, setPeriodoElegido] = useState<number | null>(null);
  const periodoAbierto = anio?.periodos.find((p) => p.estado === 'ABIERTO' || p.estado === 'EN_DIGITACION')?.numero ?? 1;
  const periodo = periodoElegido ?? periodoAbierto;
  const { data, isLoading, isError, error } = useMisNotas(anio ? periodo : undefined, anio?._id);

  return (
    <div className="space-y-4">
      <PageHeader
        title="Mis notas"
        subtitle="Tus calificaciones por asignatura: de qué bloque viene cada nota y cuánto pesa. Para entregar tareas ve a «Mis actividades»."
        action={
          <Link to="/report-card" className="text-sm font-semibold text-primary hover:underline">
            Ver mi boletín
          </Link>
        }
      />

      {anio && (
        <Card>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <Select label="Periodo" value={periodo} onChange={(e) => setPeriodoElegido(Number(e.target.value))}>
              {anio.periodos.map((p) => (
                <option key={p.numero} value={p.numero}>
                  {p.nombre}
                </option>
              ))}
            </Select>
          </div>
        </Card>
      )}

      {isError && <Alert tone="error">{errorMessage(error)}</Alert>}
      {isLoading && (
        <div className="flex justify-center p-12">
          <Spinner />
        </div>
      )}
      {data && data.asignaturas.length === 0 && <Alert tone="info">No tienes asignaturas con matrícula activa en este año lectivo.</Alert>}
      {data && data.asignaturas.length > 0 && (
        <div className="grid items-start gap-4 lg:grid-cols-2">
          {data.asignaturas.map((a) => (
            <TarjetaNotasAsignatura key={a.teacher_assignment_id} asignatura={a} aprobatoria={data.nota_aprobatoria} />
          ))}
        </div>
      )}
    </div>
  );
}
