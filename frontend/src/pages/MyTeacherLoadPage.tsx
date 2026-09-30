import { Card, CardHeader } from '../components/ui/Card';
import { Chip } from '../components/ui/Badge';
import { PageHeader } from '../components/ui/PageHeader';
import { Spinner } from '../components/ui/Spinner';
import { EmptyRow, Table, TableBody, TableHead, Td, Th } from '../components/ui/Table';
import { BookIcon, CheckCircleIcon, UsersIcon } from '../components/ui/icons';
import { useMyTeacherLoad } from '../hooks/useTeacherAssignments';
import type { TeacherAssignment, TipoAsignacionDocente } from '../types/domain';

const TIPO_LABELS: Record<TipoAsignacionDocente, string> = {
  CLASE: 'Clase Regular',
  DIRECCION_GRUPO: 'Dirección de Grupo',
  PROYECTO_TRANSVERSAL: 'Proyecto Pedagógico',
  OTRO: 'Otra Asignación',
};

export function MyTeacherLoadPage() {
  const { data: asignaciones = [], isLoading } = useMyTeacherLoad();

  const totalHoras = asignaciones.reduce((acc, a) => acc + (a.horas_semanales || 0), 0);
  const clasesCount = asignaciones.filter((a) => a.tipo_asignacion === 'CLASE').length;
  const direccionGrupo = asignaciones.find((a) => a.tipo_asignacion === 'DIRECCION_GRUPO');

  return (
    <div className="space-y-4">
      <PageHeader
        title="Mi Asignación y Carga Académica"
        subtitle="Asignaturas a cargo, grupos asignados y horas semanales aprobadas para la vigencia actual."
      />

      {/* Tarjetas resumen */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <Card>
          <div className="p-4">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-muted uppercase">Horas Semanales</span>
              <CheckCircleIcon className="h-4 w-4 text-primary" />
            </div>
            <p className="mt-2 text-h2 text-ink">{totalHoras} h</p>
            <span className="text-xs text-muted">Carga lectiva asignada</span>
          </div>
        </Card>

        <Card>
          <div className="p-4">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-muted uppercase">Cursos a Cargo</span>
              <BookIcon className="h-4 w-4 text-success" />
            </div>
            <p className="mt-2 text-h2 text-ink">{clasesCount}</p>
            <span className="text-xs text-muted">Grupos y materias</span>
          </div>
        </Card>

        <Card>
          <div className="p-4">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-muted uppercase">Dirección de Grupo</span>
              <UsersIcon className="h-4 w-4 text-warning" />
            </div>
            <p className="mt-2 text-h3 text-ink truncate">
              {direccionGrupo && typeof direccionGrupo.group_id === 'object' && direccionGrupo.group_id
                ? `Grupo ${direccionGrupo.group_id.nomenclatura}`
                : 'Sin titularidad'}
            </p>
            <span className="text-xs text-muted">Acompañamiento formativo</span>
          </div>
        </Card>
      </div>

      <Card>
        <CardHeader
          title="Mis Cursos y Responsabilidades"
          subtitle="Lista detallada de asignaturas y proyectos asignados por Coordinación Académica."
        />

        {isLoading ? (
          <div className="flex justify-center p-8">
            <Spinner />
          </div>
        ) : (
          <Table>
            <TableHead>
              <tr>
                <Th>Tipo</Th>
                <Th>Asignatura / Proyecto</Th>
                <Th>Grupo / Grado</Th>
                <Th>Sede / Jornada</Th>
                <Th className="text-center">Horas Semanales</Th>
                <Th>Observaciones</Th>
              </tr>
            </TableHead>
            <TableBody>
              {asignaciones.length === 0 ? (
                <EmptyRow colSpan={6}>No tienes asignaciones académicas registradas en este año lectivo.</EmptyRow>
              ) : (
                asignaciones.map((asg: TeacherAssignment) => {
                  const grp = typeof asg.group_id === 'object' ? asg.group_id : null;
                  const sub = typeof asg.subject_id === 'object' ? asg.subject_id : null;
                  const grado = grp && typeof grp.grade_id === 'object' ? grp.grade_id : null;
                  const sede = grp && typeof grp.sede_id === 'object' ? grp.sede_id : null;
                  const jornada = grp && typeof grp.jornada_id === 'object' ? grp.jornada_id : null;

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
                      <Td className="font-semibold text-ink">
                        {asg.tipo_asignacion === 'CLASE'
                          ? sub
                            ? `${sub.nombre} (${sub.abreviatura})`
                            : '—'
                          : asg.proyecto_nombre || 'Dirección de grupo'}
                      </Td>
                      <Td className="text-body">
                        {grp ? (
                          <span>
                            <strong>{grp.nomenclatura}</strong>
                            {grado ? ` · ${grado.nombre}` : ''}
                          </span>
                        ) : (
                          <span className="text-muted italic">Transversal</span>
                        )}
                      </Td>
                      <Td className="text-body text-xs">
                        {sede ? (
                          <span>
                            {sede.nombre}
                            {jornada ? ` · ${jornada.nombre}` : ''}
                          </span>
                        ) : (
                          '—'
                        )}
                      </Td>
                      <Td className="text-center font-bold text-ink">{asg.horas_semanales} h</Td>
                      <Td className="text-xs text-muted max-w-xs truncate">{asg.observaciones || '—'}</Td>
                    </tr>
                  );
                })
              )}
            </TableBody>
          </Table>
        )}
      </Card>
    </div>
  );
}
