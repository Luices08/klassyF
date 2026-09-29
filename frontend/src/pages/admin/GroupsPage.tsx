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
import { BanIcon, PlusIcon, RefreshIcon } from '../../components/ui/icons';
import { useAnioDeTrabajo } from '../../hooks/useAniosLectivos';
import { useCampuses, useGrades, useJornadas } from '../../hooks/useCatalogs';
import { useActualizarEstadoGrupo, useCreateGroup, useGroups } from '../../hooks/useGroups';
import { useInstitution } from '../../hooks/useInstitution';
import type { EstadoGrupo } from '../../types/domain';

export function GroupsPage() {
  const institutionQuery = useInstitution();
  const { anio: anioPorDefecto, anios, query: aniosQuery } = useAnioDeTrabajo();
  // Sin selección explícita se trabaja sobre la vigencia activa (o, si no hay, el más reciente sin cerrar).
  const [anioElegidoId, setAnioElegidoId] = useState('');
  const anioActual = anios.find((a) => a._id === anioElegidoId) ?? anioPorDefecto;
  const academicYearId = anioActual?._id ?? '';
  const anioCerrado = anioActual?.estado === 'CERRADO';

  const gradesQuery = useGrades();
  const gradesActivosQuery = useGrades('activo');
  const campusesQuery = useCampuses(institutionQuery.data?._id);
  const createGroup = useCreateGroup();
  const actualizarEstado = useActualizarEstadoGrupo();

  const [filtroSede, setFiltroSede] = useState('');
  const [filtroJornada, setFiltroJornada] = useState('');
  const [filtroGrado, setFiltroGrado] = useState('');
  const jornadasFiltroQuery = useJornadas(filtroSede || undefined);
  const groupsQuery = useGroups({
    academic_year_id: academicYearId,
    sede_id: filtroSede || undefined,
    jornada_id: filtroJornada || undefined,
    grade_id: filtroGrado || undefined,
  });

  function handleFiltroSedeChange(nuevaSedeId: string) {
    setFiltroSede(nuevaSedeId);
    setFiltroJornada('');
  }

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
    <div className="space-y-4">
      <PageHeader
        title="Grupos"
        subtitle="Crea y consulta los grupos de un año lectivo."
        action={
          <Button onClick={() => setDrawerOpen(true)} disabled={!academicYearId || anioCerrado}>
            <PlusIcon className="h-4 w-4" />
            Nuevo grupo
          </Button>
        }
      />

      {institutionQuery.isError && <Alert tone="error">{errorMessage(institutionQuery.error)}</Alert>}
      {!institutionQuery.isLoading && !institutionQuery.isError && !institutionQuery.data && (
        <Alert tone="info">Aún no hay una institución configurada. Ve a "Configuración institucional".</Alert>
      )}

      <Card>
        <CardHeader
          title="Año lectivo"
          subtitle="Cada grupo pertenece a un año lectivo; los años cerrados son de solo lectura."
          action={
            <Select
              label="Año lectivo"
              className="w-64"
              value={academicYearId}
              onChange={(e) => setAnioElegidoId(e.target.value)}
            >
              {anios.map((a) => (
                <option key={a._id} value={a._id}>
                  {a.nombre}
                  {a.estado === 'EN_CURSO' ? ' (vigente)' : a.estado === 'CERRADO' ? ' (histórico)' : ''}
                </option>
              ))}
            </Select>
          }
        />
        {aniosQuery.isError && <Alert tone="error">{errorMessage(aniosQuery.error)}</Alert>}
        {!aniosQuery.isLoading && anios.length === 0 && (
          <Alert tone="info">Aún no hay años lectivos. Créalo en "Año lectivo".</Alert>
        )}
        {anioCerrado && <Alert tone="info">Año cerrado: solo consulta, no se pueden crear grupos.</Alert>}
      </Card>

      <Card>
        <CardHeader title="Grupos del año lectivo" subtitle="Filtra por sede, jornada o grado." />
        <div className="mb-4 grid grid-cols-1 gap-4 sm:grid-cols-3">
          <Select label="Sede" value={filtroSede} onChange={(e) => handleFiltroSedeChange(e.target.value)}>
            <option value="">Todas las sedes</option>
            {campusesQuery.data?.map((c) => (
              <option key={c._id} value={c._id}>
                {c.nombre}
              </option>
            ))}
          </Select>
          <Select
            label="Jornada"
            value={filtroJornada}
            onChange={(e) => setFiltroJornada(e.target.value)}
            disabled={!filtroSede}
            hint={!filtroSede ? 'Selecciona primero una sede.' : undefined}
          >
            <option value="">Todas las jornadas</option>
            {jornadasFiltroQuery.data?.map((j) => (
              <option key={j._id} value={j._id}>
                {j.nombre}
              </option>
            ))}
          </Select>
          <Select label="Grado" value={filtroGrado} onChange={(e) => setFiltroGrado(e.target.value)}>
            <option value="">Todos los grados</option>
            {gradesQuery.data?.map((g) => (
              <option key={g._id} value={g._id}>
                {g.nombre}
              </option>
            ))}
          </Select>
        </div>
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
                      tone={g.estado === 'ACTIVE' ? 'neutral' : 'success'}
                      label={g.estado === 'ACTIVE' ? 'Cerrar grupo' : 'Reactivar grupo'}
                      icon={g.estado === 'ACTIVE' ? <BanIcon /> : <RefreshIcon />}
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

        <Select
          label="Grado"
          required
          value={gradeId}
          onChange={(e) => setGradeId(e.target.value)}
          hint="Solo se listan los grados activos en el catálogo institucional."
        >
          <option value="">Selecciona...</option>
          {gradesActivosQuery.data?.map((g) => (
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
