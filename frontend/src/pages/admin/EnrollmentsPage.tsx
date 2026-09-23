import { type FormEvent, useState } from 'react';
import { Alert, errorMessage } from '../../components/ui/Alert';
import { Badge } from '../../components/ui/Badge';
import { Button } from '../../components/ui/Button';
import { Card, CardHeader } from '../../components/ui/Card';
import { Input, Select } from '../../components/ui/Field';
import { useInstitutionConfig } from '../../context/InstitutionConfigContext';
import { useCreateEnrollment, useUpdateEnrollmentStatus } from '../../hooks/useEnrollments';
import { useGroups } from '../../hooks/useGroups';
import { useUsers } from '../../hooks/useUsers';
import { ESTADOS_MATRICULA, type EstadoMatricula } from '../../types/domain';

export function EnrollmentsPage() {
  const { config } = useInstitutionConfig();
  const [academicYearId, setAcademicYearId] = useState(config?.academicYearId ?? '');
  const [studentId, setStudentId] = useState('');
  const [groupId, setGroupId] = useState('');

  const studentsQuery = useUsers({ rol: 'ESTUDIANTE' });
  const groupsQuery = useGroups({ academic_year_id: academicYearId });
  const createEnrollment = useCreateEnrollment();

  async function handleEnroll(e: FormEvent) {
    e.preventDefault();
    createEnrollment.reset();
    await createEnrollment.mutateAsync({ student_id: studentId, group_id: groupId, academic_year_id: academicYearId });
  }

  const [statusEnrollmentId, setStatusEnrollmentId] = useState('');
  const [statusEstado, setStatusEstado] = useState<EstadoMatricula>('RETIRADO');
  const updateStatus = useUpdateEnrollmentStatus();

  async function handleStatusChange(e: FormEvent) {
    e.preventDefault();
    updateStatus.reset();
    await updateStatus.mutateAsync({ id: statusEnrollmentId, estado: statusEstado });
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-bold text-slate-900">Matrículas</h1>
        <p className="text-sm text-slate-500">Matricula estudiantes en un grupo y gestiona retiros/traslados.</p>
      </div>

      <Card>
        <CardHeader title="Matricular estudiante" />
        {createEnrollment.isError && <Alert tone="error">{errorMessage(createEnrollment.error)}</Alert>}
        {createEnrollment.isSuccess && (
          <Alert tone="success">
            Matrícula creada — folio <strong>{createEnrollment.data.folio_matricula}</strong>, estado{' '}
            {createEnrollment.data.estado}. ID: <code>{createEnrollment.data._id}</code>
          </Alert>
        )}
        <form onSubmit={handleEnroll} className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-4 sm:items-end">
          <Input label="Año lectivo (ID)" required value={academicYearId} onChange={(e) => setAcademicYearId(e.target.value)} />

          <Select label="Estudiante" required value={studentId} onChange={(e) => setStudentId(e.target.value)}>
            <option value="">Selecciona...</option>
            {studentsQuery.data?.map((s) => (
              <option key={s._id} value={s._id}>
                {s.nombre} {s.apellido} · {s.numero_documento}
              </option>
            ))}
          </Select>

          <Select label="Grupo" required value={groupId} onChange={(e) => setGroupId(e.target.value)}>
            <option value="">Selecciona...</option>
            {groupsQuery.data?.map((g) => (
              <option key={g._id} value={g._id}>
                {g.nomenclatura} ({g.cupos_ocupados}/{g.cupo_maximo})
              </option>
            ))}
          </Select>

          <Button type="submit" isLoading={createEnrollment.isPending}>
            Matricular
          </Button>
        </form>
      </Card>

      <Card>
        <CardHeader title="Retirar / trasladar matrícula" subtitle="Ingresa el ID de la matrícula (ver arriba tras crearla)." />
        {updateStatus.isError && <Alert tone="error">{errorMessage(updateStatus.error)}</Alert>}
        {updateStatus.isSuccess && (
          <Alert tone="success">
            Matrícula actualizada a <Badge>{updateStatus.data.estado}</Badge>
          </Alert>
        )}
        <form onSubmit={handleStatusChange} className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-3 sm:items-end">
          <Input
            label="ID de la matrícula"
            required
            value={statusEnrollmentId}
            onChange={(e) => setStatusEnrollmentId(e.target.value)}
          />
          <Select label="Nuevo estado" value={statusEstado} onChange={(e) => setStatusEstado(e.target.value as EstadoMatricula)}>
            {ESTADOS_MATRICULA.map((estado) => (
              <option key={estado} value={estado}>
                {estado}
              </option>
            ))}
          </Select>
          <Button type="submit" variant="secondary" isLoading={updateStatus.isPending}>
            Actualizar estado
          </Button>
        </form>
      </Card>
    </div>
  );
}
