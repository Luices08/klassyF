import { Link } from 'react-router-dom';
import { AccesosRapidos, type AccesoRapido } from '../../components/dashboard/AccesosRapidos';
import { BarraFiltrosDashboard } from '../../components/dashboard/BarraFiltrosDashboard';
import { BarrasHorizontales } from '../../components/dashboard/BarrasHorizontales';
import { BloqueDashboard } from '../../components/dashboard/BloqueDashboard';
import { CuadriculaDeAccesos } from '../../components/dashboard/CuadriculaDeAccesos';
import { MosaicoNoticiasInicio } from '../../components/noticias/MosaicoNoticiasInicio';
import { SeccionPlegable } from '../../components/dashboard/SeccionPlegable';
import { TarjetaIndicador } from '../../components/dashboard/TarjetaIndicador';
import type { NavItem } from '../../components/layout/navigation';
import { Alert } from '../../components/ui/Alert';
import { Chip } from '../../components/ui/Badge';
import { Card } from '../../components/ui/Card';
import { PageHeader } from '../../components/ui/PageHeader';
import { AlertTriangleIcon, CalendarIcon, EyeIcon, FolderIcon, InboxIcon, UsersIcon } from '../../components/ui/icons';
import { usePanelConvivencia } from '../../hooks/useDashboard';
import { useFiltrosDashboard } from '../../hooks/useFiltrosDashboard';
import { formatoFechaCalendario } from '../../lib/fechas';
import { NOMBRE_ALERTA_CASO, NOMBRE_ESTADO_CASO, antiguedadEnDias, formatoNumero } from '../../lib/dashboard';

/**
 * Panel del coordinador de convivencia (M30): lo que tiene por atender. Solo conteos y códigos de caso; los hechos y las personas se ven en cada caso, donde
 * la consulta queda auditada. Cada coordinador ve las sedes que tiene asignadas.
 */
