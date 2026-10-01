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
import { BanIcon, PencilIcon, PlusIcon, RefreshIcon } from '../../components/ui/icons';
import { useAnioDeTrabajo } from '../../hooks/useAniosLectivos';
import { useCampuses, useGrades, useJornadas } from '../../hooks/useCatalogs';
import { useEspacios } from '../../hooks/useEspacios';
import { useActualizarEstadoGrupo, useCambiarAulaGrupo, useCreateGroup, useGroups } from '../../hooks/useGroups';
import { useInstitution } from '../../hooks/useInstitution';
import type { Espacio, EstadoGrupo, Group } from '../../types/domain';

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

  // Aula / salón titular (M10): opcional. Las aulas y su ocupación salen del inventario de espacios de la sede.
  const [aulaId, setAulaId] = useState('');
  // Institución virtual: sin espacios físicos, los grupos no llevan aula (ni selector, ni columna, ni consulta).
  const usaEspacios = institutionQuery.data?.modalidad !== 'VIRTUAL';
  const politicaAforo = institutionQuery.data?.politica_aforo_aula ?? 'BLOQUEAR';
  const espaciosQuery = useEspacios({ sede_id: sedeId, academic_year_id: academicYearId }, Boolean(usaEspacios && sedeId && academicYearId));
  const aulas = (espaciosQuery.data ?? []).filter((e) => e.tipo_espacio === 'AULA_REGULAR' && e.estado === 'DISPONIBLE');
  // Un aula ya es salón titular de otro grupo en esa jornada (salvo las de uso simultáneo, que admiten varios).
  // excluirGroupId: al cambiar el aula de un grupo que ya la ocupa, no marcarla como "ocupada por sí mismo".
  const ocupanteDe = (aula: Espacio, jornada: string, excluirGroupId?: string) =>
    !jornada || aula.admite_grupos_simultaneos
      ? undefined
      : aula.grupos_asignados.find((g) => g.jornada?._id === jornada && g._id !== excluirGroupId);
  const aulaElegida = aulas.find((a) => a._id === aulaId);
  const excedeAforo = aulaElegida !== undefined && maxCapacity > aulaElegida.capacidad;
  const bloqueadoPorAforo = excedeAforo && politicaAforo === 'BLOQUEAR';

  // La jornada depende de la sede elegida: al cambiar de sede, la jornada
  // seleccionada ya no aplica (se limpia en el propio evento, no en un efecto).
  function handleSedeChange(nuevaSedeId: string) {
    setSedeId(nuevaSedeId);
    setJornadaId('');
    setAulaId('');
  }

  // Si el aula elegida ya está tomada en la nueva jornada, deja de aplicar.
  function handleJornadaChange(nuevaJornadaId: string) {
    setJornadaId(nuevaJornadaId);
    if (aulaElegida && ocupanteDe(aulaElegida, nuevaJornadaId)) setAulaId('');
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
      aula_id: aulaId || null,
    });
    setNomenclatura('');
    setAulaId('');
    setDrawerOpen(false);
  }

  async function handleToggleEstado(groupId: string, estadoActual: EstadoGrupo) {
    actualizarEstado.reset();
    const siguienteEstado: EstadoGrupo = estadoActual === 'ACTIVE' ? 'CLOSED' : 'ACTIVE';
    await actualizarEstado.mutateAsync({ groupId, estado: siguienteEstado });
  }

  // Cambiar el aula titular de un grupo ya creado (M10: reparaciones locativas, reorganización de aforos).
  const [grupoCambiandoAula, setGrupoCambiandoAula] = useState<Group | null>(null);
  const [nuevaAulaId, setNuevaAulaId] = useState('');
  const cambiarAula = useCambiarAulaGrupo();

  const sedeIdDelGrupo = grupoCambiandoAula
    ? typeof grupoCambiandoAula.sede_id === 'object'
      ? grupoCambiandoAula.sede_id._id
      : grupoCambiandoAula.sede_id
    : '';
  const jornadaIdDelGrupo = grupoCambiandoAula
    ? typeof grupoCambiandoAula.jornada_id === 'object'
      ? grupoCambiandoAula.jornada_id._id
      : grupoCambiandoAula.jornada_id
    : '';
  const espaciosCambioAulaQuery = useEspacios(
    { sede_id: sedeIdDelGrupo, academic_year_id: academicYearId },
    Boolean(usaEspacios && grupoCambiandoAula)
  );
  const aulasParaCambio = (espaciosCambioAulaQuery.data ?? []).filter(
    (e) => e.tipo_espacio === 'AULA_REGULAR' && e.estado === 'DISPONIBLE'
  );
  const nuevaAulaElegida = aulasParaCambio.find((a) => a._id === nuevaAulaId);
  const excedeAforoCambio =
    grupoCambiandoAula !== null && nuevaAulaElegida !== undefined && grupoCambiandoAula.max_capacity > nuevaAulaElegida.capacidad;
  const bloqueadoPorAforoCambio = excedeAforoCambio && politicaAforo === 'BLOQUEAR';

  function handleAbrirCambioAula(g: Group) {
    cambiarAula.reset();
    setGrupoCambiandoAula(g);
    setNuevaAulaId(typeof g.aula_id === 'object' && g.aula_id ? g.aula_id._id : '');
  }

  async function handleGuardarCambioAula(e: FormEvent) {
    e.preventDefault();
    if (!grupoCambiandoAula) return;
    cambiarAula.reset();
    await cambiarAula.mutateAsync({ groupId: grupoCambiandoAula._id, aula_id: nuevaAulaId || null });
    setGrupoCambiandoAula(null);
    setNuevaAulaId('');
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
              {usaEspacios && <Th>Aula</Th>}
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
                  {usaEspacios && (
                  <Td>
                    {typeof g.aula_id === 'object' && g.aula_id ? (
                      <div className="flex flex-wrap items-center gap-1.5">
                        <span className="text-ink">{g.aula_id.nombre}</span>
                        <Chip tone={g.max_capacity > g.aula_id.capacidad ? 'red' : 'neutral'}>
                          {g.max_capacity > g.aula_id.capacidad ? `Excede el aforo (${g.aula_id.capacidad})` : `Aforo ${g.aula_id.capacidad}`}
                        </Chip>
                      </div>
                    ) : (
                      <span className="text-muted">—</span>
                    )}
                  </Td>
                  )}
                  <Td>
                    <CupoBadge ocupados={g.cupos_ocupados} max={g.max_capacity} />
                  </Td>
                  <Td>
                    <EstadoGrupoBadge value={g.estado} />
                  </Td>
                  <Td>
                    <div className="flex items-center justify-end gap-1.5">
                      {usaEspacios && (
                        <IconButton
                          tone="edit"
                          label="Cambiar aula"
                          icon={<PencilIcon />}
                          onClick={() => handleAbrirCambioAula(g)}
                        />
                      )}
                      <IconButton
                        tone={g.estado === 'ACTIVE' ? 'neutral' : 'success'}
                        label={g.estado === 'ACTIVE' ? 'Cerrar grupo' : 'Reactivar grupo'}
                        icon={g.estado === 'ACTIVE' ? <BanIcon /> : <RefreshIcon />}
                        disabled={actualizarEstado.isPending}
                        onClick={() => handleToggleEstado(g._id, g.estado)}
                      />
                    </div>
                  </Td>
                </tr>
              ))}
              {groupsQuery.data.length === 0 && <EmptyRow colSpan={usaEspacios ? 7 : 6}>Sin grupos para este año lectivo.</EmptyRow>}
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
        submitDisabled={bloqueadoPorAforo}
      >
        {createGroup.isError && <Alert tone="error">{errorMessage(createGroup.error)}</Alert>}

        <Select id="grupo-sede" label="Sede" required value={sedeId} onChange={(e) => handleSedeChange(e.target.value)}>
          <option value="">Selecciona...</option>
          {campusesQuery.data?.map((c) => (
            <option key={c._id} value={c._id}>
              {c.nombre}
            </option>
          ))}
        </Select>

        <Select
          id="grupo-grado"
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
          id="grupo-jornada"
          label="Jornada"
          required
          value={jornadaId}
          onChange={(e) => handleJornadaChange(e.target.value)}
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

        {usaEspacios && (
        <Select
          id="grupo-aula"
          label="Aula / Salón asignado (opcional)"
          value={aulaId}
          onChange={(e) => setAulaId(e.target.value)}
          disabled={!sedeId}
          hint={
            !sedeId
              ? 'Selecciona primero una sede.'
              : espaciosQuery.isLoading
                ? 'Cargando aulas...'
                : aulas.length === 0
                  ? 'Esta sede no tiene aulas disponibles registradas. Es opcional (ver "Espacios y aulas").'
                  : !jornadaId
                    ? 'Elige la jornada para ver qué aulas están libres.'
                    : 'Solo aulas regulares disponibles de la sede; su aforo limita el cupo del grupo.'
          }
        >
          <option value="">Sin aula asignada</option>
          {aulas.map((a) => {
            const ocupante = ocupanteDe(a, jornadaId);
            return (
              <option key={a._id} value={a._id} disabled={Boolean(ocupante)}>
                {a.nombre} · aforo {a.capacidad}
                {a.piso_bloque ? ` · ${a.piso_bloque}` : ''}
                {ocupante ? ` — ocupada por ${ocupante.nomenclatura}` : ''}
              </option>
            );
          })}
        </Select>
        )}

        <Input id="grupo-nomenclatura" label="Nomenclatura (ej. 10-A)" required value={nomenclatura} onChange={(e) => setNomenclatura(e.target.value)} />

        <Input
          id="grupo-cupo"
          label="Cupo máximo"
          type="number"
          min={1}
          required
          value={maxCapacity}
          onChange={(e) => setMaxCapacity(Number(e.target.value))}
          hint={aulaElegida && !excedeAforo ? `Aforo del aula "${aulaElegida.nombre}": ${aulaElegida.capacidad} puestos.` : undefined}
        />

        {aulaElegida && excedeAforo && (
          <>
            <Alert tone={bloqueadoPorAforo ? 'error' : 'warning'}>
              El cupo máximo ({maxCapacity}) supera el aforo del aula "{aulaElegida.nombre}" ({aulaElegida.capacidad} puestos).{' '}
              {bloqueadoPorAforo
                ? 'Reduce el cupo o elige otra aula para poder crear el grupo.'
                : 'Puedes guardar igualmente, pero habrá sobrecupo físico y quedará registrado en auditoría.'}
            </Alert>
            <Button type="button" variant="soft-edit" onClick={() => setMaxCapacity(aulaElegida.capacidad)}>
              Ajustar el cupo a {aulaElegida.capacidad}
            </Button>
          </>
        )}
      </Drawer>

      <Drawer
        open={grupoCambiandoAula !== null}
        title={grupoCambiandoAula ? `Cambiar aula de ${grupoCambiandoAula.nomenclatura}` : 'Cambiar aula'}
        onClose={() => setGrupoCambiandoAula(null)}
        onSubmit={handleGuardarCambioAula}
        submitLabel="Guardar"
        isSubmitting={cambiarAula.isPending}
        submitDisabled={bloqueadoPorAforoCambio}
      >
        {cambiarAula.isError && <Alert tone="error">{errorMessage(cambiarAula.error)}</Alert>}

        <Select
          id="grupo-nueva-aula"
          label="Aula / Salón asignado"
          value={nuevaAulaId}
          onChange={(e) => setNuevaAulaId(e.target.value)}
          hint={
            espaciosCambioAulaQuery.isLoading
              ? 'Cargando aulas...'
              : aulasParaCambio.length === 0
                ? 'Esta sede no tiene aulas disponibles registradas.'
                : 'Solo aulas regulares disponibles de la sede; su aforo limita el cupo del grupo.'
          }
        >
          <option value="">Sin aula asignada</option>
          {aulasParaCambio.map((a) => {
            const ocupante = grupoCambiandoAula ? ocupanteDe(a, jornadaIdDelGrupo, grupoCambiandoAula._id) : undefined;
            return (
              <option key={a._id} value={a._id} disabled={Boolean(ocupante)}>
                {a.nombre} · aforo {a.capacidad}
                {a.piso_bloque ? ` · ${a.piso_bloque}` : ''}
                {ocupante ? ` — ocupada por ${ocupante.nomenclatura}` : ''}
              </option>
            );
          })}
        </Select>

        {nuevaAulaElegida && excedeAforoCambio && grupoCambiandoAula && (
          <Alert tone={bloqueadoPorAforoCambio ? 'error' : 'warning'}>
            El cupo máximo ({grupoCambiandoAula.max_capacity}) supera el aforo del aula "{nuevaAulaElegida.nombre}" (
            {nuevaAulaElegida.capacidad} puestos).{' '}
            {bloqueadoPorAforoCambio
              ? 'Elige otra aula o reduce el cupo del grupo para poder guardar.'
              : 'Puedes guardar igualmente, pero habrá sobrecupo físico y quedará registrado en auditoría.'}
          </Alert>
        )}
      </Drawer>
    </div>
  );
}
