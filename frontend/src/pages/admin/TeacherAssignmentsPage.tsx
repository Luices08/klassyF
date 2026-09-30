import { type FormEvent, useState } from 'react';
import { Alert, errorMessage } from '../../components/ui/Alert';
import { Chip } from '../../components/ui/Badge';
import { Button } from '../../components/ui/Button';
import { Card, CardHeader } from '../../components/ui/Card';
import { Drawer } from '../../components/ui/Drawer';
import { Input, Select } from '../../components/ui/Field';
import { IconButton } from '../../components/ui/IconButton';
import { PageHeader } from '../../components/ui/PageHeader';
import { Spinner } from '../../components/ui/Spinner';
import { EmptyRow, Table, TableBody, TableHead, Td, Th } from '../../components/ui/Table';
import { Tabs } from '../../components/ui/Tabs';
import { AlertTriangleIcon, CheckCircleIcon, PlusIcon, TrashIcon, UsersIcon } from '../../components/ui/icons';
import { useAnioDeTrabajo } from '../../hooks/useAniosLectivos';
import { useSubjects } from '../../hooks/useCatalogoAcademico';
import { useGroups } from '../../hooks/useGroups';
import {
  type CrearTeacherAssignmentInput,
  useCrearTeacherAssignment,
  useDocentesCargaResumen,
  useEliminarTeacherAssignment,
  useTeacherAssignments,
} from '../../hooks/useTeacherAssignments';
import { useUsers } from '../../hooks/useUsers';
import type { TeacherAssignment, TipoAsignacionDocente } from '../../types/domain';

const TIPO_LABELS: Record<TipoAsignacionDocente, string> = {
  CLASE: 'Clase Regular',
  DIRECCION_GRUPO: 'Dirección de Grupo',
  PROYECTO_TRANSVERSAL: 'Proyecto Pedagógico',
  OTRO: 'Otra Asignación',
};

const FORM_VACIO: {
  docente_id: string;
  tipo_asignacion: TipoAsignacionDocente;
  group_id: string;
  subject_id: string;
  horas_semanales: number;
  proyecto_nombre: string;
  observaciones: string;
} = {
  docente_id: '',
  tipo_asignacion: 'CLASE',
  group_id: '',
  subject_id: '',
  horas_semanales: 4,
  proyecto_nombre: '',
  observaciones: '',
};

