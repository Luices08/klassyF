import { useState } from 'react';
import { ExcelAsistencia } from '../components/asistencia/ExcelAsistencia';
import { PlanillaAula } from '../components/asistencia/PlanillaAula';
import { Alert, errorMessage } from '../components/ui/Alert';
import { Card } from '../components/ui/Card';
import { Input, Select } from '../components/ui/Field';
import { PageHeader } from '../components/ui/PageHeader';
import { Spinner } from '../components/ui/Spinner';
import { usePlanilla } from '../hooks/useAsistencia';
import { useAnioDeTrabajo } from '../hooks/useAniosLectivos';
import { useMyTeacherLoad } from '../hooks/useTeacherAssignments';
import type { TeacherAssignment } from '../types/domain';

/** Hoy en Colombia (UTC-5) como YYYY-MM-DD: el día de calendario que ve el docente, no el de UTC. */
function hoyColombia(): string {
  return new Date(Date.now() - 5 * 3_600_000).toISOString().slice(0, 10);
}

function etiquetaClase(asignacion: TeacherAssignment): string {
  const grupo = typeof asignacion.group_id === 'object' && asignacion.group_id ? asignacion.group_id : null;
  const asignatura = typeof asignacion.subject_id === 'object' && asignacion.subject_id ? asignacion.subject_id : null;
  const grado = grupo && typeof grupo.grade_id === 'object' ? grupo.grade_id.nombre : '';
  return `${asignatura?.nombre ?? 'Asignatura'} · ${grado} ${grupo?.nomenclatura ?? ''}`.replace(/\s+/g, ' ').trim();
}

/** CU-DOC-04: el docente elige una de sus clases (M08) y una fecha, y toma lista de la planilla del grupo (M04). */
export function AsistenciaPage() {
  const { anio } = useAnioDeTrabajo();
  const { data: asignaciones = [], isLoading: cargandoClases } = useMyTeacherLoad(anio?._id);
  const clases = asignaciones.filter(
    (a) => a.tipo_asignacion === 'CLASE' && typeof a.group_id === 'object' && a.group_id && typeof a.subject_id === 'object' && a.subject_id
  );

  const [claseId, setClaseId] = useState('');
  const [fecha, setFecha] = useState(hoyColombia);

  const clase = clases.find((a) => a._id === claseId);
  const groupId = clase && typeof clase.group_id === 'object' && clase.group_id ? clase.group_id._id : undefined;
  const subjectId = clase && typeof clase.subject_id === 'object' && clase.subject_id ? clase.subject_id._id : undefined;

  const planilla = usePlanilla({ group_id: groupId, subject_id: subjectId, fecha });

  return (
    <div className="space-y-4">
      <PageHeader
        title="Asistencia"
        subtitle="Selecciona la clase y la fecha para registrar la asistencia del grupo."
      />

      <Card>
        <div className="grid grid-cols-1 gap-4 p-4 sm:grid-cols-2">
          <Select label="Clase" value={claseId} onChange={(e) => setClaseId(e.target.value)} disabled={cargandoClases}>
            <option value="">Selecciona una clase…</option>
            {clases.map((a) => (
              <option key={a._id} value={a._id}>
                {etiquetaClase(a)}
              </option>
            ))}
          </Select>
          <Input
            label="Fecha"
            type="date"
            value={fecha}
            max={hoyColombia()}
            onChange={(e) => setFecha(e.target.value)}
          />
        </div>
      </Card>

      <ExcelAsistencia planilla={planilla.data} />

      {!cargandoClases && clases.length === 0 && (
        <Alert tone="info">No tienes clases asignadas en el año lectivo vigente. Coordinación las asigna en Carga académica.</Alert>
      )}

      {claseId && fecha && planilla.isLoading && (
        <div className="flex justify-center p-8">
          <Spinner />
        </div>
      )}
      {planilla.isError && <Alert tone="error">{errorMessage(planilla.error)}</Alert>}
      {planilla.data && <PlanillaAula key={`${groupId}-${subjectId}-${fecha}`} planilla={planilla.data} />}
    </div>
  );
}
