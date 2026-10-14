import { useState } from 'react';
import { Link } from 'react-router-dom';
import { DetallePlanDrawer } from '../../components/planeacion/DetallePlanDrawer';
import { Alert, errorMessage } from '../../components/ui/Alert';
import { Chip, EstadoPlanBadge, EstadoVentanaBadge, FueraDePlazoChip } from '../../components/ui/Badge';
import { Card } from '../../components/ui/Card';
import { Select } from '../../components/ui/Field';
import { IconButton } from '../../components/ui/IconButton';
import { PageHeader } from '../../components/ui/PageHeader';
import { Spinner } from '../../components/ui/Spinner';
import { EmptyRow, Table, TableBody, TableHead, Td, Th } from '../../components/ui/Table';
import { TabPanel, Tabs } from '../../components/ui/Tabs';
import { EyeIcon } from '../../components/ui/icons';
import { useAnioDeTrabajo } from '../../hooks/useAniosLectivos';
import { useAreas } from '../../hooks/useCatalogoAcademico';
import { useGrades } from '../../hooks/useCatalogs';
import { usePlanesArea } from '../../hooks/usePlanesArea';
import { useBandejaPlanesAula } from '../../hooks/usePlanesAula';
import { formatoFechaHora } from '../../lib/fechas';
import { nombreDePersona, textoVentana } from '../../lib/planeacion';
import { ESTADOS_PLAN, NOMBRES_ESTADO_PLAN, type EstadoPlanVista } from '../../types/domain';

/**
 * M07, vista de coordinación y administración: el plan de área de cada área (aprobar o devolver con comentario, y cuáles bloquean la
 * activación del año) y la cobertura de los planes de aula (qué docente, asignatura, grado y periodo ya radicó, quién va tarde y cuáles
 * quedaron archivados porque el docente ya no dicta esa asignatura). Todo lo del coordinador lo puede usar también el administrador.
 */
