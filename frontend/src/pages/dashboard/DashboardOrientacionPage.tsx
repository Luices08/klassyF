import { AccesosRapidos, type AccesoRapido } from '../../components/dashboard/AccesosRapidos';
import { BarraFiltrosDashboard } from '../../components/dashboard/BarraFiltrosDashboard';
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
import { ProgressBar } from '../../components/ui/ProgressBar';
import { AlertTriangleIcon, ClipboardListIcon, FolderIcon, InboxIcon, LockIcon } from '../../components/ui/icons';
import { usePanelOrientacion } from '../../hooks/useDashboard';
import { useFiltrosDashboard } from '../../hooks/useFiltrosDashboard';
import { NOMBRE_ESTADO_EXPEDIENTE, antiguedadEnDias, formatoNumero } from '../../lib/dashboard';

/**
 * Panel de orientación (M30): remisiones, solicitudes de apoyo y expedientes de inclusión de sus sedes. Solo conteos: nunca la categoría de discapacidad, un
 * diagnóstico ni lo que se escribió en una atención. Cada orientador ve las sedes que tiene asignadas.
 */
export function DashboardOrientacionPage({ links }: { links: NavItem[] }) {
  const f = useFiltrosDashboard();
  const panel = usePanelOrientacion(f.filtros);
  const p = panel.data;

  const accesos: AccesoRapido[] = [
    { etiqueta: 'Remisiones a orientación', descripcion: 'Estudiantes que convivencia te remitió', icono: InboxIcon, tono: 'orange', to: '/orientacion/remisiones', contador: p?.remisiones.PENDIENTE },
    { etiqueta: 'Inclusión (PIAR)', descripcion: 'Solicitudes de apoyo y expedientes', icono: FolderIcon, tono: 'blue', to: '/inclusion', contador: p?.solicitudes_apoyo.pendientes },
    { etiqueta: 'Balance de inclusión', descripcion: 'Cierre anual en Excel o PDF', icono: ClipboardListIcon, tono: 'green', to: '/admin/reportes-cierre?pestana=listados' },
  ];

  return (
    <div className="space-y-4">
      <PageHeader title="Panel de orientación" subtitle="Lo que tienes por atender en tus sedes. Se actualiza solo cada par de minutos." />
      <Card>
        <BarraFiltrosDashboard f={f} sinPeriodo />
      </Card>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <TarjetaIndicador
          tinte
          titulo="Remisiones por atender"
          icono={InboxIcon}
          tono={p && p.remisiones.PENDIENTE > 0 ? 'orange' : 'green'}
          valor={p ? formatoNumero(p.remisiones.PENDIENTE) : null}
          detalle={p && `${p.remisiones.mas_antigua_dias !== null ? `La más antigua llegó ${antiguedadEnDias(p.remisiones.mas_antigua_dias)}. ` : ''}En atención: ${p.remisiones.EN_ATENCION} · Atendidas: ${p.remisiones.ATENDIDA}`}
          cargando={panel.isLoading}
          error={panel.error}
        />
        <TarjetaIndicador
          tinte
          titulo="Solicitudes de apoyo"
          icono={FolderIcon}
          tono={p && p.solicitudes_apoyo.pendientes > 0 ? 'orange' : 'green'}
          valor={p ? formatoNumero(p.solicitudes_apoyo.pendientes + p.solicitudes_apoyo.en_valoracion) : null}
          detalle={p && `Por valorar: ${p.solicitudes_apoyo.pendientes} · En valoración: ${p.solicitudes_apoyo.en_valoracion}`}
          cargando={panel.isLoading}
          error={panel.error}
        />
        <TarjetaIndicador
          tinte
          titulo="Expedientes de inclusión"
          icono={ClipboardListIcon}
          tono="blue"
          valor={p ? formatoNumero(p.expedientes.total) : null}
          vacio="Aún no hay expedientes de inclusión este año."
          detalle={p && `PIAR: ${p.expedientes.piar} · Plan de apoyo: ${p.expedientes.plan_apoyo}${p.expedientes.plazo_vencido > 0 ? ` · Plazo vencido: ${p.expedientes.plazo_vencido}` : ''}`}
          cargando={panel.isLoading}
          error={panel.error}
        />
        <TarjetaIndicador
          tinte
          titulo="Sin autorización de datos"
          icono={LockIcon}
          tono={p && p.expedientes.sin_autorizacion > 0 ? 'red' : 'green'}
          valor={p ? formatoNumero(p.expedientes.sin_autorizacion) : null}
          detalle={p && 'Sin la autorización del responsable legal no se guarda nada clínico ni se emite ningún documento.'}
          cargando={panel.isLoading}
          error={panel.error}
        />
      </div>

      <FilaPrincipal
        izquierda={
          <BloqueDashboard titulo="Expedientes por estado" subtitulo="Cómo va cada expediente del año" consulta={panel}>
            {(datos) => (
              <GraficaBarrasVerticales
                unidad="conteo"
                etiquetaEje="Expedientes de inclusión por estado"
                vacio="Aún no hay expedientes este año."
                barras={Object.entries(datos.expedientes.por_estado)
                  .filter(([, total]) => total > 0)
                  .map(([estado, total]) => ({
                    clave: estado,
                    etiqueta: NOMBRE_ESTADO_EXPEDIENTE[estado] ?? estado,
                    valor: total,
                    ayuda: `${NOMBRE_ESTADO_EXPEDIENTE[estado] ?? estado}: ${formatoNumero(total)} de ${formatoNumero(datos.expedientes.total)} expedientes`,
                  }))}
              />
            )}
          </BloqueDashboard>
        }
        derecha={<AccesosRapidos destacados columnas={1} accesos={accesos} />}
      />

      <FilaAdaptable>
        <BloqueDashboard titulo="Seguimiento de los ajustes del PIAR" subtitulo="Ajustes de expedientes activos" consulta={panel}>
          {(datos) =>
            datos.seguimiento.total === 0 ? (
              <Alert tone="info">No hay ajustes razonables en expedientes activos todavía.</Alert>
            ) : (
              <div className="space-y-2">
                <p className="flex items-center justify-between text-sm text-body">
                  <span>
                    {datos.seguimiento.con_minimo} de {datos.seguimiento.total} ajustes ya tienen seguimientos en {datos.seguimiento.minimo} periodos distintos
                  </span>
                  <Chip tone={datos.seguimiento.con_minimo === datos.seguimiento.total ? 'green' : 'orange'}>{Math.round((datos.seguimiento.con_minimo / datos.seguimiento.total) * 100)} %</Chip>
                </p>
                <ProgressBar value={datos.seguimiento.con_minimo} max={datos.seguimiento.total} tone="green" label="Ajustes con el seguimiento mínimo" />
                <p className="text-xs text-muted">El mínimo lo fija el colegio. Durante el año es normal que aún falte: se exige al cierre.</p>
              </div>
            )
          }
        </BloqueDashboard>

        <Card className="space-y-2">
          <p className="flex items-center gap-2 text-label font-semibold text-ink">
            <AlertTriangleIcon className="h-4 w-4 text-warning" /> Información confidencial
          </p>
          <p className="text-sm text-muted">Este panel solo cuenta. La categoría, los diagnósticos y lo escrito en cada atención se ven dentro de cada expediente y quedan auditados.</p>
        </Card>
      </FilaAdaptable>

      <MosaicoNoticiasInicio />

      <SeccionTodasLasPantallas links={links} />
    </div>
  );
}