export function DashboardConvivenciaPage({ links }: { links: NavItem[] }) {
  const f = useFiltrosDashboard();
  const panel = usePanelConvivencia(f.filtros);
  const p = panel.data;

  const accesos: AccesoRapido[] = [
    { etiqueta: 'Solicitudes de caso', descripcion: 'Faltas remitidas por docentes', icono: InboxIcon, to: '/convivencia/solicitudes', contador: p?.solicitudes.pendientes },
    { etiqueta: 'Casos de convivencia', descripcion: 'Abrir, atender y cerrar', icono: FolderIcon, to: '/convivencia/casos', contador: p?.alertas.total },
    { etiqueta: 'Comité de convivencia', descripcion: 'Sesiones y actas', icono: UsersIcon, to: '/convivencia/comite' },
    { etiqueta: 'Observador', descripcion: 'Observaciones y faltas por estudiante', icono: EyeIcon, to: '/convivencia/observador' },
  ];

  return (
    <div className="space-y-4">
      <PageHeader title="Panel de convivencia" subtitle="Lo que tienes por atender en tus sedes. Se actualiza solo cada par de minutos." />
      <Card>
        <BarraFiltrosDashboard f={f} sinPeriodo />
      </Card>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <TarjetaIndicador
          titulo="Solicitudes por atender"
          icono={InboxIcon}
          tono={p && p.solicitudes.pendientes > 0 ? 'orange' : 'green'}
          valor={p ? formatoNumero(p.solicitudes.pendientes) : null}
          detalle={p && (p.solicitudes.mas_antigua_dias !== null ? `La más antigua llegó ${antiguedadEnDias(p.solicitudes.mas_antigua_dias)}.` : 'No hay solicitudes pendientes.')}
          cargando={panel.isLoading}
          error={panel.error}
        />
        <TarjetaIndicador
          titulo="Casos activos"
          icono={FolderIcon}
          tono="blue"
          valor={p ? formatoNumero(p.casos.activos) : null}
          detalle={p && `Tipo I: ${p.casos.por_tipo.I} · Tipo II: ${p.casos.por_tipo.II} · Tipo III: ${p.casos.por_tipo.III}`}
          cargando={panel.isLoading}
          error={panel.error}
        />
        <TarjetaIndicador
          titulo="Casos con alerta"
          icono={AlertTriangleIcon}
          tono={p && p.alertas.total > 0 ? 'red' : 'green'}
          valor={p ? formatoNumero(p.alertas.total) : null}
          detalle={p && `Remisión tipo III sin atender: ${p.alertas.remision_tipo_iii} · Seguimiento vencido: ${p.alertas.seguimiento_vencido}`}
          cargando={panel.isLoading}
          error={panel.error}
        />
        <TarjetaIndicador
          titulo={`Faltas de los últimos ${p?.faltas.dias ?? 30} días`}
          icono={EyeIcon}
          tono="orange"
          valor={p ? formatoNumero(p.faltas.total) : null}
          detalle={p && `Tipo I: ${p.faltas.por_gravedad.I} · Tipo II: ${p.faltas.por_gravedad.II} · Tipo III: ${p.faltas.por_gravedad.III}`}
          cargando={panel.isLoading}
          error={panel.error}
        />
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <div className="space-y-4 lg:col-span-2">
          <BloqueDashboard titulo="Casos por estado" subtitulo="Los casos que siguen abiertos" consulta={panel}>
            {(datos) => (
              <BarrasHorizontales
                vacio="No hay casos abiertos."
                filas={Object.entries(datos.casos.por_estado)
                  .filter(([, total]) => total > 0)
                  .map(([estado, total]) => ({ clave: estado, etiqueta: NOMBRE_ESTADO_CASO[estado] ?? estado, valor: total, maximo: datos.casos.activos, texto: formatoNumero(total) }))}
              />
            )}
          </BloqueDashboard>

          <BloqueDashboard
            titulo="Casos con alerta"
            subtitulo="Solo el código del caso: quiénes están involucrados se ve al abrirlo"
            accion={
              <Link to="/convivencia/casos" className="text-sm font-semibold text-primary hover:underline">
                Ver los casos
              </Link>
            }
            consulta={panel}
          >
            {(datos) =>
              datos.alertas.casos.length === 0 ? (
                <Alert tone="success">Ningún caso tiene alertas por ahora.</Alert>
              ) : (
                <ul className="divide-y divide-border">
                  {datos.alertas.casos.map((c) => (
                    <li key={c._id} className="flex flex-wrap items-center justify-between gap-2 py-2 text-sm">
                      <span className="font-medium text-ink">
                        {c.codigo} <span className="font-normal text-muted">· Tipo {c.tipo_situacion}</span>
                      </span>
                      <span className="flex flex-wrap gap-2">
                        {c.alertas.map((a) => (
                          <Chip key={a} tone="red">
                            {NOMBRE_ALERTA_CASO[a] ?? a}
                          </Chip>
                        ))}
                      </span>
                    </li>
                  ))}
                </ul>
              )
            }
          </BloqueDashboard>
        </div>

        <div className="space-y-4">
          <AccesosRapidos accesos={accesos} />
          <BloqueDashboard titulo="Comité y orientación" consulta={panel}>
            {(datos) => (
              <ul className="space-y-3 text-sm">
                <li className="flex items-center justify-between gap-3">
                  <span className="text-body">Sesiones del comité sin firmar</span>
                  <Chip tone={datos.comite.borradores > 0 ? 'orange' : 'green'}>{datos.comite.borradores}</Chip>
                </li>
                <li className="flex items-start gap-2 text-body">
                  <CalendarIcon className="mt-0.5 h-4 w-4 shrink-0 text-muted" />
                  {datos.comite.proxima ? (
                    <span>
                      Próxima sesión {datos.comite.proxima.tipo === 'EXTRAORDINARIA' ? 'extraordinaria' : 'ordinaria'}: {formatoFechaCalendario(datos.comite.proxima.fecha)}
                      {datos.comite.proxima.hora ? `, ${datos.comite.proxima.hora}` : ''}
                    </span>
                  ) : (
                    <span className="text-muted">No hay una sesión del comité programada.</span>
                  )}
                </li>
                <li className="flex items-center justify-between gap-3">
                  <span className="text-body">Remisiones a orientación sin atender</span>
                  <Chip tone={datos.remisiones_orientacion.pendientes > 0 ? 'orange' : 'green'}>{datos.remisiones_orientacion.pendientes}</Chip>
                </li>
                <li className="flex items-center justify-between gap-3">
                  <span className="text-body">Remisiones en atención</span>
                  <Chip tone="blue">{datos.remisiones_orientacion.en_atencion}</Chip>
                </li>
              </ul>
            )}
          </BloqueDashboard>
        </div>
      </div>

      <MosaicoNoticiasInicio />

      <SeccionPlegable titulo="Todas las pantallas" subtitulo="Los accesos del menú, con sus novedades." abiertaPorDefecto={window.innerWidth < 1024}>
        <CuadriculaDeAccesos links={links} />
      </SeccionPlegable>
    </div>
  );
}