export function RevisionPlaneacionPage() {
  const { anio: anioDeTrabajo, anios } = useAnioDeTrabajo();
  const [anioElegido, setAnioElegido] = useState('');
  const anio = anios.find((a) => a._id === anioElegido) ?? anioDeTrabajo;

  const [pestana, setPestana] = useState('aulas');
  const [viendo, setViendo] = useState<{ tipo: 'AREA' | 'AULA'; id: string } | null>(null);

  const [periodo, setPeriodo] = useState('');
  const [areaId, setAreaId] = useState('');
  const [gradoId, setGradoId] = useState('');
  const [estado, setEstado] = useState<EstadoPlanVista | ''>('');

  const areas = useAreas();
  const grados = useGrades('activo');
  const planesArea = usePlanesArea(anio?._id);
  const bandeja = useBandejaPlanesAula({
    academic_year_id: anio?._id,
    periodo_numero: periodo ? Number(periodo) : undefined,
    area_id: areaId,
    grade_id: gradoId,
    estado,
  });

  const filasArea = planesArea.data ?? [];
  const bloquean = [...new Set(filasArea.filter((f) => f.pendiente_para_activar !== null).map((f) => f.area.nombre))];
  const resumen = bandeja.data?.resumen;

  return (
    <div className="space-y-4">
      <PageHeader
        title="Revisión de planeación"
        subtitle="Planes de área y planes de aula por periodo: aprueba, devuelve con comentarios y sigue quién falta por radicar."
      />

      {anios.length > 1 && (
        <div className="max-w-xs">
          <Select label="Año lectivo" value={anio?._id ?? ''} onChange={(e) => setAnioElegido(e.target.value)}>
            {anios.map((a) => (
              <option key={a._id} value={a._id}>
                {a.nombre}
                {a.estado === 'EN_CURSO' ? ' (vigente)' : a.estado === 'CERRADO' ? ' (histórico)' : ''}
              </option>
            ))}
          </Select>
        </div>
      )}
      {anio?.estado === 'CERRADO' && <Alert tone="info">Estás consultando un año cerrado: es un histórico de solo lectura.</Alert>}

      <Tabs
        items={[
          { key: 'aulas', label: 'Planes de aula' },
          { key: 'areas', label: 'Planes de área' },
        ]}
        active={pestana}
        onChange={setPestana}
      />

      <TabPanel active={pestana} tabKey="areas">
        <div className="space-y-4">
          {anio?.estado === 'PLANIFICACION' && bloquean.length > 0 && (
            <Alert tone="warning">
              <p className="font-semibold">El año no se puede activar todavía.</p>
              <p>
                {bloquean.length === 1 ? 'Esta área obligatoria no tiene' : `Estas ${bloquean.length} áreas obligatorias no tienen`} su plan de área aprobado:{' '}
                {bloquean.join(', ')}.
              </p>
            </Alert>
          )}
          {anio?.estado === 'EN_CURSO' && bloquean.length > 0 && (
            <Alert tone="info">
              {bloquean.length === 1 ? 'Un área obligatoria sigue' : `${bloquean.length} áreas obligatorias siguen`} sin plan de área aprobado; sus docentes no pueden cargar
              el plan de aula.
            </Alert>
          )}
          {planesArea.isLoading && <Spinner label="Cargando los planes de área..." />}
          {planesArea.isError && <Alert tone="error">{errorMessage(planesArea.error)}</Alert>}
          <Table>
            <TableHead>
              <Th>Área</Th>
              <Th>Líder</Th>
              <Th>Estado</Th>
              <Th>Plan</Th>
              <Th className="text-right">Acciones</Th>
            </TableHead>
            <TableBody>
              {!planesArea.isLoading && filasArea.length === 0 && <EmptyRow colSpan={5}>No hay áreas activas en el catálogo académico.</EmptyRow>}
              {filasArea.map((fila) => (
                <tr key={fila.clave} className={fila.vigente ? '' : 'bg-soft/60'}>
                  <Td>
                    <p className="font-semibold text-ink">{fila.area.nombre}</p>
                    {fila.alcance && <p className="text-xs text-muted">{fila.alcance.texto}</p>}
                    {fila.obligatoria && <p className="text-xs text-muted">Obligatoria</p>}
                  </Td>
                  <Td>
                    {fila.lider ? (
                      <>
                        {nombreDePersona(fila.lider)}
                        {!fila.vigente && <p className="text-xs text-muted">Ya no lidera esta parte</p>}
                      </>
                    ) : (
                      <span className="text-muted">
                        Sin líder
                        {fila.sin_cubrir && fila.sin_cubrir.length > 0 && <span className="block text-xs">Falta quien cubra: {fila.sin_cubrir.join('; ')}</span>} ·{' '}
                        <Link to="/admin/academic-catalog" className="font-semibold text-primary hover:underline">
                          asignarlo
                        </Link>
                      </span>
                    )}
                  </Td>
                  <Td>
                    <EstadoPlanBadge value={fila.estado} />
                  </Td>
                  <Td>
                    {fila.plan ? (
                      <>
                        <p className="font-medium text-ink">{fila.plan.titulo}</p>
                        <p className="text-xs text-muted">
                          {fila.plan.radicado_en ? formatoFechaHora(fila.plan.radicado_en) : ''} · versión {fila.plan.version_actual}
                        </p>
                      </>
                    ) : (
                      <span className="text-muted">{fila.lider ? 'El líder aún no lo carga' : '—'}</span>
                    )}
                  </Td>
                  <Td className="text-right">
                    {fila.plan && (
                      <IconButton
                        tone={fila.puede.revisar ? 'success' : 'edit'}
                        label={fila.puede.revisar ? 'Revisar plan' : 'Ver plan'}
                        icon={<EyeIcon />}
                        onClick={() => setViendo({ tipo: 'AREA', id: fila.plan!._id })}
                      />
                    )}
                  </Td>
                </tr>
              ))}
            </TableBody>
          </Table>
        </div>
      </TabPanel>

      <TabPanel active={pestana} tabKey="aulas">
        <div className="space-y-4">
          <Card>
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
              <Select label="Periodo" value={periodo} onChange={(e) => setPeriodo(e.target.value)}>
                <option value="">Todos</option>
                {(anio?.periodos ?? []).map((p) => (
                  <option key={p.numero} value={p.numero}>
                    {p.nombre || `Periodo ${p.numero}`}
                  </option>
                ))}
              </Select>
              <Select label="Área" value={areaId} onChange={(e) => setAreaId(e.target.value)}>
                <option value="">Todas</option>
                {(areas.data ?? []).map((a) => (
                  <option key={a._id} value={a._id}>
                    {a.nombre}
                  </option>
                ))}
              </Select>
              <Select label="Grado" value={gradoId} onChange={(e) => setGradoId(e.target.value)}>
                <option value="">Todos</option>
                {(grados.data ?? []).map((g) => (
                  <option key={g._id} value={g._id}>
                    {g.nombre}
                  </option>
                ))}
              </Select>
              <Select label="Estado" value={estado} onChange={(e) => setEstado(e.target.value as EstadoPlanVista | '')}>
                <option value="">Todos</option>
                <option value="SIN_CARGAR">{NOMBRES_ESTADO_PLAN.SIN_CARGAR}</option>
                {ESTADOS_PLAN.map((e2) => (
                  <option key={e2} value={e2}>
                    {NOMBRES_ESTADO_PLAN[e2]}
                  </option>
                ))}
              </Select>
            </div>
          </Card>

          {resumen && (
            <div className="flex flex-wrap gap-2">
              <Chip tone="blue">Esperados: {resumen.esperados}</Chip>
              <Chip tone="neutral">Sin cargar: {resumen.sin_cargar}</Chip>
              <Chip tone="orange">En revisión: {resumen.en_revision}</Chip>
              <Chip tone="green">Aprobados: {resumen.aprobados}</Chip>
              <Chip tone="red">Devueltos: {resumen.devueltos}</Chip>
              <Chip tone="red">Fuera de plazo: {resumen.fuera_de_plazo}</Chip>
              {resumen.archivados > 0 && <Chip tone="neutral">Archivados: {resumen.archivados}</Chip>}
            </div>
          )}

          {bandeja.isLoading && <Spinner label="Cargando la cobertura..." />}
          {bandeja.isError && <Alert tone="error">{errorMessage(bandeja.error)}</Alert>}

          <Table>
            <TableHead>
              <Th>Docente</Th>
              <Th>Asignatura y grado</Th>
              <Th>Periodo y entrega</Th>
              <Th>Estado</Th>
              <Th className="text-right">Acciones</Th>
            </TableHead>
            <TableBody>
              {!bandeja.isLoading && (bandeja.data?.filas ?? []).length === 0 && (
                <EmptyRow colSpan={5}>No hay planes de aula que coincidan con los filtros. Los esperados salen de la carga académica de los docentes.</EmptyRow>
              )}
              {(bandeja.data?.filas ?? []).map((fila) => (
                <tr key={fila.clave} className={fila.archivado ? 'bg-soft/60' : ''}>
                  <Td>
                    <p className="font-semibold text-ink">{nombreDePersona(fila.docente)}</p>
                    {fila.archivado && <Chip tone="neutral">Archivado: ya no dicta esta asignatura</Chip>}
                  </Td>
                  <Td>
                    <p className="font-medium text-ink">
                      {fila.asignatura.nombre} · {fila.grado.nombre}
                    </p>
                    <p className="text-xs text-muted">
                      {fila.area.nombre}
                      {fila.grupos.length > 0 ? ` · grupos ${fila.grupos.join(', ')}` : ''}
                    </p>
                  </Td>
                  <Td>
                    <p className="font-medium text-ink">{fila.periodo_nombre}</p>
                    {fila.ventana && (
                      <div className="mt-0.5 space-y-1">
                        <p className="text-xs text-muted">{textoVentana(fila.ventana)}</p>
                        {fila.ventana.estado && fila.estado === 'SIN_CARGAR' && <EstadoVentanaBadge value={fila.ventana.estado} />}
                      </div>
                    )}
                  </Td>
                  <Td>
                    <div className="flex flex-wrap items-center gap-1.5">
                      <EstadoPlanBadge value={fila.estado} />
                      {fila.plan?.radicacion.fuera_de_plazo && <FueraDePlazoChip fecha={fila.plan.radicacion.fecha} />}
                      {fila.plan?.origen === 'ADOPTADA' && <Chip tone="green">Adoptado</Chip>}
                    </div>
                    {fila.plan && (
                      <p className="mt-1 text-xs text-muted">
                        {fila.plan.radicado_en ? formatoFechaHora(fila.plan.radicado_en) : ''} · versión {fila.plan.version_actual}
                      </p>
                    )}
                  </Td>
                  <Td className="text-right">
                    {fila.plan && (
                      <IconButton
                        tone={fila.puede.revisar ? 'success' : 'edit'}
                        label={fila.puede.revisar ? 'Revisar plan' : 'Ver plan'}
                        icon={<EyeIcon />}
                        onClick={() => setViendo({ tipo: 'AULA', id: fila.plan!._id })}
                      />
                    )}
                  </Td>
                </tr>
              ))}
            </TableBody>
          </Table>
        </div>
      </TabPanel>

      <DetallePlanDrawer tipo={viendo?.tipo ?? 'AULA'} id={viendo?.id ?? null} onClose={() => setViendo(null)} />
    </div>
  );
}
