import { Link } from 'react-router-dom';
import { AccesosRapidos, type AccesoRapido } from '../../components/dashboard/AccesosRapidos';
import { BarraFiltrosDashboard } from '../../components/dashboard/BarraFiltrosDashboard';
import { BarrasHorizontales } from '../../components/dashboard/BarrasHorizontales';
import { BloqueDashboard } from '../../components/dashboard/BloqueDashboard';
import { FilaAdaptable, FilaPrincipal } from '../../components/dashboard/FilaAdaptable';
import { GraficaBarrasVerticales } from '../../components/dashboard/GraficaBarrasVerticales';
import { SeccionTodasLasPantallas } from '../../components/dashboard/SeccionTodasLasPantallas';
import { TarjetaIndicador } from '../../components/dashboard/TarjetaIndicador';
import type { NavItem } from '../../components/layout/navigation';
import { MosaicoNoticiasInicio } from '../../components/noticias/MosaicoNoticiasInicio';
import { Alert } from '../../components/ui/Alert';
import { Chip } from '../../components/ui/Badge';
import { Card } from '../../components/ui/Card';
import { PageHeader } from '../../components/ui/PageHeader';
import { AlertTriangleIcon, ActivityIcon, BookIcon, CalendarIcon, ClipboardListIcon, FileTextIcon, GraduationCapIcon, UsersIcon } from '../../components/ui/icons';
import { useFiltrosDashboard } from '../../hooks/useFiltrosDashboard';
import {
  useAlertasCoordinacion,
  useComparativoDeGrupos,
  useDesempeno,
  useEntregaDeNotas,
  useRecuperacionesPendientes,
  useRiesgoCritico,
  useServicioSocialResumen,
} from '../../hooks/useDashboard';
import { formatoFechaCalendario } from '../../lib/fechas';
import { TONO_DE_NIVEL, formatoNumero, formatoPorcentaje } from '../../lib/dashboard';

