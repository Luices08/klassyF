import { useState } from 'react';
import { Link } from 'react-router-dom';
import { formatoDiaCorto } from '../../lib/actividades';
import { colorPastelDeAsignatura, obtenerEstiloAsignatura } from '../../lib/asignaturasEstilos';
import type { AsignaturaDeMisNotas, CasillaDeMisNotas } from '../../hooks/useNotas';
import { Chip, DesempenoBadge, EstadoEntregaBadge, TipoActividadChip } from '../ui/Badge';
import { Button } from '../ui/Button';
import { Card } from '../ui/Card';
import { Drawer } from '../ui/Drawer';
import { ChipRecuperacion, FranjaRecuperacion } from './FranjaRecuperacion';

export const formatoNota = (nota: number | null): string => (nota === null ? '—' : nota.toFixed(2));

/** Rojo solo cuando la nota está por debajo de la aprobatoria del colegio; el resto va en el color de título. */
export const colorDeNota = (nota: number | null, aprobatoria: number): string => (nota !== null && aprobatoria > 0 && nota < aprobatoria ? 'text-danger' : 'text-ink');

interface TarjetaNotasAsignaturaProps {
  asignatura: AsignaturaDeMisNotas;
  aprobatoria: number;
  /** El texto se dirige a la familia (portal del acudiente) en lugar de al estudiante. */
  paraFamilia?: boolean;
  /**
   * Cuántas de las últimas notas calificadas se muestran en la tarjeta (tamaño siempre igual) con un botón que abre las notas completas
   * de la asignatura. Sin esta opción la tarjeta trae todos los bloques, como en el portal del acudiente.
   */
  ultimasNotas?: number;
}

interface NotaReciente {
  casilla: CasillaDeMisNotas;
  bloque: string;
}

/**
 * Las últimas notas ya calificadas, de la más reciente a la más antigua. La fecha de la actividad es lo único con lo que cuenta la
 * casilla para ordenarse: las notas sueltas (sin fecha) van al final.
 */
function ultimasNotasCalificadas(asignatura: AsignaturaDeMisNotas, cantidad: number): NotaReciente[] {
  const calificadas = asignatura.bloques.flatMap((b) => b.casillas.filter((c) => c.nota !== null).map((casilla) => ({ casilla, bloque: b.nombre })));
  const tiempo = (n: NotaReciente) => (n.casilla.fecha_entrega ? new Date(n.casilla.fecha_entrega).getTime() : Number.NEGATIVE_INFINITY);
  return calificadas.sort((a, b) => tiempo(b) - tiempo(a)).slice(0, cantidad);
}

const AVISO_PRESENCIAL = 'Es una tarea presencial: se trabaja y se califica en clase, no hay nada que entregar en la plataforma.';

/**
 * Una casilla de nota. En «Mis notas» el estudiante toca una actividad virtual y va a su página; una tarea presencial no tiene
 * página (se trabaja en clase), así que solo explica que no hay nada que entregar.
 */
function FilaCasilla({ casilla, aprobatoria, enlazar }: { casilla: CasillaDeMisNotas; aprobatoria: number; enlazar: boolean }) {
  const [aviso, setAviso] = useState(false);
  const esActividad = enlazar && casilla.tipo === 'ACTIVIDAD';
  const titulo =
    esActividad && casilla.requiere_entrega ? (
      <Link to={`/mis-actividades/${casilla.id}`} className="text-sm font-medium text-primary hover:underline">
        {casilla.titulo}
      </Link>
    ) : esActividad ? (
      <button type="button" aria-expanded={aviso} onClick={() => setAviso((v) => !v)} className="text-sm font-medium text-ink hover:underline">
        {casilla.titulo}
      </button>
    ) : (
      <span className="text-sm font-medium text-ink">{casilla.titulo}</span>
    );

  return (
    <li className="px-4 py-2.5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            {titulo}
            {casilla.tipo_actividad && <TipoActividadChip value={casilla.tipo_actividad} />}
            {casilla.entrega && casilla.nota === null && <EstadoEntregaBadge value={casilla.entrega} />}
          </div>
          <p className="text-xs text-muted">
            Pesa {casilla.peso_efectivo}% del bloque
            {casilla.fecha_entrega ? ` · entrega ${formatoDiaCorto(casilla.fecha_entrega)}` : ''}
          </p>
        </div>
        <span className={`text-sm font-semibold ${casilla.nota === null ? 'text-muted' : colorDeNota(casilla.nota, aprobatoria)}`}>
          {casilla.nota === null ? 'Sin calificar' : formatoNota(casilla.nota)}
        </span>
      </div>
      {aviso && <p className="mt-1.5 rounded-lg bg-soft px-3 py-2 text-xs text-muted">{AVISO_PRESENCIAL}</p>}
    </li>
  );
}

