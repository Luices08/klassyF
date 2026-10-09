import { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { MallaHorario } from '../../components/horarios/MallaHorario';
import { Alert, errorMessage } from '../../components/ui/Alert';
import { Chip, CupoBadge, EstadoGrupoBadge, EstadoMatriculaBadge } from '../../components/ui/Badge';
import { Button } from '../../components/ui/Button';
import { Card, CardHeader } from '../../components/ui/Card';
import { PageHeader } from '../../components/ui/PageHeader';
import { ProgressBar } from '../../components/ui/ProgressBar';
import { Spinner } from '../../components/ui/Spinner';
import { EmptyRow, Table, TableBody, TableHead, Td, Th } from '../../components/ui/Table';
import { TabPanel, Tabs } from '../../components/ui/Tabs';
import { ArrowLeftIcon } from '../../components/ui/icons';
import { type FichaGrupo, useFichaGrupo, useHorarioDeGrupo } from '../../hooks/useGrupoFicha';

const SIN_CONFLICTOS = new Set<string>();

/** Dónde se modifica cada dato: la ficha solo consulta y manda al módulo dueño, con el contexto ya elegido. */
function rutasDeOrigen(f: FichaGrupo) {
  const anio = f.grupo.anio?._id;
  const cargaAcademica = (extra: Record<string, string | undefined>) => {
    const params = new URLSearchParams();
    if (anio) params.set('anio', anio);
    for (const [clave, valor] of Object.entries(extra)) if (valor) params.set(clave, valor);
    return `/admin/teacher-assignments?${params.toString()}`;
  };
  return {
    espacios: () => {
      const params = new URLSearchParams();
      if (f.grupo.sede) params.set('sede', f.grupo.sede._id);
      if (f.aula) params.set('espacio', f.aula._id);
      return `/admin/espacios?${params.toString()}`;
    },
    cargaDelDocente: (docenteId: string) => cargaAcademica({ docente: docenteId }),
    asignarAsignatura: (subjectId: string) => cargaAcademica({ grupo: f.grupo._id, grado: f.grupo.grado?._id, asignatura: subjectId }),
    asignarDirector: () => cargaAcademica({ tipo: 'DIRECCION_GRUPO', grupo: f.grupo._id, grado: f.grupo.grado?._id }),
    horarios: () => {
      const params = new URLSearchParams({ pestana: 'versiones' });
      if (anio) params.set('anio', anio);
      if (f.grupo.sede) params.set('sede', f.grupo.sede._id);
      if (f.grupo.jornada) params.set('jornada', f.grupo.jornada._id);
      return `/admin/horarios?${params.toString()}`;
    },
    estudiante: (estudianteId: string) => `/admin/students/${estudianteId}`,
  };
}

function Dato({ etiqueta, children }: { etiqueta: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="text-xs font-medium uppercase tracking-wide text-muted">{etiqueta}</p>
      <div className="mt-1 text-ink">{children}</div>
    </div>
  );
}

/**
 * Ficha 360° de un grupo (M01): el resumen del curso y, en pestañas, sus estudiantes (M03/M04), su plan de estudios con
 * los docentes (M06/M08) y su horario (M09). Es solo consulta: cada botón lleva al módulo donde ese dato se modifica.
 */
export function GrupoFichaPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { data: ficha, isLoading, isError, error } = useFichaGrupo(id);
  const [pestana, setPestana] = useState('estudiantes');
  const horario = useHorarioDeGrupo(id, pestana === 'horario');

  if (isLoading) {
    return (
      <div className="flex justify-center p-12">
        <Spinner />
      </div>
    );
  }
  if (isError || !ficha) {
    return (
      <div className="space-y-4">
        <Alert tone="error">{errorMessage(error)}</Alert>
        <Button type="button" variant="secondary" onClick={() => navigate('/admin/groups')}>
          <ArrowLeftIcon className="h-4 w-4" />
          Volver a grupos
        </Button>
      </div>
    );
  }

  const { grupo, aula, director } = ficha;
  const origen = rutasDeOrigen(ficha);
  const sinDocente = ficha.asignaturas.filter((a) => !a.docente).length;

  return (
    <div className="space-y-4">
      <PageHeader
        title={`Grupo ${grupo.nomenclatura}${grupo.grado ? ` · ${grupo.grado.nombre}` : ''}`}
        subtitle={`${grupo.anio?.nombre ?? 'Año lectivo'} · ${grupo.sede?.nombre ?? 'Sede'} · ficha de consulta: cada dato se modifica en su módulo.`}
        action={
          <Button type="button" variant="secondary" onClick={() => navigate('/admin/groups')}>
            <ArrowLeftIcon className="h-4 w-4" />
            Volver a grupos
          </Button>
        }
      />

      <Card>
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-5">
          <Dato etiqueta="Grado">
            <span className="font-semibold">{grupo.grado?.nombre ?? '—'}</span>
            {grupo.grado && <span className="block text-xs text-muted">{grupo.grado.nivel}</span>}
          </Dato>
          <Dato etiqueta="Jornada">
            <Chip tone="blue">{grupo.jornada?.nombre ?? '—'}</Chip>
            {grupo.jornada && (
              <span className="block text-xs text-muted">
                {grupo.jornada.hora_inicio} – {grupo.jornada.hora_fin}
              </span>
            )}
          </Dato>
          <Dato etiqueta="Sede">
            <span className="font-semibold">{grupo.sede?.nombre ?? '—'}</span>
          </Dato>
          <Dato etiqueta="Cupos">
            <CupoBadge ocupados={grupo.cupos_ocupados} max={grupo.max_capacity} />
            <div className="mt-1.5">
              <ProgressBar
                value={grupo.cupos_ocupados}
                max={grupo.max_capacity}
                tone={grupo.cupos_ocupados >= grupo.max_capacity ? 'red' : grupo.cupos_ocupados / grupo.max_capacity >= 0.8 ? 'orange' : 'green'}
                label="Cupos ocupados"
              />
            </div>
          </Dato>
          <Dato etiqueta="Estado">
            <EstadoGrupoBadge value={grupo.estado} />
          </Dato>
        </div>
      </Card>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader title="Aula base" subtitle="Espacios y aulas (M10)" />
          {aula ? (
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="font-semibold text-ink">{aula.nombre}</p>
                <p className="text-sm text-muted">
                  Capacidad {aula.capacidad}
                  {aula.piso_bloque ? ` · ${aula.piso_bloque}` : ''}
                </p>
                <div className="mt-1.5 flex flex-wrap gap-1.5">
                  {aula.excede_aforo && <Chip tone="red">El cupo del grupo excede el aforo</Chip>}
                  {aula.estado !== 'DISPONIBLE' && <Chip tone="orange">{aula.estado}</Chip>}
                </div>
              </div>
              <Button type="button" variant="outline" onClick={() => navigate(origen.espacios())}>
                Ver en Espacios y aulas
              </Button>
            </div>
          ) : (
            <div className="flex flex-wrap items-center justify-between gap-3">
              <Chip tone="neutral">{ficha.usa_espacios ? 'Sin salón asignado' : 'Modalidad virtual'}</Chip>
              {ficha.usa_espacios && (
                <Button type="button" variant="outline" onClick={() => navigate(origen.espacios())}>
                  Ir a Espacios y aulas
                </Button>
              )}
            </div>
          )}
        </Card>

        <Card>
          <CardHeader title="Director de grupo" subtitle="Carga académica (M08)" />
          {director ? (
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="font-semibold text-ink">
                  {director.docente.nombre} {director.docente.apellido}
                </p>
                <p className="text-sm text-muted">Documento {director.docente.numero_documento}</p>
                {director.teacher_assignment_id === null && (
                  <p className="mt-1 text-xs text-warning">Figura en el grupo pero sin dirección de grupo registrada en Carga académica.</p>
                )}
              </div>
              <Button type="button" variant="outline" onClick={() => navigate(origen.cargaDelDocente(director.docente._id))}>
                Ver su carga académica
              </Button>
            </div>
          ) : (
            <div className="flex flex-wrap items-center justify-between gap-3">
              <Chip tone="orange">Sin director asignado</Chip>
              <Button type="button" onClick={() => navigate(origen.asignarDirector())}>
                Asignar director
              </Button>
            </div>
          )}
        </Card>
      </div>

      <Tabs
        items={[
          { key: 'estudiantes', label: `Estudiantes (${ficha.estudiantes.length})` },
          { key: 'asignaturas', label: `Asignaturas y docentes (${ficha.asignaturas.length})` },
          { key: 'horario', label: 'Horario' },
        ]}
        active={pestana}
        onChange={setPestana}
      />

      <TabPanel active={pestana} tabKey="estudiantes">
        <Table>
          <TableHead>
            <Th>#</Th>
            <Th>Documento</Th>
            <Th>Estudiante</Th>
            <Th>Matrícula</Th>
            <Th>Ingreso</Th>
            <Th className="text-right">Expediente</Th>
          </TableHead>
          <TableBody>
            {ficha.estudiantes.length === 0 && <EmptyRow colSpan={6}>Este grupo aún no tiene estudiantes matriculados.</EmptyRow>}
            {ficha.estudiantes.map((m, i) => (
              <tr key={m.enrollment_id}>
                <Td className="text-muted">{i + 1}</Td>
                <Td>{m.estudiante.numero_documento}</Td>
                <Td className="font-medium text-ink">
                  {m.estudiante.apellido} {m.estudiante.nombre}
                </Td>
                <Td>
                  <EstadoMatriculaBadge value={m.estado} />
                </Td>
                <Td>
                  <Chip>{m.tipo_ingreso}</Chip>
                </Td>
                <Td className="text-right">
                  <Button type="button" variant="soft-edit" onClick={() => navigate(origen.estudiante(m.estudiante._id))}>
                    Ver hoja de vida
                  </Button>
                </Td>
              </tr>
            ))}
          </TableBody>
        </Table>
      </TabPanel>

      <TabPanel active={pestana} tabKey="asignaturas">
        <div className="space-y-3">
          {sinDocente > 0 && (
            <Alert tone="warning">
              {sinDocente} asignatura(s) del plan de estudios aún no tienen docente. Se asignan en Carga académica.
            </Alert>
          )}
          <Table>
            <TableHead>
              <Th>Área</Th>
              <Th>Asignatura</Th>
              <Th>Horas / semana</Th>
              <Th>Docente</Th>
              <Th className="text-right">Carga académica</Th>
            </TableHead>
            <TableBody>
              {ficha.asignaturas.length === 0 && (
                <EmptyRow colSpan={5}>El plan de estudios de este grado aún no tiene asignaturas para este año (se define en Plan de estudios).</EmptyRow>
              )}
              {ficha.asignaturas.map((a) => (
                <tr key={a.subject_id}>
                  <Td className="text-muted">{a.area?.nombre ?? '—'}</Td>
                  <Td>
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-medium text-ink">{a.nombre}</span>
                      {a.origen === 'GRUPO' && <Chip tone="blue">Solo este grupo</Chip>}
                    </div>
                  </Td>
                  <Td>
                    <span className="font-semibold">{a.horas_semanales}</span>
                    {a.horas_personalizadas && <span className="ml-1.5 text-xs text-muted">(ajustadas para el grupo)</span>}
                  </Td>
                  <Td>
                    {a.docente ? (
                      <span className="text-ink">
                        {a.docente.nombre} {a.docente.apellido}
                      </span>
                    ) : (
                      <Chip tone="orange">Sin docente</Chip>
                    )}
                  </Td>
                  <Td className="text-right">
                    {a.docente ? (
                      <Button type="button" variant="outline" onClick={() => navigate(origen.cargaDelDocente((a.docente as { _id: string })._id))}>
                        Ver carga del docente
                      </Button>
                    ) : (
                      <Button type="button" onClick={() => navigate(origen.asignarAsignatura(a.subject_id))}>
                        Asignar
                      </Button>
                    )}
                  </Td>
                </tr>
              ))}
              {ficha.asignaturas.length > 0 && (
                <tr className="bg-soft">
                  <Td className="font-semibold text-ink" colSpan={2}>
                    Total semanal
                  </Td>
                  <Td className="font-semibold text-ink" colSpan={3}>
                    {ficha.horas_semanales_total} horas
                  </Td>
                </tr>
              )}
            </TableBody>
          </Table>
        </div>
      </TabPanel>

      <TabPanel active={pestana} tabKey="horario">
        <div className="space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-2">
              {horario.data?.version && (
                <Chip tone={horario.data.es_borrador ? 'orange' : 'green'}>
                  Versión {horario.data.version.numero} · {horario.data.es_borrador ? 'borrador sin publicar' : 'publicada'}
                </Chip>
              )}
            </div>
            <Button type="button" variant="outline" onClick={() => navigate(origen.horarios())}>
              Ir al motor de horarios
            </Button>
          </div>

          {horario.isLoading && (
            <div className="flex justify-center p-8">
              <Spinner />
            </div>
          )}
          {horario.isError && <Alert tone="error">{errorMessage(horario.error)}</Alert>}
          {horario.data && !horario.data.version && (
            <Alert tone="info">Aún no se ha generado un horario para la jornada de este grupo. Se genera y publica en Horarios.</Alert>
          )}
          {horario.data?.version && !horario.data.malla && (
            <Alert tone="warning">
              El grupo no aparece en la versión {horario.data.version.numero} del horario: probablemente no tenía carga asignada cuando se generó.
            </Alert>
          )}
          {horario.data?.es_borrador && horario.data.malla && (
            <Alert tone="warning">Este horario es un borrador: todavía no está publicado, así que estudiantes y docentes aún no lo ven.</Alert>
          )}
          {horario.data?.malla && (
            <MallaHorario
              estructura={horario.data.malla.estructura}
              sesiones={horario.data.malla.horario.sesiones}
              catalogo={horario.data.malla.catalogo}
              vista="GRUPO"
              entidadId={grupo._id}
              enConflicto={SIN_CONFLICTOS}
            />
          )}
        </div>
      </TabPanel>
    </div>
  );
}