export function TeacherAssignmentsPage() {
  const { anio, anios } = useAnioDeTrabajo();
  const [selectedAnioId, setSelectedAnioId] = useState<string>('');
  const anioActivoId = selectedAnioId || anio?._id || '';

  const [tabActiva, setTabActiva] = useState<string>('resumen');
  const [filtroDocente, setFiltroDocente] = useState<string>('');
  const [filtroTipo, setFiltroTipo] = useState<string>('');

  // Modales y formularios
  const [drawerAbierto, setDrawerAbierto] = useState(false);
  const [form, setForm] = useState(FORM_VACIO);
  const [formError, setFormError] = useState<string | null>(null);

  // Queries
  const { data: docentesResumen = [], isLoading: cargandoResumen } = useDocentesCargaResumen(anioActivoId);
  const { data: asignaciones = [], isLoading: cargandoAsignaciones } = useTeacherAssignments({
    academic_year_id: anioActivoId,
    docente_id: filtroDocente || undefined,
    tipo_asignacion: (filtroTipo as TipoAsignacionDocente) || undefined,
  });

  const { data: docentes = [] } = useUsers({ rol: 'DOCENTE', estado: 'activo' });
  const { data: grupos = [] } = useGroups({ academic_year_id: anioActivoId });
  const { data: asignaturas = [] } = useSubjects({ estado: 'activo' });

  // Mutaciones
  const crearMutation = useCrearTeacherAssignment();
  const eliminarMutation = useEliminarTeacherAssignment();

  // Métricas de diagnóstico
  const totalDocentes = docentesResumen.length;
  const horasTotales = docentesResumen.reduce((acc, d) => acc + d.horas_totales, 0);
  const sobrecargaCount = docentesResumen.filter((d) => d.estado_carga === 'SOBRE_CARGA').length;
  const subcargaCount = docentesResumen.filter((d) => d.estado_carga === 'SUB_CARGA' && d.horas_totales > 0).length;

  const handleOpenDrawer = () => {
    setForm(FORM_VACIO);
    setFormError(null);
    setDrawerAbierto(true);
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setFormError(null);

    if (!form.docente_id) {
      setFormError('Debe seleccionar un docente.');
      return;
    }

    if (form.tipo_asignacion === 'CLASE') {
      if (!form.group_id) {
        setFormError('Debe seleccionar un grupo para la clase.');
        return;
      }
      if (!form.subject_id) {
        setFormError('Debe seleccionar una asignatura.');
        return;
      }
    } else if (form.tipo_asignacion === 'DIRECCION_GRUPO') {
      if (!form.group_id) {
        setFormError('Debe seleccionar un grupo para la dirección de grupo.');
        return;
      }
    } else if (form.tipo_asignacion === 'PROYECTO_TRANSVERSAL') {
      if (!form.proyecto_nombre.trim()) {
        setFormError('Debe indicar el nombre del proyecto o comité institucional.');
        return;
      }
    }

    if (form.horas_semanales < 1) {
      setFormError('Las horas semanales deben ser al menos 1.');
      return;
    }

    const payload: CrearTeacherAssignmentInput = {
      docente_id: form.docente_id,
      academic_year_id: anioActivoId,
      tipo_asignacion: form.tipo_asignacion,
      group_id: form.group_id || null,
      subject_id: form.subject_id || null,
      horas_semanales: form.horas_semanales,
      proyecto_nombre: form.proyecto_nombre.trim() || undefined,
      observaciones: form.observaciones.trim() || undefined,
    };

    try {
      await crearMutation.mutateAsync(payload);
      setDrawerAbierto(false);
    } catch (err) {
      setFormError(errorMessage(err));
    }
  };

  const handleEliminar = async (asg: TeacherAssignment) => {
    const confirmacion = window.confirm(
      '¿Está seguro de eliminar esta asignación académica? Si tenía una planeación curricular en borrador, también se retirará.'
    );
    if (!confirmacion) return;

    try {
      await eliminarMutation.mutateAsync(asg._id);
    } catch (err) {
      alert(errorMessage(err));
    }
  };

  return (
    <div className="space-y-4">
      <PageHeader
        title="Carga Académica Docente"
        subtitle="Distribución horaria institucional, dirección de grupo y asignación de materias (Decreto 1850)."
        action={
          <Button variant="primary" onClick={handleOpenDrawer} disabled={!anioActivoId}>
            <PlusIcon className="h-4 w-4 mr-1.5" />
            Nueva Asignación
          </Button>
        }
      />

      {/* Barra de contexto y selección de año lectivo */}
      <Card>
        <div className="p-4 flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-3 w-full sm:w-auto">
            <Select
              label="Año de trabajo"
              value={anioActivoId}
              onChange={(e) => setSelectedAnioId(e.target.value)}
              className="min-w-[200px]"
            >
              {anios.map((a) => (
                <option key={a._id} value={a._id}>
                  {a.year} ({a.calendario}) — {a.estado}
                </option>
              ))}
            </Select>
          </div>

          <div className="w-full sm:w-auto">
            <Tabs
              items={[
                { key: 'resumen', label: 'Diagnóstico y Carga Docente' },
                { key: 'asignaciones', label: `Detalle de Asignaciones (${asignaciones.length})` },
              ]}
              active={tabActiva}
              onChange={setTabActiva}
            />
          </div>
        </div>
      </Card>

      {/* Diagnóstico rápido de horas */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-4">
        <Card>
          <div className="p-4">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-muted uppercase">Docentes</span>
              <UsersIcon className="h-4 w-4 text-primary" />
            </div>
            <p className="mt-2 text-h2 text-ink">{totalDocentes}</p>
            <span className="text-xs text-muted">Planta activa en el año</span>
          </div>
        </Card>

        <Card>
          <div className="p-4">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-muted uppercase">Horas Asignadas</span>
              <CheckCircleIcon className="h-4 w-4 text-success" />
            </div>
            <p className="mt-2 text-h2 text-ink">{horasTotales} h</p>
            <span className="text-xs text-muted">Carga total semanal</span>
          </div>
        </Card>

        <Card>
          <div className="p-4">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-muted uppercase">Sobrecarga (&gt;24h)</span>
              <AlertTriangleIcon className="h-4 w-4 text-danger" />
            </div>
            <p className="mt-2 text-h2 text-danger">{sobrecargaCount}</p>
            <span className="text-xs text-muted">Exceden tope lectivo sugerido</span>
          </div>
        </Card>

        <Card>
          <div className="p-4">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-muted uppercase">Subcarga (&lt;20h)</span>
              <AlertTriangleIcon className="h-4 w-4 text-warning" />
            </div>
            <p className="mt-2 text-h2 text-warning">{subcargaCount}</p>
            <span className="text-xs text-muted">Disponibilidad de horas</span>
          </div>
        </Card>
      </div>

      {/* Pestaña 1: Resumen por Docente */}
      {tabActiva === 'resumen' && (
        <Card>
          <CardHeader
            title="Semáforo de Carga y Horas Semanales"
            subtitle="Decreto 1850: 22h lectivas regular en básica/media y 20h en preescolar/primaria."
          />
          {cargandoResumen ? (
            <div className="flex justify-center p-8">
              <Spinner />
            </div>
          ) : (
            <Table>
              <TableHead>
                <tr>
                  <Th>Docente</Th>
                  <Th>Identificación</Th>
                  <Th className="text-center">Clases</Th>
                  <Th className="text-center">Dirección</Th>
                  <Th className="text-center">Proyectos</Th>
                  <Th className="text-center">Total Horas</Th>
                  <Th>Diagnóstico</Th>
                  <Th className="text-center">Asignaciones</Th>
                </tr>
              </TableHead>
              <TableBody>
                {docentesResumen.length === 0 ? (
                  <EmptyRow colSpan={8}>No hay docentes registrados en la institución.</EmptyRow>
                ) : (
                  docentesResumen.map((item) => (
                    <tr key={item.docente._id} className="hover:bg-soft/40 transition-colors">
                      <Td className="font-semibold text-ink">
                        {item.docente.apellido}, {item.docente.nombre}
                      </Td>
                      <Td className="text-body text-xs">{item.docente.numero_documento}</Td>
                      <Td className="text-center font-medium text-body">{item.horas_clase} h</Td>
                      <Td className="text-center font-medium text-body">{item.horas_direccion} h</Td>
                      <Td className="text-center font-medium text-body">{item.horas_proyectos} h</Td>
                      <Td className="text-center font-bold text-ink">{item.horas_totales} h</Td>
                      <Td>
                        {item.estado_carga === 'NORMAL' && (
                          <Chip tone="green">Normal ({item.horas_totales}h)</Chip>
                        )}
                        {item.estado_carga === 'SOBRE_CARGA' && (
                          <Chip tone="red">Sobrecarga ({item.horas_totales}h)</Chip>
                        )}
                        {item.estado_carga === 'SUB_CARGA' && (
                          <Chip tone="orange">Subcarga ({item.horas_totales}h)</Chip>
                        )}
                      </Td>
                      <Td className="text-center text-body">{item.total_asignaciones}</Td>
                    </tr>
                  ))
                )}
              </TableBody>
            </Table>
          )}
        </Card>
      )}

      {/* Pestaña 2: Detalle de Asignaciones */}
      {tabActiva === 'asignaciones' && (
        <Card>
          <div className="p-4 border-b border-border flex flex-col sm:flex-row gap-3">
            <Select
              label="Filtrar por docente"
              value={filtroDocente}
              onChange={(e) => setFiltroDocente(e.target.value)}
              className="max-w-xs"
            >
              <option value="">Todos los docentes</option>
              {docentes.map((d) => (
                <option key={d._id} value={d._id}>
                  {d.apellido}, {d.nombre}
                </option>
              ))}
            </Select>

            <Select
              label="Filtrar por tipo"
              value={filtroTipo}
              onChange={(e) => setFiltroTipo(e.target.value)}
              className="max-w-xs"
            >
              <option value="">Todos los tipos</option>
              <option value="CLASE">Clase regular</option>
              <option value="DIRECCION_GRUPO">Dirección de grupo</option>
              <option value="PROYECTO_TRANSVERSAL">Proyecto pedagógico</option>
            </Select>
          </div>

          {cargandoAsignaciones ? (
            <div className="flex justify-center p-8">
              <Spinner />
            </div>
          ) : (
            <Table>
              <TableHead>
                <tr>
                  <Th>Tipo</Th>
                  <Th>Docente</Th>
                  <Th>Grupo / Curso</Th>
                  <Th>Asignatura / Proyecto</Th>
                  <Th className="text-center">Horas/Sem</Th>
                  <Th>Observaciones</Th>
                  <Th className="text-right">Acciones</Th>
                </tr>
              </TableHead>
              <TableBody>
                {asignaciones.length === 0 ? (
                  <EmptyRow colSpan={7}>No hay asignaciones académicas registradas con estos filtros.</EmptyRow>
                ) : (
                  asignaciones.map((asg) => {
                    const doc = typeof asg.docente_id === 'object' ? asg.docente_id : null;
                    const grp = typeof asg.group_id === 'object' ? asg.group_id : null;
                    const sub = typeof asg.subject_id === 'object' ? asg.subject_id : null;
                    const grado = grp && typeof grp.grade_id === 'object' ? grp.grade_id : null;

                    return (
                      <tr key={asg._id} className="hover:bg-soft/40 transition-colors">
                        <Td>
                          <Chip
                            tone={
                              asg.tipo_asignacion === 'CLASE'
                                ? 'blue'
                                : asg.tipo_asignacion === 'DIRECCION_GRUPO'
                                ? 'green'
                                : 'orange'
                            }
                          >
                            {TIPO_LABELS[asg.tipo_asignacion]}
                          </Chip>
                        </Td>
                        <Td className="font-medium text-ink">
                          {doc ? `${doc.apellido}, ${doc.nombre}` : '—'}
                        </Td>
                        <Td className="text-body">
                          {grp ? (
                            <span>
                              <strong>{grp.nomenclatura}</strong>
                              {grado ? ` (${grado.nombre})` : ''}
                            </span>
                          ) : (
                            <span className="text-muted italic">Institucional</span>
                          )}
                        </Td>
                        <Td className="text-body font-medium">
                          {asg.tipo_asignacion === 'CLASE'
                            ? sub
                              ? `${sub.nombre} (${sub.abreviatura})`
                              : '—'
                            : asg.proyecto_nombre || 'Dirección de curso'}
                        </Td>
                        <Td className="text-center font-bold text-ink">{asg.horas_semanales} h</Td>
                        <Td className="text-xs text-muted max-w-xs truncate">{asg.observaciones || '—'}</Td>
                        <Td className="text-right">
                          <IconButton
                            tone="danger"
                            label="Eliminar asignación"
                            icon={<TrashIcon />}
                            onClick={() => handleEliminar(asg)}
                          />
                        </Td>
                      </tr>
                    );
                  })
                )}
              </TableBody>
            </Table>
          )}
        </Card>
      )}

      {/* Drawer: Formulario de Nueva Asignación */}
      <Drawer
        open={drawerAbierto}
        onClose={() => setDrawerAbierto(false)}
        title="Nueva Asignación Académica"
        size="lg"
      >
        <form onSubmit={handleSubmit} className="space-y-4">
          {formError && <Alert tone="error">{formError}</Alert>}

          <Select
            label="Docente Titular *"
            value={form.docente_id}
            onChange={(e) => setForm({ ...form, docente_id: e.target.value })}
            required
          >
            <option value="">Seleccione un docente...</option>
            {docentes.map((d) => (
              <option key={d._id} value={d._id}>
                {d.apellido}, {d.nombre} ({d.numero_documento})
              </option>
            ))}
          </Select>

          <Select
            label="Tipo de Asignación *"
            value={form.tipo_asignacion}
            onChange={(e) =>
              setForm({
                ...form,
                tipo_asignacion: e.target.value as TipoAsignacionDocente,
                horas_semanales: e.target.value === 'DIRECCION_GRUPO' ? 2 : 4,
              })
            }
          >
            <option value="CLASE">Clase Regular (Asignatura en Grupo)</option>
            <option value="DIRECCION_GRUPO">Dirección de Grupo (Titularidad)</option>
            <option value="PROYECTO_TRANSVERSAL">Proyecto Pedagógico Transversal / Comité</option>
          </Select>

          {/* Campos para Clase Regular */}
          {form.tipo_asignacion === 'CLASE' && (
            <>
              <Select
                label="Grupo *"
                value={form.group_id}
                onChange={(e) => setForm({ ...form, group_id: e.target.value })}
                required
              >
                <option value="">Seleccione el grupo...</option>
                {grupos.map((g) => (
                  <option key={g._id} value={g._id}>
                    Grupo {g.nomenclatura}
                  </option>
                ))}
              </Select>

              <Select
                label="Asignatura *"
                value={form.subject_id}
                onChange={(e) => setForm({ ...form, subject_id: e.target.value })}
                required
              >
                <option value="">Seleccione la asignatura...</option>
                {asignaturas.map((s) => (
                  <option key={s._id} value={s._id}>
                    {s.nombre} ({s.abreviatura})
                  </option>
                ))}
              </Select>
            </>
          )}

          {/* Campos para Dirección de Grupo */}
          {form.tipo_asignacion === 'DIRECCION_GRUPO' && (
            <Select
              label="Grupo a Dirigir *"
              value={form.group_id}
              onChange={(e) => setForm({ ...form, group_id: e.target.value })}
              required
            >
              <option value="">Seleccione el grupo...</option>
              {grupos.map((g) => (
                <option key={g._id} value={g._id}>
                  Grupo {g.nomenclatura}
                </option>
              ))}
            </Select>
          )}

          {/* Campos para Proyectos Transversales */}
          {form.tipo_asignacion === 'PROYECTO_TRANSVERSAL' && (
            <Input
              label="Nombre del Proyecto / Comité *"
              type="text"
              placeholder="Ej. Líder PRAE, Comité de Convivencia, PESCC"
              value={form.proyecto_nombre}
              onChange={(e) => setForm({ ...form, proyecto_nombre: e.target.value })}
              required
            />
          )}

          <Input
            label="Horas Semanales *"
            type="number"
            min={1}
            max={40}
            value={form.horas_semanales}
            onChange={(e) => setForm({ ...form, horas_semanales: Number(e.target.value) })}
            hint="Intensidad horaria efectiva por semana que se computa en la carga docente."
            required
          />

          <Input
            label="Observaciones (opcional)"
            type="text"
            placeholder="Detalles adicionales sobre la asignación"
            value={form.observaciones}
            onChange={(e) => setForm({ ...form, observaciones: e.target.value })}
          />

          <div className="pt-4 flex justify-end gap-3 border-t border-border">
            <Button variant="secondary" type="button" onClick={() => setDrawerAbierto(false)}>
              Cancelar
            </Button>
            <Button variant="primary" type="submit" disabled={crearMutation.isPending}>
              {crearMutation.isPending ? 'Guardando...' : 'Asignar Carga'}
            </Button>
          </div>
        </form>
      </Drawer>
    </div>
  );
}
