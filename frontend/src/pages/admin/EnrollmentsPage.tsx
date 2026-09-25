import { type FormEvent, useState } from 'react';
import { Alert, errorMessage } from '../../components/ui/Alert';
import { Chip } from '../../components/ui/Badge';
import { Button } from '../../components/ui/Button';
import { Card, CardHeader } from '../../components/ui/Card';
import { Drawer } from '../../components/ui/Drawer';
import { Input, Select } from '../../components/ui/Field';
import { PageHeader } from '../../components/ui/PageHeader';
import { PlusIcon } from '../../components/ui/icons';
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
  const [enrollDrawerOpen, setEnrollDrawerOpen] = useState(false);

  async function handleEnroll(e: FormEvent) {
    e.preventDefault();
    createEnrollment.reset();
    await createEnrollment.mutateAsync({ student_id: studentId, group_id: groupId, academic_year_id: academicYearId });
    setEnrollDrawerOpen(false);
  }

  const [statusDrawerOpen, setStatusDrawerOpen] = useState(false);
  const [statusEnrollmentId, setStatusEnrollmentId] = useState('');
  const [statusEstado, setStatusEstado] = useState<EstadoMatricula>('RETIRADO');
  const updateStatus = useUpdateEnrollmentStatus();

  async function handleStatusChange(e: FormEvent) {
    e.preventDefault();
    updateStatus.reset();
    await updateStatus.mutateAsync({ id: statusEnrollmentId, estado: statusEstado });
    setStatusDrawerOpen(false);
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Matrículas"
        subtitle="Matricula estudiantes en un grupo y gestiona retiros/traslados."
        action={
          <Button onClick={() => setEnrollDrawerOpen(true)}>
            <PlusIcon className="h-4 w-4" />
            Matricular
          </Button>
        }
      />

      {createEnrollment.isSuccess && (
        <Alert tone="success">
          Matrícula creada — folio <strong>{createEnrollment.data.folio_matricula}</strong>, estado{' '}
          {createEnrollment.data.estado}. ID: <code>{createEnrollment.data._id}</code>
        </Alert>
      )}

      <Card>
        <CardHeader
          title="Retirar / trasladar matrícula"
          subtitle="Ingresa el ID de la matrícula (ver arriba tras crearla)."
          action={
            <Button type="button" variant="outline" onClick={() => setStatusDrawerOpen(true)}>
              Cambiar estado
            </Button>
          }
        />
        {updateStatus.isSuccess && (
          <Alert tone="success">
            Matrícula actualizada a <Chip tone="blue">{updateStatus.data.estado}</Chip>
          </Alert>
        )}
      </Card>

      <Drawer
        open={enrollDrawerOpen}
        title="Matricular estudiante"
        onClose={() => setEnrollDrawerOpen(false)}
        onSubmit={handleEnroll}
        submitLabel="Matricular"
        isSubmitting={createEnrollment.isPending}
      >
        {createEnrollment.isError && <Alert tone="error">{errorMessage(createEnrollment.error)}</Alert>}

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
              {g.nomenclatura} ({g.cupos_ocupados}/{g.max_capacity})
            </option>
          ))}
        </Select>
      </Drawer>

      <Drawer
        open={statusDrawerOpen}
        title="Retirar / trasladar matrícula"
        onClose={() => setStatusDrawerOpen(false)}
        onSubmit={handleStatusChange}
        submitLabel="Actualizar estado"
        isSubmitting={updateStatus.isPending}
      >
        {updateStatus.isError && <Alert tone="error">{errorMessage(updateStatus.error)}</Alert>}

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
      </Drawer>
    </div>
  );
}
