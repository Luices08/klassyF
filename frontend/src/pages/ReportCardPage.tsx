import { type FormEvent, useState } from 'react';
import { Alert, errorMessage } from '../components/ui/Alert';
import { Button } from '../components/ui/Button';
import { Card, CardHeader } from '../components/ui/Card';
import { Input, Select } from '../components/ui/Field';
import { Spinner } from '../components/ui/Spinner';
import { ReportCardView } from '../components/reportCard/ReportCardView';
import { useAuth } from '../context/AuthContext';
import { useInstitutionConfig } from '../context/InstitutionConfigContext';
import { useReportCard, type ReportCardQuery } from '../hooks/useReportCard';
import { useUsers } from '../hooks/useUsers';

const STAFF_ROLES = ['SUPERADMIN', 'RECTOR', 'COORDINADOR', 'SECRETARIA', 'DOCENTE'] as const;

export function ReportCardPage() {
  const { user } = useAuth();
  const { config } = useInstitutionConfig();
  const isStudent = user?.rol === 'ESTUDIANTE';
  const canBrowseStudents = user ? (STAFF_ROLES as readonly string[]).includes(user.rol) : false;

  const [studentId, setStudentId] = useState(isStudent ? (user?.id ?? '') : '');
  const [academicYearId, setAcademicYearId] = useState(config?.academicYearId ?? '');
  const [periodo, setPeriodo] = useState(1);
  const [query, setQuery] = useState<ReportCardQuery | null>(null);

  const studentsQuery = useUsers({ rol: 'ESTUDIANTE' }, canBrowseStudents);
  const reportCardQuery = useReportCard(query);

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setQuery({ student_id: studentId, academic_year_id: academicYearId, periodo });
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-bold text-slate-900">Boletín académico</h1>
        <p className="text-sm text-slate-500">Consulta el boletín de un estudiante por año lectivo y periodo.</p>
      </div>

      <Card>
        <CardHeader title="Buscar boletín" />
        <form onSubmit={handleSubmit} className="grid grid-cols-1 gap-4 sm:grid-cols-4 sm:items-end">
          {isStudent ? (
            <Input label="Estudiante" value={studentId} disabled hint="Tu propio boletín" />
          ) : canBrowseStudents && studentsQuery.data ? (
            <Select label="Estudiante" value={studentId} onChange={(e) => setStudentId(e.target.value)} required>
              <option value="">Selecciona...</option>
              {studentsQuery.data.map((s) => (
                <option key={s._id} value={s._id}>
                  {s.nombre} {s.apellido} · {s.numero_documento}
                </option>
              ))}
            </Select>
          ) : (
            <Input
              label="ID del estudiante"
              value={studentId}
              onChange={(e) => setStudentId(e.target.value)}
              required
            />
          )}

          <Input
            label="Año lectivo (ID)"
            value={academicYearId}
            onChange={(e) => setAcademicYearId(e.target.value)}
            hint={config ? `Último configurado: ${config.academicYearYear}` : undefined}
            required
          />

          <Select label="Periodo" value={periodo} onChange={(e) => setPeriodo(Number(e.target.value))}>
            <option value={1}>Periodo 1</option>
            <option value={2}>Periodo 2</option>
            <option value={3}>Periodo 3</option>
            <option value={4}>Periodo 4</option>
          </Select>

          <Button type="submit" isLoading={reportCardQuery.isFetching}>
            Consultar
          </Button>
        </form>
      </Card>

      {reportCardQuery.isFetching && <Spinner label="Calculando boletín..." />}

      {reportCardQuery.isError && <Alert tone="error">{errorMessage(reportCardQuery.error)}</Alert>}

      {reportCardQuery.data && <ReportCardView reportCard={reportCardQuery.data} />}
    </div>
  );
}