function EncabezadoNota({ asignatura, aprobatoria, paraFamilia, conAviso = true }: { asignatura: AsignaturaDeMisNotas; aprobatoria: number; paraFamilia: boolean; conAviso?: boolean }) {
  const definitiva = asignatura.estado === 'CERRADO' || asignatura.estado === 'DEFINITIVO';
  const docente = asignatura.asignacion?.docente;
  const nombreAsignatura = asignatura.asignacion?.asignatura?.nombre ?? 'Asignatura';
  const { Icon } = obtenerEstiloAsignatura(nombreAsignatura);
  const color = colorPastelDeAsignatura(nombreAsignatura);
  return (
    <>
      <div className="flex flex-wrap items-start justify-between gap-3">
        {!paraFamilia && (
          <div
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl"
            style={{ backgroundColor: color.fondo, color: color.icono }}
            aria-hidden="true"
          >
            <Icon className="h-5 w-5" />
          </div>
        )}
        <div className="min-w-0 flex-1">
          <h2 className="text-h3 truncate text-ink" title={asignatura.asignacion?.asignatura?.nombre}>
            {asignatura.asignacion?.asignatura?.nombre ?? 'Asignatura'}
          </h2>
          {docente && (
            <p className="text-sm text-muted">
              {docente.nombre} {docente.apellido}
            </p>
          )}
        </div>
        <div className="flex flex-wrap items-center justify-end gap-2">
          {asignatura.desempeno && <DesempenoBadge value={asignatura.desempeno} />}
          {asignatura.recuperacion && <ChipRecuperacion recuperacion={asignatura.recuperacion} />}
          <Chip tone={definitiva ? 'blue' : 'orange'}>{definitiva ? 'Nota final' : asignatura.nota_asignatura === null ? 'Sin notas aún' : 'Provisional'}</Chip>
          <span className={`text-h2 ${colorDeNota(asignatura.nota_asignatura, aprobatoria)}`}>{formatoNota(asignatura.nota_asignatura)}</span>
        </div>
      </div>
      {asignatura.recuperacion && <FranjaRecuperacion recuperacion={asignatura.recuperacion} paraFamilia={paraFamilia} />}
      {conAviso && asignatura.parcial && (
        <p className="mt-2 text-xs text-muted">
          Esta nota se calcula con lo calificado hasta ahora; puede cambiar cuando {paraFamilia ? 'el docente' : 'tu docente'} califique el resto.
        </p>
      )}
    </>
  );
}

function BloquesDeNota({ asignatura, aprobatoria, paraFamilia }: { asignatura: AsignaturaDeMisNotas; aprobatoria: number; paraFamilia: boolean }) {
  return (
    <div className="space-y-4">
      {asignatura.bloques.map((bloque) => (
        <div key={bloque.clave} className="rounded-lg border border-border">
          <div className="flex items-center justify-between gap-3 rounded-t-lg bg-primary-soft px-4 py-2">
            <p className="text-sm font-semibold text-ink">
              {bloque.nombre} <span className="font-normal text-muted">· vale {bloque.porcentaje}% de la nota</span>
            </p>
            <p className={`text-sm font-semibold ${colorDeNota(bloque.nota, aprobatoria)}`}>{formatoNota(bloque.nota)}</p>
          </div>
          {bloque.casillas.length === 0 ? (
            <p className="px-4 py-3 text-sm text-muted">{paraFamilia ? 'El docente' : 'Tu docente'} aún no ha registrado notas en este bloque.</p>
          ) : (
            <ul className="divide-y divide-border">
              {bloque.casillas.map((casilla) => (
                <FilaCasilla key={casilla.id} casilla={casilla} aprobatoria={aprobatoria} enlazar={!paraFamilia} />
              ))}
            </ul>
          )}
        </div>
      ))}
    </div>
  );
}

