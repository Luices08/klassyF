import { useState } from 'react';
import { AnuncioDrawer } from '../../components/anuncios/AnuncioDrawer';
import { AccesosRapidos, type AccesoRapido } from '../../components/dashboard/AccesosRapidos';
import { BarraFiltrosDashboard } from '../../components/dashboard/BarraFiltrosDashboard';
import { BloqueDashboard } from '../../components/dashboard/BloqueDashboard';
import { FilaPrincipal } from '../../components/dashboard/FilaAdaptable';
import { GraficaBarrasVerticales } from '../../components/dashboard/GraficaBarrasVerticales';
import { MatrizEficienciaCompacta } from '../../components/dashboard/MatrizEficienciaCompacta';
import { PanelComunicacion } from '../../components/dashboard/PanelComunicacion';
import { SeccionTodasLasPantallas } from '../../components/dashboard/SeccionTodasLasPantallas';
import { TarjetaIndicador } from '../../components/dashboard/TarjetaIndicador';
import type { NavItem } from '../../components/layout/navigation';
import { Alert, errorMessage } from '../../components/ui/Alert';
import { Card } from '../../components/ui/Card';
import { FiltrosRapidos } from '../../components/ui/FiltrosRapidos';
import { PageHeader } from '../../components/ui/PageHeader';
import { BuildingIcon, CalendarIcon, CheckCircleIcon, ClipboardListIcon, DownloadIcon, FileTextIcon, LayersIcon, MegaphoneIcon, UsersIcon } from '../../components/ui/icons';
import { useAuth } from '../../context/AuthContext';
import { useFiltrosDashboard } from '../../hooks/useFiltrosDashboard';
import { type Eficiencia, useEficiencia, useIndicadores, useMorbilidad } from '../../hooks/useDashboard';
import { ANUNCIO_VACIO, type FormularioAnuncio } from '../../lib/anuncios';
import { useExportarConsolidado } from '../../hooks/useReportes';
import { formatoFechaCalendario } from '../../lib/fechas';
import { formatoNumero, formatoPorcentaje, tonoDeOcupacion } from '../../lib/dashboard';

/** Cuántas barras muestra la gráfica de morbilidad: las que más reprueban; con el ancho completo de la columna caben ocho legibles. */
const MAX_BARRAS_MORBILIDAD = 8;

/** Rendimiento: dice con todas las letras si es el resultado oficial del año o una lectura de las notas ya cerradas (con el año en curso nadie ha aprobado todavía). */
function textoDeRendimiento(modo: Eficiencia['rendimiento']['modo'], periodo: number, reprobacion: number | null) {
  if (modo === 'OFICIAL') return `Resultado oficial del año (cierre de promoción). No promovidos: ${formatoPorcentaje(reprobacion)}.`;
  return `Lectura provisional con las notas cerradas del periodo ${periodo}: quienes no tienen asignaturas perdidas. Con asignaturas perdidas o por resolver: ${formatoPorcentaje(reprobacion)}.`;
}