/** Dashboard de coordinación académica (M30): control de la entrega de notas, estudiantes en riesgo y seguimiento pedagógico. Solo lee. */
export function DashboardCoordinacionPage({ links }: { links: NavItem[] }) {
  const f = useFiltrosDashboard();
  const entrega = useEntregaDeNotas(f.filtros);
  const riesgo = useRiesgoCritico(f.filtros);
  const recuperaciones = useRecuperacionesPendientes(f.filtros);
  const servicio = useServicioSocialResumen(f.filtros);
  const desempeno = useDesempeno(f.filtros);
  const comparativo = useComparativoDeGrupos(f.filtros);
  const alertas = useAlertasCoordinacion(f.filtros);

  const e = entrega.data;
  const r = riesgo.data;
  const rec = recuperaciones.data;
  const ss = servicio.data;

  // El color agrupa por tipo de tarea, igual que en rectoría: reportes (verde), gestión (azul) y seguimiento que requiere atención (naranja).
  const accesos: AccesoRapido[] = [
    { etiqueta: 'Comisión de evaluación', descripcion: 'Preparar la sesión y el acta', icono: UsersIcon, tono: 'blue', to: '/comision', contador: alertas.data?.sesiones_sin_realizar },
    { etiqueta: 'Sábana de notas', descripcion: 'Por grupo o por grado', icono: FileTextIcon, tono: 'green', to: '/admin/reportes-cierre' },
    { etiqueta: 'Inasistencias', descripcion: 'Seguimiento por fecha y curso', icono: ActivityIcon, tono: 'blue', to: '/asistencia/gestion', contador: alertas.data?.justificaciones_pendientes },
    { etiqueta: 'Servicio social', descripcion: 'Listado consolidado de 10.° y 11.°', icono: GraduationCapIcon, tono: 'green', to: '/admin/reportes-cierre?pestana=listados' },
    { etiqueta: 'Seguimiento de notas', descripcion: 'Planillas por docente y periodo', icono: ClipboardListIcon, tono: 'blue', to: '/admin/notas' },
    { etiqueta: 'Recuperaciones', descripcion: 'Quién debe presentarlas', icono: BookIcon, tono: 'orange', to: '/recuperaciones' },
  ];

  return (
    <div className="space-y-4">
      <PageHeader title="Panel de coordinación académica" subtitle="Control de notas y seguimiento a estudiantes. Se actualiza solo cada par de minutos." />
      <Card>
        <BarraFiltrosDashboard f={f} />
      </Card>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <TarjetaIndicador
          tinte
          titulo="Entrega de notas"
          icono={ClipboardListIcon}
          tono="orange"
          valor={formatoPorcentaje(e?.avance.clases_pct ?? null)}
          vacio="No hay planillas con estudiantes por calificar."
          detalle={
            e && (
              <>
                {formatoNumero(e.avance.clases_cerradas)} de {formatoNumero(e.avance.clases_total)} planillas cerradas · periodo {e.corte.periodo_numero}
                {e.corte.fecha_cierre_notas && (
                  <span className="mt-1 flex items-center gap-1 text-xs text-muted">
                    <CalendarIcon className="h-3.5 w-3.5" /> Cierre de notas: {formatoFechaCalendario(e.corte.fecha_cierre_notas)}
                  </span>
                )}
              </>
            )
          }
          progreso={e?.avance.clases_pct != null ? { value: e.avance.clases_pct, max: 100, etiqueta: 'Planillas cerradas' } : undefined}
          cargando={entrega.isLoading}
          error={entrega.error}
        />
        <TarjetaIndicador
          tinte
          titulo="Estudiantes en riesgo crítico"
          icono={AlertTriangleIcon}
          tono="red"
          valor={r ? formatoNumero(r.resumen.ROJO) : null}
          detalle={
            r && (
              <>
                {formatoNumero(r.por_perdidas)} con {r.umbrales.perdidas_rojo_desde} o más asignaturas perdidas · {formatoNumero(r.por_inasistencia)} con más de {r.umbrales.inasistencia_roja_pct} % de inasistencia
                {r.hay_notas_provisionales && <span className="mt-1 block text-xs text-muted">Incluye notas de planillas aún abiertas (proyección).</span>}
              </>
            )
          }
          cargando={riesgo.isLoading}
          error={riesgo.error}
        />
        <TarjetaIndicador
          tinte
          titulo="Nivelaciones y recuperaciones"
          icono={BookIcon}
          tono="blue"
          valor={rec && rec.periodo.aplica ? formatoNumero(rec.periodo.estudiantes_pendientes + (rec.anual?.estudiantes_pendientes ?? 0)) : null}
          vacio={rec?.periodo.motivo_no_aplica ?? 'No hay recuperaciones pendientes.'}
          detalle={
            rec && (
              <>
                {formatoNumero(rec.periodo.pendientes + (rec.anual?.pendientes ?? 0))} asignaturas por superar
                {rec.anual && <span className="block text-xs text-muted">Incluye la recuperación de fin de año.</span>}
              </>
            )
          }
          cargando={recuperaciones.isLoading}
          error={recuperaciones.error}
        />
        <TarjetaIndicador
          tinte
          titulo="Servicio social (10.° y 11.°)"
          icono={GraduationCapIcon}
          tono="green"
          valor={ss && ss.estudiantes > 0 && !ss.sin_exigencia ? `${formatoNumero(ss.aprobados)} / ${formatoNumero(ss.estudiantes)}` : null}
          vacio={ss?.estudiantes === 0 ? 'No hay estudiantes de 10.° ni 11.° con matrícula activa.' : 'El colegio no exige horas de servicio social.'}
          detalle={ss && `${formatoNumero(ss.pendientes)} pendientes · ${formatoNumero(ss.horas_por_verificar)} h por verificar${ss.exigidas ? ` · se exigen ${ss.exigidas} h` : ''}`}
          progreso={ss && ss.estudiantes > 0 && !ss.sin_exigencia ? { value: ss.aprobados, max: ss.estudiantes, etiqueta: 'Servicio social aprobado' } : undefined}
          cargando={servicio.isLoading}
          error={servicio.error}
        />
      </div>

      <FilaPrincipal
        izquierda={
          <>
            <BloqueDashboard
              titulo="Docentes con entregas pendientes"
              subtitulo={e ? `Planillas sin cerrar del periodo ${e.corte.periodo_numero}` : 'Planillas sin cerrar'}
              accion={
                <Link to="/admin/notas" className="text-sm font-semibold text-primary hover:underline">
                  Seguimiento completo
                </Link>
              }
              consulta={entrega}
            >
              {(datos) =>
                datos.pendientes.total === 0 ? (
                  <Alert tone="success">Todos los docentes entregaron sus planillas de este periodo.</Alert>
                ) : (
                  <div className="space-y-3">
                    <ul className="space-y-3">
                      {datos.pendientes.docentes.map((d) => (
                        <li key={d.docente_id} className="border-t border-border pt-3 first:border-t-0 first:pt-0">
                          <p className="flex items-center justify-between gap-2 text-sm font-semibold text-ink">
                            {d.docente}
                            <Chip tone="orange">{d.pendientes} sin cerrar</Chip>
                          </p>
                          <p className="text-xs text-muted">{d.clases.map((c) => `${c.asignatura} ${c.grupo} (${c.cerradas}/${c.estudiantes})`).join(' · ')}</p>
                        </li>
                      ))}
                    </ul>
                    {datos.pendientes.total > datos.pendientes.docentes.length && (
                      <p className="text-xs text-muted">Y {datos.pendientes.total - datos.pendientes.docentes.length} docentes más. El detalle está en el seguimiento de notas.</p>
                    )}
                  </div>
                )
              }
            </BloqueDashboard>

            <BloqueDashboard
              titulo="Distribución de desempeño"
              subtitulo={desempeno.data ? `Notas cerradas del periodo ${desempeno.data.contexto.periodo_notas}` : 'Escala nacional'}
              consulta={desempeno}
            >
              {(datos) => (
                <GraficaBarrasVerticales
                  etiquetaEje="Porcentaje de notas por nivel de desempeño"
                  vacio="Aún no hay notas cerradas con las que medirlo."
                  barras={
                    datos.total === 0
                      ? []
                      : datos.niveles.map((n) => ({
                          clave: n.nivel,
                          etiqueta: n.etiqueta,
                          valor: n.porcentaje ?? 0,
                          tono: TONO_DE_NIVEL[n.nivel],
                          ayuda: `${n.etiqueta}: ${formatoPorcentaje(n.porcentaje)} · ${formatoNumero(n.total)} notas`,
                        }))
                  }
                />
              )}
            </BloqueDashboard>
          </>
        }
        derecha={
          <>
            <AccesosRapidos destacados columnas={1} accesos={accesos} />
            <BloqueDashboard titulo="Alertas tempranas" subtitulo="Lo que requiere atención de coordinación" consulta={alertas}>
              {(datos) => {
                const filas = [
                  { etiqueta: 'Justificaciones de inasistencia por revisar', valor: datos.justificaciones_pendientes, to: '/asistencia/gestion' },
                  { etiqueta: 'Sesiones de la comisión sin realizar', valor: datos.sesiones_sin_realizar, to: '/comision' },
                  { etiqueta: 'Estudiantes en riesgo crítico', valor: r?.resumen.ROJO ?? 0, to: '/comision' },
                ];
                return (
                  <ul className="space-y-2">
                    {filas.map((a) => (
                      <li key={a.etiqueta}>
                        <Link to={a.to} className="flex items-center justify-between gap-3 rounded-lg px-2 py-2 text-sm text-body hover:bg-soft">
                          <span>{a.etiqueta}</span>
                          <Chip tone={a.valor > 0 ? 'orange' : 'green'}>{a.valor}</Chip>
                        </Link>
                      </li>
                    ))}
                  </ul>
                );
              }}
            </BloqueDashboard>
          </>
        }
      />

      {/* Si no hay estudiantes en riesgo, el comparativo ocupa todo el ancho en vez de dejar un hueco. */}
      <FilaAdaptable>
        {r && r.estudiantes.length > 0 && (
          <BloqueDashboard
            titulo="Estudiantes en riesgo crítico"
            subtitulo={`Los ${r.estudiantes.length} con más asignaturas perdidas (de ${formatoNumero(r.resumen.ROJO)}). Los convoca la comisión de evaluación.`}
            accion={
              <Link to="/comision" className="text-sm font-semibold text-primary hover:underline">
                Ir a la comisión
              </Link>
            }
            consulta={riesgo}
          >
            {(datos) => (
              <ul className="divide-y divide-border">
                {datos.estudiantes.map((x) => (
                  <li key={x.student_id} className="flex flex-wrap items-center justify-between gap-2 py-2 text-sm">
                    <span className="font-medium text-ink">
                      {x.apellido} {x.nombre} <span className="font-normal text-muted">· {x.grupo}</span>
                    </span>
                    <span className="text-xs text-muted">{x.motivos.join(' · ')}</span>
                  </li>
                ))}
              </ul>
            )}
          </BloqueDashboard>
        )}

        <BloqueDashboard
          titulo="Comparativo por grupos"
          subtitulo={comparativo.data ? `Promedio de notas del periodo ${comparativo.data.contexto.periodo_notas}` : 'Grupos del mismo grado'}
          consulta={comparativo}
        >
          {(datos) =>
            datos.grados.length === 0 ? (
              <p className="py-4 text-center text-sm text-muted">Hace falta más de un grupo por grado con notas cerradas para compararlos.</p>
            ) : (
              <div className="space-y-5">
                {datos.grados.map((g) => (
                  <div key={g.grado_id} className="space-y-2">
                    <p className="flex items-center justify-between text-sm font-semibold text-ink">
                      {g.grado}
                      {g.brecha !== null && <span className="text-xs font-normal text-muted">Brecha: {g.brecha.toLocaleString('es-CO')}</span>}
                    </p>
                    <BarrasHorizontales
                      vacio=""
                      filas={g.grupos.map((x) => ({
                        clave: x.grupo_id,
                        etiqueta: x.etiqueta,
                        valor: x.promedio ?? 0,
                        maximo: datos.contexto.nota_maxima,
                        texto: x.promedio === null ? 'Sin notas' : x.promedio.toLocaleString('es-CO'),
                        tono: x.promedio !== null && x.promedio < datos.contexto.nota_aprobatoria ? 'red' : 'blue',
                      }))}
                    />
                  </div>
                ))}
              </div>
            )
          }
        </BloqueDashboard>
      </FilaAdaptable>

      <MosaicoNoticiasInicio />

      <SeccionTodasLasPantallas links={links} />
    </div>
  );
}
