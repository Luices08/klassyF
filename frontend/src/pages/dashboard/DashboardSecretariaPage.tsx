import { Link } from 'react-router-dom';
import { AccesosRapidos, type AccesoRapido } from '../../components/dashboard/AccesosRapidos';
import { BarraFiltrosDashboard } from '../../components/dashboard/BarraFiltrosDashboard';
import { BloqueDashboard } from '../../components/dashboard/BloqueDashboard';
import { FilaAdaptable, FilaPrincipal } from '../../components/dashboard/FilaAdaptable';
import { GraficaBarrasVerticales } from '../../components/dashboard/GraficaBarrasVerticales';
import { SeccionTodasLasPantallas } from '../../components/dashboard/SeccionTodasLasPantallas';
import { TarjetaIndicador } from '../../components/dashboard/TarjetaIndicador';
import type { NavItem } from '../../components/layout/navigation';
import { MosaicoNoticiasInicio } from '../../components/noticias/MosaicoNoticiasInicio';
import { Chip } from '../../components/ui/Badge';
import { Card } from '../../components/ui/Card';
import { PageHeader } from '../../components/ui/PageHeader';
import { BuildingIcon, CalendarIcon, ClipboardListIcon, DoorIcon, DownloadIcon, FileTextIcon, FolderIcon, InboxIcon, MegaphoneIcon } from '../../components/ui/icons';
import { useAuth } from '../../context/AuthContext';
import { usePanelSecretaria } from '../../hooks/useDashboard';
import { useFiltrosDashboard } from '../../hooks/useFiltrosDashboard';
import { NOMBRE_ESTADO_MATRICULA, antiguedadEnDias, formatoNumero, tonoDeOcupacion } from '../../lib/dashboard';

/**
 * Panel de secretaría (M30): matrículas, admisiones, documentos y salidas de las sedes que tiene asignadas. Solo conteos; las personas se ven en cada pantalla
 * de trámite. Nada de convivencia, inclusión ni notas: secretaría no las consulta.
 */
