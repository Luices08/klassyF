import { type ComponentType, type SVGProps, useMemo } from 'react';
import { AccesosRapidos, type AccesoRapido } from '../../components/dashboard/AccesosRapidos';
import { AvisosDelInicio } from '../../components/dashboard/AvisosDelInicio';
import { FilaBienvenida } from '../../components/dashboard/FilaAdaptable';
import { TarjetaBienvenida } from '../../components/dashboard/TarjetaBienvenida';
import { MosaicoNoticiasInicio } from '../../components/noticias/MosaicoNoticiasInicio';
import { BookIcon, CheckCircleIcon, ClipboardListIcon, ClockIcon, FileTextIcon, GraduationCapIcon, UsersIcon } from '../../components/ui/icons';
import { useAuth } from '../../context/AuthContext';
import { useMiMatricula } from '../../hooks/useEnrollments';
import { contadorDeRuta, useResumenNotificaciones } from '../../hooks/useNotificaciones';
import { useMyTeacherLoad } from '../../hooks/useTeacherAssignments';

type Icono = ComponentType<SVGProps<SVGSVGElement>>;

/**
 * El inicio de docentes y estudiantes: la bienvenida con un mensaje según el perfil, los accesos a lo que más usan, los avisos y las noticias. El escudo y el nombre
 * del colegio están en la barra superior, así que aquí no se repiten. Solo lee: cada dato sale de lo que ya existe.
 */
export function DashboardPersonaPage() {
  const { user } = useAuth();
  const { data: resumen } = useResumenNotificaciones();
  const esDocente = user?.rol === 'DOCENTE';
  const carga = useMyTeacherLoad(undefined);
  const matricula = useMiMatricula(user?.rol === 'ESTUDIANTE');

  const contador = (ruta: string) => contadorDeRuta(resumen, ruta);

  // El docente: su carga del año en curso (clases y grupos); sin carga asignada no se dibuja la ficha.
  const fichaDocente = useMemo(() => {
    const clases = (carga.data ?? []).filter((a) => a.tipo_asignacion === 'CLASE');
    if (clases.length === 0) return null;
    const grupos = new Set(clases.map((a) => (typeof a.group_id === 'object' && a.group_id ? a.group_id._id : String(a.group_id ?? ''))));
    return { icono: UsersIcon as Icono, texto: `${clases.length} ${clases.length === 1 ? 'clase' : 'clases'} · ${grupos.size} ${grupos.size === 1 ? 'grupo' : 'grupos'}` };
  }, [carga.data]);

  if (!user) return null;
  const nombre = `${user.nombre} ${user.apellido}`;

  // Los atajos son lo que cada perfil abre todos los días; el resto del sistema está en el menú.
  const accesosDocente: AccesoRapido[] = [
    { etiqueta: 'Tomar asistencia', descripcion: 'Registra la lista de tus clases', icono: CheckCircleIcon, tono: 'green', to: '/docente/asistencia', contador: contador('/docente/asistencia') },
    { etiqueta: 'Planilla de notas', descripcion: 'Califica y cierra tus periodos', icono: FileTextIcon, tono: 'blue', to: '/docente/notas', contador: contador('/docente/notas') },
    { etiqueta: 'Actividades y tareas', descripcion: 'Programa y revisa entregas', icono: ClipboardListIcon, tono: 'orange', to: '/docente/actividades', contador: contador('/docente/actividades') },
  ];
  const accesosEstudiante: AccesoRapido[] = [
    { etiqueta: 'Mis actividades', descripcion: 'Tareas y entregas pendientes', icono: ClipboardListIcon, tono: 'blue', to: '/mis-actividades', contador: contador('/mis-actividades') },
    { etiqueta: 'Mis notas', descripcion: 'Tus calificaciones por periodo', icono: BookIcon, tono: 'green', to: '/mis-notas', contador: contador('/mis-notas') },
    { etiqueta: 'Mi horario', descripcion: 'Consulta tus clases', icono: ClockIcon, tono: 'orange', to: '/mi-horario' },
  ];

  const texto = esDocente
    ? 'Gracias por acompañar el aprendizaje de tus estudiantes. Desde aquí llegas rápido a lo que más usas: asistencia, notas y actividades.'
    : '¡Qué bueno verte de nuevo en Klassy! Revisa tus actividades pendientes y sigue alcanzando tus metas.';
  const ficha = esDocente ? fichaDocente : matricula.data ? { icono: GraduationCapIcon as Icono, texto: `${matricula.data.grado} · Grupo ${matricula.data.grupo}` } : null;

  return (
    <div className="space-y-4">
      <FilaBienvenida
        bienvenida={<TarjetaBienvenida nombre={nombre} texto={texto} ficha={ficha} />}
        accesos={<AccesosRapidos vertical titulo="Accesos rápidos" accesos={esDocente ? accesosDocente : accesosEstudiante} />}
      />
      <AvisosDelInicio />
      <MosaicoNoticiasInicio />
    </div>
  );
}
