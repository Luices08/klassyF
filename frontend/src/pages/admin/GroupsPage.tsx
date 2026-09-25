import { type FormEvent, useState } from 'react';
import { Alert, errorMessage } from '../../components/ui/Alert';
import { Chip, CupoBadge, EstadoGrupoBadge } from '../../components/ui/Badge';
import { Button } from '../../components/ui/Button';
import { Card, CardHeader } from '../../components/ui/Card';
import { Drawer } from '../../components/ui/Drawer';
import { Input, Select } from '../../components/ui/Field';
import { IconButton } from '../../components/ui/IconButton';
import { PageHeader } from '../../components/ui/PageHeader';
import { Spinner } from '../../components/ui/Spinner';
import { EmptyRow, Table, TableBody, TableHead, Td, Th } from '../../components/ui/Table';
import { PlusIcon, RefreshIcon, TrashIcon } from '../../components/ui/icons';
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

  const [drawerOpen, setDrawerOpen] = useState(false);
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
    setDrawerOpen(false);
  }

  async function handleToggleEstado(groupId: string, estadoActual: EstadoGrupo) {
    actualizarEstado.reset();
    const siguienteEstado: EstadoGrupo = estadoActual === 'ACTIVE' ? 'CLOSED' : 'ACTIVE';
    await actualizarEstado.mutateAsync({ groupId, estado: siguienteEstado });
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Grupos"
        subtitle="Crea y consulta los grupos de un año lectivo."
        action={
          <Button onClick={() => setDrawerOpen(true)}>
            <PlusIcon className="h-4 w-4" />
            Nuevo grupo
          </Button>
        }
      />

      {!config && (
        <Alert tone="info">
          Aún no hay una institución configurada en esta sesión. Ve a "Configuración institucional" o ingresa el
          ID del año lectivo manualmente abajo.
        </Alert>
      )}

      <Card>
        <CardHeader
          title="Año lectivo"
          action={
            <Input
              label="Año lectivo (ID)"
              required
              className="w-64"
              value={academicYearId}
              onChange={(e) => setAcademicYearId(e.target.value)}
            />
          }
        />
      </Card>

      <Card>
        <CardHeader title="Grupos del año lectivo" />
        {groupsQuery.isLoading && <Spinner />}
        {groupsQuery.isError && <Alert tone="error">{errorMessage(groupsQuery.error)}</Alert>}
        {actualizarEstado.isError && <Alert tone="error">{errorMessage(actualizarEstado.error)}</Alert>}
        {groupsQuery.data && (
          <Table>
            <TableHead>
              <Th>Grupo</Th>
              <Th>Grado</Th>
              <Th>Jornada</Th>
              <Th>Cupos</Th>
              <Th>Estado</Th>
              <Th />
            </TableHead>
            <TableBody>
              {groupsQuery.data.map((g) => (
                <tr key={g._id}>
                  <Td className="font-medium text-ink">{g.nomenclatura}</Td>
                  <Td>{typeof g.grade_id === 'object' ? g.grade_id.nombre : g.grade_id}</Td>
                  <Td>
                    <Chip tone="blue">{typeof g.jornada_id === 'object' ? g.jornada_id.nombre : g.jornada_id}</Chip>
                  </Td>
                  <Td>
                    <CupoBadge ocupados={g.cupos_ocupados} max={g.max_capacity} />
                  </Td>
                  <Td>
                    <EstadoGrupoBadge value={g.estado} />
                  </Td>
                  <Td>
                    <IconButton
                      tone={g.estado === 'ACTIVE' ? 'danger' : 'success'}
                      label={g.estado === 'ACTIVE' ? 'Cerrar grupo' : 'Reactivar grupo'}
                      icon={g.estado === 'ACTIVE' ? <TrashIcon /> : <RefreshIcon />}
                      disabled={actualizarEstado.isPending}
                      onClick={() => handleToggleEstado(g._id, g.estado)}
                    />
                  </Td>
                </tr>
              ))}
              {groupsQuery.data.length === 0 && <EmptyRow colSpan={6}>Sin grupos para este año lectivo.</EmptyRow>}
            </TableBody>
          </Table>
        )}
      </Card>

      <Drawer
        open={drawerOpen}
        title="Nuevo grupo"
        onClose={() => setDrawerOpen(false)}
        onSubmit={handleSubmit}
        submitLabel="Crear grupo"
        isSubmitting={createGroup.isPending}
      >
        {createGroup.isError && <Alert tone="error">{errorMessage(createGroup.error)}</Alert>}

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

        <Input label="Nomenclatura (ej. 10-A)" required value={nomenclatura} onChange={(e) => setNomenclatura(e.target.value)} />

        <Input
          label="Cupo máximo"
          type="number"
          min={1}
          required
          value={maxCapacity}
          onChange={(e) => setMaxCapacity(Number(e.target.value))}
        />
      </Drawer>
    </div>
  );
}
