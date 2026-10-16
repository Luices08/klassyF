import { useMemo, useState } from 'react';
import { descargarPdfHorario, descargarPdfSede, useDetalleHorario, usePublicadosDeSede } from '../../hooks/useHorarios';
import { formatoFechaHora } from '../../lib/fechas';
import type { DetalleHorario, PublicadoDeSede, VistaPdfHorario } from '../../types/horarios';
import { Alert, errorMessage } from '../ui/Alert';
import { Button } from '../ui/Button';
import { Chip } from '../ui/Badge';
import { Card, CardHeader } from '../ui/Card';
import { Select } from '../ui/Field';
import { SelectBuscable } from '../ui/SelectBuscable';
import { Spinner } from '../ui/Spinner';
import { FileTextIcon } from '../ui/icons';
import { LeyendaAsignaturas } from './LeyendaAsignaturas';
import { MallaHorario, type VistaHorario } from './MallaHorario';

const NOMBRES_JORNADA: Record<string, string> = { MANANA: 'Mañana', TARDE: 'Tarde', UNICA: 'Única', NOCTURNA: 'Nocturna', SABATINA: 'Sabatina' };

const VISTAS: Array<{ valor: VistaHorario; etiqueta: string }> = [
  { valor: 'TOTAL_GRUPOS', etiqueta: 'Hoja total de los grupos' },
  { valor: 'GENERAL', etiqueta: 'Hoja total de los docentes' },
  { valor: 'GRUPO', etiqueta: 'Un grupo' },
  { valor: 'DOCENTE', etiqueta: 'Un docente' },
];

const sinTildes = (texto: string) =>
  texto
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');

interface PanelPublicadosProps {
  anioId: string;
  anioNombre: string;
  sedeId: string;
  sedeNombre: string;
}

/**
 * Los horarios publicados de una sede en un año, uno por jornada: se ven con el color de cada asignatura (las mismas en todas
 * las jornadas) y se bajan en PDF: toda la sede en un solo archivo, o una jornada, una hoja total, o cada grupo y docente.
 */
export function PanelPublicados({ anioId, anioNombre, sedeId, sedeNombre }: PanelPublicadosProps) {
  const publicadosQuery = usePublicadosDeSede(anioId, sedeId);
  const [elegidoId, setElegidoId] = useState('');
  const [descargando, setDescargando] = useState(false);
  const [errorPdf, setErrorPdf] = useState<string | null>(null);

  const publicados = publicadosQuery.data?.publicados ?? [];
  const elegido = publicados.find((p) => p._id === elegidoId) ?? publicados[0];

  async function descargar(accion: () => Promise<void>) {
    setErrorPdf(null);
    setDescargando(true);
    try {
      await accion();
    } catch (err) {
      setErrorPdf(errorMessage(err));
    } finally {
      setDescargando(false);
    }
  }

  if (publicadosQuery.isLoading) return <Spinner />;
  if (publicadosQuery.isError) return <Alert tone="error">{errorMessage(publicadosQuery.error)}</Alert>;

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader
          title={`Horarios publicados · ${sedeNombre}`}
          subtitle="Un PDF con todo lo publicado de la sede: por cada jornada, la hoja total de los grupos, la de los docentes, una página por docente y una por grupo."
          action={
            <Button
              isLoading={descargando}
              disabled={descargando || publicados.length === 0}
              onClick={() => void descargar(() => descargarPdfSede(anioId, sedeId, `Horarios ${sedeNombre} ${anioNombre}.pdf`))}
            >
              <FileTextIcon className="h-4 w-4" />
              PDF de toda la sede
            </Button>
          }
        />
        {errorPdf && <Alert tone="error">{errorPdf}</Alert>}
        {publicados.length === 0 ? (
          <Alert tone="info">
            Esta sede no tiene horarios publicados en {anioNombre}. Genera y publica el de cada jornada en «Generar y publicar».
          </Alert>
        ) : (
          <ul className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
            {publicados.map((p) => (
              <TarjetaJornada key={p._id} publicado={p} activo={p._id === elegido?._id} onElegir={() => setElegidoId(p._id)} />
            ))}
          </ul>
        )}
      </Card>

      {elegido && (
        <VisorPublicado
          key={elegido._id}
          publicado={elegido}
          colores={publicadosQuery.data?.colores ?? {}}
          descargando={descargando}
          onDescargar={(vista, entidadId, nombreArchivo) => void descargar(() => descargarPdfHorario(elegido._id, vista, entidadId, nombreArchivo))}
        />
      )}
    </div>
  );
}

function TarjetaJornada({ publicado, activo, onElegir }: { publicado: PublicadoDeSede; activo: boolean; onElegir: () => void }) {
  const { jornada, resumen } = publicado;
  return (
    <li>
      <button
        type="button"
        onClick={onElegir}
        aria-pressed={activo}
        className={`w-full rounded-xl border p-4 text-left transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary ${
          activo ? 'border-primary bg-primary-soft' : 'border-border bg-surface hover:bg-soft'
        }`}
      >
        <span className="flex items-center justify-between gap-2">
          <span className="text-h3 text-ink">Jornada {NOMBRES_JORNADA[jornada.nombre] ?? jornada.nombre}</span>
          <Chip tone="green">Publicado</Chip>
        </span>
        <span className="mt-1 block font-mono text-xs text-muted">
          {jornada.hora_inicio} – {jornada.hora_fin}
        </span>
        <span className="mt-2 block text-sm text-body">
          {resumen.grupos} grupos · {resumen.docentes} docentes · {resumen.asignaturas} asignaturas
        </span>
        <span className="block text-xs text-muted">
          {publicado.nombre}
          {publicado.publicado_en ? ` · publicado ${formatoFechaHora(publicado.publicado_en)}` : ''}
        </span>
      </button>
    </li>
  );
}

