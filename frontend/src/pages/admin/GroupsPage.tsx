import { type FormEvent, useState } from 'react';
import { Alert, errorMessage } from '../../components/ui/Alert';
import { Badge } from '../../components/ui/Badge';
import { Button } from '../../components/ui/Button';
import { Card, CardHeader } from '../../components/ui/Card';
import { Input, Select } from '../../components/ui/Field';
import { Spinner } from '../../components/ui/Spinner';
import { useInstitutionConfig } from '../../context/InstitutionConfigContext';
import { useCampuses, useGrades } from '../../hooks/useCatalogs';
import { useCreateGroup, useGroups } from '../../hooks/useGroups';
import { JORNADAS, type Jornada } from '../../types/domain';

export function GroupsPage() {
  const { config } = useInstitutionConfig();
  const [academicYearId, setAcademicYearId] = useState(config?.academicYearId ?? '');

  const gradesQuery = useGrades();
  const campusesQuery = useCampuses(config?.institutionId);
  const groupsQuery = useGroups({ academic_year_id: academicYearId });
  const createGroup = useCreateGroup();

  const [sedeId, setSedeId] = useState('');
  const [gradeId, setGradeId] = useState('');
  const [jornada, setJornada] = useState<Jornada>('MANANA');
  const [nomenclatura, setNomenclatura] = useState('');
  const [cupoMaximo, setCupoMaximo] = useState(30);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    createGroup.reset();
    await createGroup.mutateAsync({
      sede_id: sedeId,
      academic_year_id: academicYearId,
      grade_id: gradeId,
      jornada,
      nomenclatura,
      cupo_maximo: cupoMaximo,
    });
    setNomenclatura('');
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-bold text-slate-900">Grupos</h1>
        <p className="text-sm text-slate-500">Crea y consulta los grupos de un año lectivo.</p>
      </div>

      {!config && (
        <Alert tone="info">
          Aún no hay una institución configurada en esta sesión. Ve a "Configuración institucional" o ingresa el
          ID del año lectivo manualmente abajo.
        </Alert>
      )}

      <Card>
        <CardHeader title="Nuevo grupo" />
        {createGroup.isError && <Alert tone="error">{errorMessage(createGroup.error)}</Alert>}
        <form onSubmit={handleSubmit} className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-3">
          <Input label="Año lectivo (ID)" required value={academicYearId} onChange={(e) => setAcademicYearId(e.target.value)} />

          <Select label="Sede" required value={sedeId} onChange={(e) => setSedeId(e.target.value)}>
            <option value="">Selecciona...</option>
            {campusesQuery.data?.map((c) => (
              <option key={c._id} value={c._id}>
                {c.nombre}
              </option>
            ))}
          </Select>

          <Select label="Grado" required value={gradeId} onChange={(e) => setGradeId(e.target.value)}>
            <option value="">Selecciona...</option>
            {gradesQuery.data?.map((g) => (
              <option key={g._id} value={g._id}>
                {g.nombre}
              </option>
            ))}
          </Select>

          <Select label="Jornada" value={jornada} onChange={(e) => setJornada(e.target.value as Jornada)}>
            {JORNADAS.map((j) => (
              <option key={j} value={j}>
                {j}
              </option>
            ))}
          </Select>

          <Input
            label="Nomenclatura (ej. 10-A)"
            required
            value={nomenclatura}
            onChange={(e) => setNomenclatura(e.target.value)}
          />

          <Input
            label="Cupo máximo"
            type="number"
            min={1}
            required
            value={cupoMaximo}
            onChange={(e) => setCupoMaximo(Number(e.target.value))}
          />

          <div className="sm:col-span-3">
            <Button type="submit" isLoading={createGroup.isPending}>
              Crear grupo
            </Button>
          </div>
        </form>
      </Card>

      <Card>
        <CardHeader title="Grupos del año lectivo" />
        {groupsQuery.isLoading && <Spinner />}
        {groupsQuery.isError && <Alert tone="error">{errorMessage(groupsQuery.error)}</Alert>}
        {groupsQuery.data && (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-slate-200 text-sm">
              <thead>
                <tr className="text-left text-xs font-medium uppercase tracking-wide text-slate-500">
                  <th className="py-2 pr-4">Grupo</th>
                  <th className="py-2 pr-4">Grado</th>
                  <th className="py-2 pr-4">Jornada</th>
                  <th className="py-2 pr-4">Cupos</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {groupsQuery.data.map((g) => (
                  <tr key={g._id}>
                    <td className="py-2 pr-4 font-medium text-slate-900">{g.nomenclatura}</td>
                    <td className="py-2 pr-4 text-slate-600">
                      {typeof g.grade_id === 'object' ? g.grade_id.nombre : g.grade_id}
                    </td>
                    <td className="py-2 pr-4">
                      <Badge>{g.jornada}</Badge>
                    </td>
                    <td className="py-2 pr-4 text-slate-600">
                      {g.cupos_ocupados} / {g.cupo_maximo}
                    </td>
                  </tr>
                ))}
                {groupsQuery.data.length === 0 && (
                  <tr>
                    <td colSpan={4} className="py-4 text-center text-slate-400">
                      Sin grupos para este año lectivo.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}