export function DashboardSecretariaPage({ links }: { links: NavItem[] }) {
  const { user } = useAuth();
  const f = useFiltrosDashboard();
  const panel = usePanelSecretaria(f.filtros);
  const p = panel.data;

  const pazYSalvoPorResolver = p ? p.salidas.paz_y_salvo_pendiente + p.salidas.paz_y_salvo_bloqueado : 0;

  // El color agrupa por tipo de tarea, igual que en rectoría: gestión (azul), documentos y reportes (verde) y comunicación (naranja).
  const accesos: AccesoRapido[] = [
    { etiqueta: 'Nueva matrícula', descripcion: 'Matrículas, folios y documentos', icono: ClipboardListIcon, tono: 'blue', to: '/admin/enrollments' },
    { etiqueta: 'Admisiones', descripcion: 'Solicitudes de cupo de las familias', icono: InboxIcon, tono: 'blue', to: '/admin/admisiones', contador: p?.admisiones.pendientes },
    { etiqueta: 'Documentos por revisar', descripcion: 'Lo que subieron las familias', icono: FolderIcon, tono: 'blue', to: '/admin/documentos-por-revisar', contador: p?.documentos.por_revisar },
    { etiqueta: 'Retiros y traslados', descripcion: 'Salidas y paz y salvo', icono: DoorIcon, tono: 'blue', to: '/secretaria/salidas', contador: pazYSalvoPorResolver },
    { etiqueta: 'Rematrícula de fin de año', descripcion: 'Reservar cupos del año siguiente', icono: BuildingIcon, tono: 'blue', to: '/secretaria/rematricula' },
    { etiqueta: 'Certificados', descripcion: 'Expedir constancias y certificados', icono: FileTextIcon, tono: 'green', to: '/secretaria/certificados' },
    { etiqueta: 'Reportes DANE y SIMAT', descripcion: 'C-600 y cierre para el MEN', icono: DownloadIcon, tono: 'green', to: '/admin/reporte-c600' },
    { etiqueta: 'Publicar una noticia', descripcion: 'Para las familias de tus sedes', icono: MegaphoneIcon, tono: 'orange', to: '/noticias' },
  ];

  const porHacer = p && [
    { etiqueta: 'Documentos de matrícula por revisar', valor: p.documentos.por_revisar, to: '/admin/documentos-por-revisar' },
    { etiqueta: 'Solicitudes de admisión sin atender', valor: p.admisiones.pendientes, to: '/admin/admisiones' },
    { etiqueta: 'Condicionales con el plazo del acta vencido', valor: p.documentos.condicionales.plazo_vencido, to: '/admin/enrollments' },
    { etiqueta: 'Paz y salvo de salida por resolver', valor: pazYSalvoPorResolver, to: '/secretaria/salidas' },
    { etiqueta: 'Cupos retenidos por retiros', valor: p.salidas.cupo_retenido, to: '/secretaria/salidas' },
  ];

  return (
    <div className="space-y-4">
      <PageHeader title={`Hola, ${user?.nombre ?? ''}`} subtitle="Lo que tienes por tramitar en tus sedes. Se actualiza solo cada par de minutos." />
      <Card>
        <BarraFiltrosDashboard f={f} sinPeriodo />
      </Card>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <TarjetaIndicador
          tinte
          titulo="Matrícula y cobertura"
          icono={BuildingIcon}
          tono={tonoDeOcupacion(p?.matricula.ocupacion_pct ?? null)}
          valor={p && p.matricula.capacidad > 0 ? formatoNumero(p.matricula.matriculados) : null}
          vacio="No hay cupos registrados en tus sedes."
          detalle={p && `${formatoNumero(p.matricula.disponibles)} de ${formatoNumero(p.matricula.capacidad)} cupos disponibles${p.matricula.preinscritos > 0 ? ` · ${formatoNumero(p.matricula.preinscritos)} preinscritos` : ''}`}
          progreso={p && { value: p.matricula.matriculados, max: p.matricula.capacidad, etiqueta: 'Ocupación de cupos' }}
          cargando={panel.isLoading}
          error={panel.error}
        />
        <TarjetaIndicador
          tinte
          titulo="Admisiones por atender"
          icono={InboxIcon}
          tono={p && p.admisiones.pendientes > 0 ? 'orange' : 'green'}
          valor={p ? formatoNumero(p.admisiones.pendientes) : null}
          detalle={p && `${p.admisiones.mas_antigua_dias !== null ? `La más antigua llegó ${antiguedadEnDias(p.admisiones.mas_antigua_dias)}. ` : 'No hay solicitudes pendientes. '}Admitidas por matricular: ${formatoNumero(p.admisiones.admitidas)}`}
          cargando={panel.isLoading}
          error={panel.error}
        />
        <TarjetaIndicador
          tinte
          titulo="Documentos por revisar"
          icono={FolderIcon}
          tono={p && p.documentos.por_revisar > 0 ? 'orange' : 'green'}
          valor={p ? formatoNumero(p.documentos.por_revisar) : null}
          detalle={p && `Matrículas condicionales: ${formatoNumero(p.documentos.condicionales.total)}${p.documentos.condicionales.plazo_vencido > 0 ? ` · con plazo vencido: ${formatoNumero(p.documentos.condicionales.plazo_vencido)}` : ''}`}
          cargando={panel.isLoading}
          error={panel.error}
        />
        <TarjetaIndicador
          tinte
          titulo="Retiros y paz y salvo"
          icono={DoorIcon}
          tono={p && pazYSalvoPorResolver > 0 ? 'orange' : 'blue'}
          valor={p ? formatoNumero(p.salidas.total) : null}
          vacio="No hay retiros ni traslados este año."
          detalle={p && `Paz y salvo por resolver: ${formatoNumero(pazYSalvoPorResolver)}${p.salidas.paz_y_salvo_bloqueado > 0 ? ` (${formatoNumero(p.salidas.paz_y_salvo_bloqueado)} bloqueados)` : ''} · Cupos retenidos: ${formatoNumero(p.salidas.cupo_retenido)}`}
          cargando={panel.isLoading}
          error={panel.error}
        />
      </div>

      <FilaPrincipal
        izquierda={
          <>
            <BloqueDashboard titulo="Matrículas por estado" subtitulo="Todas las matrículas del año en tus sedes" consulta={panel}>
              {(datos) => (
                <GraficaBarrasVerticales
                  unidad="conteo"
                  etiquetaEje="Matrículas del año por estado"
                  vacio="Aún no hay matrículas este año."
                  barras={Object.entries(datos.matricula.por_estado)
                    .filter(([, total]) => total > 0)
                    .map(([estado, total]) => ({
                      clave: estado,
                      etiqueta: NOMBRE_ESTADO_MATRICULA[estado] ?? estado,
                      valor: total,
                      tono: estado === 'MATRICULADO_DEFINITIVO' ? 'green' : estado === 'RETIRADO' || estado === 'ANULADO' ? 'neutral' : estado === 'MATRICULADO_CONDICIONAL' ? 'orange' : 'blue',
                      ayuda: `${NOMBRE_ESTADO_MATRICULA[estado] ?? estado}: ${formatoNumero(total)}`,
                    }))}
                />
              )}
            </BloqueDashboard>

            <BloqueDashboard titulo="Ocupación de cupos por grado" subtitulo="Los grados más llenos (matriculados y preinscritos sobre la capacidad de sus grupos)" consulta={panel}>
              {(datos) => (
                <GraficaBarrasVerticales
                  etiquetaEje="Porcentaje de ocupación por grado"
                  vacio="Aún no hay grupos con cupos en tus sedes."
                  barras={datos.ocupacion_por_grado.map((g) => ({
                    clave: g.grado_id,
                    etiqueta: g.grado,
                    valor: g.ocupacion_pct ?? 0,
                    tono: tonoDeOcupacion(g.ocupacion_pct),
                    ayuda: `${g.grado}: ${formatoNumero(g.ocupados)} de ${formatoNumero(g.capacidad)} cupos ocupados`,
                  }))}
                />
              )}
            </BloqueDashboard>
          </>
        }
        derecha={<AccesosRapidos destacados columnas={1} accesos={accesos} />}
      />

      <FilaAdaptable>
        <BloqueDashboard titulo="Por hacer" subtitulo="Lo que requiere un trámite tuyo" consulta={panel}>
          {() => (
            <ul className="space-y-2">
              {porHacer?.map((a) => (
                <li key={a.etiqueta}>
                  <Link to={a.to} className="flex items-center justify-between gap-3 rounded-lg px-2 py-2 text-sm text-body hover:bg-soft">
                    <span>{a.etiqueta}</span>
                    <Chip tone={a.valor > 0 ? 'orange' : 'green'}>{formatoNumero(a.valor)}</Chip>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </BloqueDashboard>

        <BloqueDashboard
          titulo="Renovación de antiguos"
          subtitulo="Si cada familia continúa el año siguiente"
          accion={
            <Link to="/admin/admisiones" className="text-sm font-semibold text-primary hover:underline">
              Ver la renovación
            </Link>
          }
          consulta={panel}
        >
          {(datos) => (
            <ul className="space-y-3 text-sm">
              <li className="flex items-center justify-between gap-3">
                <span className="text-body">Continúan</span>
                <Chip tone="green">{formatoNumero(datos.renovacion.continuan)}</Chip>
              </li>
              <li className="flex items-center justify-between gap-3">
                <span className="text-body">No continúan</span>
                <Chip tone="neutral">{formatoNumero(datos.renovacion.no_continuan)}</Chip>
              </li>
              <li className="flex items-center justify-between gap-3">
                <span className="text-body">Sin respuesta</span>
                <Chip tone={datos.renovacion.sin_respuesta > 0 ? 'orange' : 'green'}>{formatoNumero(datos.renovacion.sin_respuesta)}</Chip>
              </li>
              <li className="flex items-start gap-2 text-xs text-muted">
                <CalendarIcon className="mt-0.5 h-4 w-4 shrink-0" />
                <span>Cada respuesta aparta el cupo de ese estudiante en el grado siguiente.</span>
              </li>
            </ul>
          )}
        </BloqueDashboard>
      </FilaAdaptable>

      <MosaicoNoticiasInicio />

      <SeccionTodasLasPantallas links={links} />
    </div>
  );
}