function VisorPublicado({
  publicado,
  colores,
  descargando,
  onDescargar,
}: {
  publicado: PublicadoDeSede;
  colores: Record<string, { fondo: string; borde: string }>;
  descargando: boolean;
  onDescargar: (vista: VistaPdfHorario, entidadId: string | undefined, nombreArchivo: string) => void;
}) {
  const detalleQuery = useDetalleHorario(publicado._id, 'PUBLICADO');
  const [vista, setVista] = useState<VistaHorario>('TOTAL_GRUPOS');
  const [entidadId, setEntidadId] = useState('');

  // La sede usa un solo color por asignatura en todas las jornadas: el de la lista, no el que trae el catálogo de esta versión.
  const detalle: DetalleHorario | undefined = useMemo(() => {
    const base = detalleQuery.data;
    if (!base) return undefined;
    return { ...base, catalogo: { ...base.catalogo, asignaturas: base.catalogo.asignaturas.map((a) => ({ ...a, color: colores[a._id] ?? a.color })) } };
  }, [detalleQuery.data, colores]);

  if (detalleQuery.isLoading) return <Spinner />;
  if (detalleQuery.isError) return <Alert tone="error">{errorMessage(detalleQuery.error)}</Alert>;
  if (!detalle) return null;

  const { horario, estructura, catalogo } = detalle;
  const nombreJornada = NOMBRES_JORNADA[publicado.jornada.nombre] ?? publicado.jornada.nombre;
  const porEntidad = vista === 'GRUPO' || vista === 'DOCENTE';
  const opciones = vista === 'GRUPO' ? catalogo.grupos.map((g) => ({ id: g._id, nombre: g.etiqueta })) : catalogo.docentes.map((d) => ({ id: d._id, nombre: d.nombre }));
  const elegido = opciones.find((o) => o.id === entidadId) ?? opciones[0];
  const archivo = (sufijo: string) => `Horario ${nombreJornada} - ${sufijo}.pdf`;

  return (
    <Card>
      <CardHeader
        title={`Jornada ${nombreJornada}`}
        subtitle={`${horario.nombre} · ${horario.sesiones.length} sesiones`}
        action={
          <div className="flex flex-wrap justify-end gap-2">
            <Button variant="outline" disabled={descargando} onClick={() => onDescargar('COMPLETO', undefined, archivo('completo'))}>
              <FileTextIcon className="h-4 w-4" />
              PDF de la jornada
            </Button>
            <Button variant="secondary" disabled={descargando} onClick={() => onDescargar('TOTAL_GRUPOS', undefined, archivo('total grupos'))}>
              Total de grupos
            </Button>
            <Button variant="secondary" disabled={descargando} onClick={() => onDescargar('GENERAL', undefined, archivo('total docentes'))}>
              Total de docentes
            </Button>
            <Button variant="secondary" disabled={descargando} onClick={() => onDescargar('GRUPO', undefined, archivo('cada grupo'))}>
              Cada grupo
            </Button>
            <Button variant="secondary" disabled={descargando} onClick={() => onDescargar('DOCENTE', undefined, archivo('cada docente'))}>
              Cada docente
            </Button>
          </div>
        }
      />
      <div className="space-y-4">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <Select label="Ver" value={vista} onChange={(e) => setVista(e.target.value as VistaHorario)}>
            {VISTAS.map((v) => (
              <option key={v.valor} value={v.valor}>
                {v.etiqueta}
              </option>
            ))}
          </Select>
          {porEntidad && (
            <SelectBuscable
              label={vista === 'GRUPO' ? 'Grupo' : 'Docente'}
              value={elegido?.id ?? ''}
              onChange={setEntidadId}
              placeholder={vista === 'GRUPO' ? 'Buscar grupo…' : 'Buscar docente…'}
              opciones={opciones.map((o) => ({ value: o.id, label: o.nombre }))}
            />
          )}
          {porEntidad && elegido && (
            <div className="flex items-end">
              <Button variant="outline" disabled={descargando} onClick={() => onDescargar(vista as VistaPdfHorario, elegido.id, archivo(sinTildes(elegido.nombre)))}>
                <FileTextIcon className="h-4 w-4" />
                PDF de {elegido.nombre}
              </Button>
            </div>
          )}
        </div>

        <LeyendaAsignaturas catalogo={catalogo} sesiones={horario.sesiones} />
        <MallaHorario estructura={estructura} sesiones={horario.sesiones} catalogo={catalogo} vista={vista} entidadId={elegido?.id ?? ''} enConflicto={new Set()} />
      </div>
    </Card>
  );
}