/** Dashboard de rectoría (M30): indicadores institucionales, eficiencia interna por nivel, morbilidad académica y comunicación. Solo lee. */
export function DashboardDirectivoPage({ links }: { links: NavItem[] }) {
  const { user } = useAuth();
  const f = useFiltrosDashboard();
  const indicadores = useIndicadores(f.filtros);
  const eficiencia = useEficiencia(f.filtros);
  const morbilidad = useMorbilidad(f.filtros);
  const [morbilidadPor, setMorbilidadPor] = useState('asignaturas');
  const [comunicado, setComunicado] = useState<FormularioAnuncio | null>(null);
  const consolidado = useExportarConsolidado();

  const ind = indicadores.data;
  const matricula = ind?.matricula;
  const sinGrupos = ind !== undefined && ind.contexto.grupos === 0;
  const oficial = ind?.rendimiento.modo === 'OFICIAL';

  // El color agrupa por tipo de tarea: reportes (verde), gestión (azul) y comunicación (naranja).
  const accesos: AccesoRapido[] = [
    { etiqueta: 'Estadísticas DANE C-600', descripcion: 'Vista previa, Excel y PDF', icono: DownloadIcon, tono: 'green', to: '/admin/reporte-c600' },
    { etiqueta: 'Estadísticas para SIMAT', descripcion: 'Excel o CSV para subir al MEN', icono: DownloadIcon, tono: 'green', to: '/admin/reportes-cierre?pestana=simat' },
    { etiqueta: 'Consolidado general de la institución', descripcion: 'Indicadores y eficiencia por grado, en Excel', icono: FileTextIcon, tono: 'green', onClick: () => f.filtros && consolidado.mutate({ formato: 'excel', filtros: { academic_year_id: f.filtros.academic_year_id, sede_id: f.filtros.sede_id } }) },
    { etiqueta: 'Sábana de notas', descripcion: 'Notas por grupo, en Excel o PDF', icono: FileTextIcon, tono: 'green', to: '/admin/reportes-cierre' },
    { etiqueta: 'Gestión de cupos', descripcion: 'Grupos, cupos y salones', icono: LayersIcon, tono: 'blue', to: '/admin/groups' },
    { etiqueta: 'Matrícula oficial', descripcion: 'Matrículas, folios y documentos', icono: ClipboardListIcon, tono: 'blue', to: '/admin/enrollments' },
    { etiqueta: 'Publicar circular o noticia', descripcion: 'Comunicado para los perfiles que elijas', icono: MegaphoneIcon, tono: 'orange', onClick: () => setComunicado(ANUNCIO_VACIO) },
  ];

  return (
    <div className="space-y-4">
      <PageHeader
        title={`Bienvenido, ${user?.nombre ?? ''}`}
        subtitle="Resumen del estado académico e institucional de tu colegio. Se actualiza solo cada par de minutos."
        action={
          <Card className="w-full p-3 lg:w-[36rem]">
            <BarraFiltrosDashboard f={f} />
          </Card>
        }
      />

      {consolidado.isError && <Alert tone="error">{errorMessage(consolidado.error)}</Alert>}
      {sinGrupos && <Alert tone="info">Este año lectivo no tiene grupos activos en el alcance elegido, así que los indicadores aparecen vacíos.</Alert>}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <TarjetaIndicador
          tinte
          titulo="Matrícula y cobertura"
          icono={BuildingIcon}
          tono={tonoDeOcupacion(matricula?.ocupacion_pct ?? null)}
          valor={matricula && matricula.capacidad > 0 ? formatoNumero(matricula.matriculados) : null}
          vacio="No hay cupos registrados en este alcance."
          detalle={matricula && `${formatoNumero(matricula.disponibles)} de ${formatoNumero(matricula.capacidad)} cupos disponibles${matricula.preinscritos > 0 ? ` · ${formatoNumero(matricula.preinscritos)} preinscritos` : ''}`}
          progreso={matricula && { value: matricula.matriculados, max: matricula.capacidad, etiqueta: 'Ocupación de cupos' }}
          cargando={indicadores.isLoading}
          error={indicadores.error}
        />
        <TarjetaIndicador
          tinte
          titulo={oficial ? 'Aprobación institucional' : 'Sin asignaturas perdidas'}
          icono={CheckCircleIcon}
          tono="blue"
          valor={formatoPorcentaje(ind?.rendimiento.aprobacion_pct ?? null)}
          vacio="Todavía no hay notas cerradas con las que medirlo."
          detalle={ind && (oficial ? 'Resultado oficial del año' : `Provisional · periodo ${ind.contexto.periodo_notas}`)}
          ayuda={ind && textoDeRendimiento(ind.rendimiento.modo, ind.contexto.periodo_notas, ind.rendimiento.reprobacion_pct)}
          progreso={ind?.rendimiento.aprobacion_pct != null ? { value: ind.rendimiento.aprobacion_pct, max: 100, etiqueta: 'Aprobación' } : undefined}
          cargando={indicadores.isLoading}
          error={indicadores.error}
        />
        <TarjetaIndicador
          tinte
          titulo="Asistencia acumulada"
          icono={UsersIcon}
          tono="blue"
          valor={formatoPorcentaje(ind?.asistencia.asistencia_pct ?? null)}
          vacio="Aún no hay asistencia registrada."
          detalle={ind && `${formatoNumero(ind.asistencia.fallas_injustificadas)} fallas injustificadas · ${formatoNumero(ind.asistencia.retardos)} retardos`}
          progreso={ind?.asistencia.asistencia_pct != null ? { value: ind.asistencia.asistencia_pct, max: 100, etiqueta: 'Asistencia' } : undefined}
          cargando={indicadores.isLoading}
          error={indicadores.error}
        />
        <TarjetaIndicador
          tinte
          titulo="Cierre de planillas"
          icono={ClipboardListIcon}
          tono="orange"
          valor={formatoPorcentaje(ind?.planillas.notas_pct ?? null)}
          vacio="No hay planillas con estudiantes por calificar."
          detalle={
            ind && (
              <>
                {formatoNumero(ind.planillas.clases_cerradas)} de {formatoNumero(ind.planillas.clases_total)} planillas cerradas · periodo {ind.planillas.periodo_numero}
                {ind.planillas.fecha_cierre_notas && (
                  <span className="mt-1 flex items-center gap-1 text-xs text-muted">
                    <CalendarIcon className="h-3.5 w-3.5" /> Cierre de notas: {formatoFechaCalendario(ind.planillas.fecha_cierre_notas)}
                  </span>
                )}
              </>
            )
          }
          progreso={ind?.planillas.notas_pct != null ? { value: ind.planillas.notas_pct, max: 100, etiqueta: 'Notas cerradas' } : undefined}
          cargando={indicadores.isLoading}
          error={indicadores.error}
        />
      </div>

      <FilaPrincipal
        izquierda={
          <>
            <BloqueDashboard titulo="Matriz de eficiencia interna" subtitulo="Resultado por nivel educativo" consulta={eficiencia}>
              {(datos) => <MatrizEficienciaCompacta datos={datos} />}
            </BloqueDashboard>

            <BloqueDashboard
              titulo="Morbilidad académica"
              subtitulo={morbilidad.data ? `Mayor reprobación · periodo ${morbilidad.data.contexto.periodo_notas} (mínimo ${morbilidad.data.minimo_evaluados} evaluados)` : 'Asignaturas y áreas con más reprobación'}
              accion={
                <FiltrosRapidos
                  ariaLabel="Ver morbilidad por"
                  valor={morbilidadPor}
                  onChange={setMorbilidadPor}
                  items={[
                    { clave: 'asignaturas', etiqueta: 'Asignaturas' },
                    { clave: 'areas', etiqueta: 'Áreas' },
                  ]}
                />
              }
              consulta={morbilidad}
            >
              {(datos) => (
                <GraficaBarrasVerticales
                  etiquetaEje="Porcentaje de reprobación"
                  vacio={`Ninguna ${morbilidadPor === 'asignaturas' ? 'asignatura' : 'área'} tiene reprobados con al menos ${datos.minimo_evaluados} evaluados en este periodo.`}
                  barras={(morbilidadPor === 'asignaturas' ? datos.asignaturas : datos.areas).slice(0, MAX_BARRAS_MORBILIDAD).map((m) => ({
                    clave: m.clave,
                    etiqueta: m.nombre,
                    valor: m.porcentaje,
                    ayuda: `${m.nombre}${morbilidadPor === 'asignaturas' && m.area ? ` (${m.area})` : ''}: ${formatoPorcentaje(m.porcentaje)} · ${m.reprobados} de ${m.evaluados} evaluados`,
                  }))}
                />
              )}
            </BloqueDashboard>
          </>
        }
        derecha={<AccesosRapidos destacados columnas={1} accesos={accesos} />}
      />

      <PanelComunicacion onRedactar={() => setComunicado(ANUNCIO_VACIO)} />

      <SeccionTodasLasPantallas links={links} />

      <AnuncioDrawer form={comunicado} onChange={setComunicado} />
    </div>
  );
}
