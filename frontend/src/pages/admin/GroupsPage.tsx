import { type FormEvent, useState } from 'react';
import { Alert, errorMessage } from '../../components/ui/Alert';
import { Badge } from '../../components/ui/Badge';
import { Button } from '../../components/ui/Button';
import { Card, CardHeader } from '../../components/ui/Card';
import { Input, Select } from '../../components/ui/Field';
import { Spinner } from '../../components/ui/Spinner';
import { useInstitutionConfig } from '../../context/InstitutionConfigContext';
import { useCampuses, useGrades, useJornadas } from '../../hooks/useCatalogs';
import { useActualizarEstadoGrupo, useCreateGroup, useGroups } from '../../hooks/useGroups';
import type { EstadoGrupo } from '../../types/domain';

export function GroupsPage() {
  const { config } = useInstitutionConfig();
  const [academicYearId, setAcademicYearId] = useState(config?.academicYearId ?? '');

  const gradesQuery = useGrades();
  const campusesQuery = useCampuses(config?.institutionId);
  const groupsQuery = useGroups({ academic_year_id: academicYearId });
  const createGroup = useCreateGroup();
  const actualizarEstado = useActualizarEstadoGrupo();

  const [sedeId, setSedeId] = useState('');
  const [gradeId, setGradeId] = useState('');
  const [jornadaId, setJornadaId] = useState('');
  const [nomenclatura, setNomenclatura] = useState('');
  const [maxCapacity, setMaxCapacity] = useState(30);

  const jornadasQuery = useJornadas(sedeId || undefined);

  // La jornada depende de la sede elegida: al cambiar de sede, la jornada
  // seleccionada ya no aplica (se limpia en el propio evento, no en un efecto).
  function handleSedeChange(nuevaSedeId: string) {
    setSedeId(nuevaSedeId);
    setJornadaId('');
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    createGroup.reset();
    await createGroup.mutateAsync({
      sede_id: sedeId,
      academic_year_id: academicYearId,
      grade_id: gradeId,
      jornada_id: jornadaId,
      nomenclatura,
      max_capacity: maxCapacity,
    });
    setNomenclatura('');
  }

  async function handleToggleEstado(groupId: string, estadoActual: EstadoGrupo) {
    actualizarEstado.reset();
    const siguienteEstado: EstadoGrupo = estadoActual === 'ACTIVE' ? 'CLOSED' : 'ACTIVE';
    await actualizarEstado.mutateAsync({ groupId, estado: siguienteEstado });
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

          <Select label="Sede" required value={sedeId} onChange={(e) => handleSedeChange(e.target.value)}>
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

          <Select
            label="Jornada"
            required
            value={jornadaId}
            onChange={(e) => setJornadaId(e.target.value)}
            disabled={!sedeId}
            hint={
              !sedeId
                ? 'Selecciona primero una sede.'
                : jornadasQuery.data?.length === 0
                  ? 'Esta sede no tiene jornadas habilitadas (ver "Sedes y jornadas").'
                  : undefined
            }
          >
            <option value="">Selecciona...</option>
            {jornadasQuery.data?.map((j) => (
              <option key={j._id} value={j._id}>
                {j.nombre}
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
            value={maxCapacity}
            onChange={(e) => setMaxCapacity(Number(e.target.value))}
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
        {actualizarEstado.isError && <Alert tone="error">{errorMessage(actualizarEstado.error)}</Alert>}
        {groupsQuery.data && (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-slate-200 text-sm">
              <thead>
                <tr className="text-left text-xs font-medium uppercase tracking-wide text-slate-500">
                  <th className="py-2 pr-4">Grupo</th>
                  <th className="py-2 pr-4">Grado</th>
                  <th className="py-2 pr-4">Jornada</th>
                  <th className="py-2 pr-4">Cupos</th>
                  <th className="py-2 pr-4">Estado</th>
                  <th className="py-2 pr-4" />
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
                      <Badge>{typeof g.jornada_id === 'object' ? g.jornada_id.nombre : g.jornada_id}</Badge>
                    </td>
                    <td className="py-2 pr-4 text-slate-600">
                      {g.cupos_ocupados} / {g.max_capacity}
                    </td>
                    <td className="py-2 pr-4">
                      <Badge tone={g.estado === 'ACTIVE' ? 'green' : 'slate'}>{g.estado}</Badge>
                    </td>
                    <td className="py-2 pr-4">
                      <Button
                        type="button"
                        variant="secondary"
                        className="px-2.5 py-1 text-xs"
                        isLoading={actualizarEstado.isPending}
                        onClick={() => handleToggleEstado(g._id, g.estado)}
                      >
                        {g.estado === 'ACTIVE' ? 'Cerrar' : 'Reactivar'}
                      </Button>
                    </td>
                  </tr>
                ))}
                {groupsQuery.data.length === 0 && (
                  <tr>
                    <td colSpan={6} className="py-4 text-center text-slate-400">
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