/**
 * Una asignatura con sus bloques del molde y la nota de cada casilla (el estudiante en «Mis notas» y el acudiente en el portal).
 * Con `ultimasNotas` queda como resumen de tamaño fijo y las notas completas se abren en un panel lateral.
 */
export function TarjetaNotasAsignatura({ asignatura, aprobatoria, paraFamilia = false, ultimasNotas }: TarjetaNotasAsignaturaProps) {
  const [verCompletas, setVerCompletas] = useState(false);

  if (ultimasNotas === undefined) {
    return (
      <Card>
        <EncabezadoNota asignatura={asignatura} aprobatoria={aprobatoria} paraFamilia={paraFamilia} />
        <div className="mt-4">
          <BloquesDeNota asignatura={asignatura} aprobatoria={aprobatoria} paraFamilia={paraFamilia} />
        </div>
      </Card>
    );
  }

  const recientes = ultimasNotasCalificadas(asignatura, ultimasNotas);
  const huecos = Math.max(0, ultimasNotas - recientes.length);
  const nombre = asignatura.asignacion?.asignatura?.nombre ?? 'Asignatura';
  const totalCasillas = asignatura.bloques.reduce((t, b) => t + b.casillas.length, 0);

  return (
    <Card className="flex flex-col border-2!" style={{ borderColor: colorPastelDeAsignatura(nombre).borde }}>
      {/* Sin el aviso de nota parcial (va en el panel de notas completas) para que todas las tarjetas midan lo mismo. */}
      <EncabezadoNota asignatura={asignatura} aprobatoria={aprobatoria} paraFamilia={paraFamilia} conAviso={false} />

      <div className="mt-4 flex-1">
        <p className="mb-1.5 text-xs font-semibold uppercase tracking-wider text-muted">Últimas notas</p>
        <ul className="divide-y divide-border rounded-lg border border-border">
          {recientes.map(({ casilla, bloque }) => (
            <li key={casilla.id} className="flex h-14 items-center justify-between gap-3 px-4">
              <div className="min-w-0">
                <p className="truncate text-sm font-medium text-ink" title={casilla.titulo}>
                  {casilla.titulo}
                </p>
                <p className="truncate text-xs text-muted">
                  {bloque} · pesa {casilla.peso_efectivo}%
                </p>
              </div>
              <span className={`text-sm font-semibold ${colorDeNota(casilla.nota, aprobatoria)}`}>{formatoNota(casilla.nota)}</span>
            </li>
          ))}
          {Array.from({ length: huecos }, (_, i) => (
            <li key={`hueco-${i}`} className="flex h-14 items-center px-4 text-xs text-muted">
              {i === 0 && recientes.length === 0 ? `${paraFamilia ? 'El docente' : 'Tu docente'} aún no ha calificado notas en este periodo.` : ''}
            </li>
          ))}
        </ul>
      </div>

      <div className="mt-4 flex items-center justify-between gap-3">
        <p className="text-xs text-muted">
          {totalCasillas} {totalCasillas === 1 ? 'nota registrada' : 'notas registradas'} en total
        </p>
        <Button type="button" variant="outline" onClick={() => setVerCompletas(true)}>
          Ver notas completas
        </Button>
      </div>

      <Drawer open={verCompletas} onClose={() => setVerCompletas(false)} title={nombre} subtitle="Todas las notas de la asignatura en este periodo" size="lg">
        <EncabezadoNota asignatura={asignatura} aprobatoria={aprobatoria} paraFamilia={paraFamilia} />
        <BloquesDeNota asignatura={asignatura} aprobatoria={aprobatoria} paraFamilia={paraFamilia} />
      </Drawer>
    </Card>
  );
}
