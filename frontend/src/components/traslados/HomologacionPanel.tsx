import { useEffect, useMemo, useState } from 'react';
import {
  type DetalleTraslado,
  type ErrorHomologacion,
  type FilaHomologacionInput,
  type ResultadoPeriodo,
  MAX_BYTES_SOPORTE_TRASLADO,
  MIN_LONGITUD_MOTIVO_TRASLADO,
  NOMBRES_ESTADO_TRASLADO,
  abrirSoporteTraslado,
  useCargarSoporteTraslado,
  useGuardarHomologacion,
  useQuitarSoporteTraslado,
  useVistaPreviaHomologacion,
} from '../../hooks/useTraslados';
import { ApiError } from '../../types/api';
import { formatoFechaHora } from '../../lib/fechas';
import { Alert, errorMessage } from '../ui/Alert';
import { Chip } from '../ui/Badge';
import { Button } from '../ui/Button';
import { Card } from '../ui/Card';
import { Dropzone } from '../ui/Dropzone';
import { Input, Textarea } from '../ui/Field';
import { IconButton } from '../ui/IconButton';
import { Switch } from '../ui/Switch';
import { EmptyRow, Table, TableBody, TableHead, Td, Th } from '../ui/Table';
import { EyeIcon, TrashIcon } from '../ui/icons';

interface EstadoFila {
  exenta: boolean;
  motivo: string;
  asignatura_origen: string;
  valores: string[];
}

function inicial(detalle: DetalleTraslado): Record<string, EstadoFila> {
  const cantidad = detalle.periodos_origen.length;
  return Object.fromEntries(
    detalle.filas.map((f) => {
      const valores = Array.from({ length: cantidad }, () => '');
      for (const v of f.valores) valores[v.indice_origen] = v.valor_original;
      return [f.subject_id, { exenta: f.exenta, motivo: f.motivo, asignatura_origen: f.asignatura_origen, valores }];
    })
  );
}

function CeldaResultado({ r }: { r: ResultadoPeriodo | undefined }) {
  if (!r) return <span className="text-muted">—</span>;
  if (r.estado === 'EXENTA_POR_TRASLADO') return <Chip tone="orange">Exenta</Chip>;
  if (r.estado === 'PENDIENTE') return <span className="text-xs text-muted" title={r.faltan?.length ? `Falta: ${r.faltan.join(', ')}` : undefined}>Pendiente</span>;
  return (
    <span title={r.fuentes.map((f) => `${f.periodo_origen}: ${f.valor_original} (${f.escala.nombre}) → ${f.nota_convertida}`).join('\n')}>
      <span className="font-semibold text-ink">{r.nota?.toFixed(2)}</span> <Chip tone="green">H</Chip>
    </span>
  );
}

/**
 * Registro de notas homologadas / históricas (M12): la nota de cada asignatura en los periodos de origen se escribe tal cual
 * viene del certificado y el servidor la convierte a la escala de este colegio. Entra como definitiva del periodo; el docente
 * no califica nada. Una asignatura que el otro colegio no dictaba se marca exenta: no promedia ni cuenta como perdida.
 */
export function HomologacionPanel({ detalle }: { detalle: DetalleTraslado }) {
  const [filas, setFilas] = useState<Record<string, EstadoFila>>(() => inicial(detalle));
  const [motivoCambio, setMotivoCambio] = useState('');
  const [vista, setVista] = useState<Map<string, ResultadoPeriodo> | null>(null);
  const [errores, setErrores] = useState<ErrorHomologacion[]>([]);
  const vistaPrevia = useVistaPreviaHomologacion();
  const guardar = useGuardarHomologacion();
  const cargarSoporte = useCargarSoporteTraslado();
  const quitarSoporte = useQuitarSoporteTraslado();
  const [archivo, setArchivo] = useState<File | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);

  // Al guardar o al cambiar de traslado el servidor devuelve el detalle: la matriz vuelve a partir de lo guardado.
  useEffect(() => {
    setFilas(inicial(detalle));
    setVista(null);
    setErrores([]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [detalle._id, detalle.filas]);

  const cambiar = (id: string, parcial: Partial<EstadoFila>) => {
    setVista(null);
    setAviso(null);
    setFilas((f) => ({ ...f, [id]: { ...(f[id] as EstadoFila), ...parcial } }));
  };

  const filasAEnviar = useMemo((): FilaHomologacionInput[] => {
    return detalle.filas
      .filter((f) => {
        const e = filas[f.subject_id];
        const guardada = f.exenta || f.valores.length > 0;
        return Boolean(e && (e.exenta || e.valores.some((v) => v.trim()) || guardada));
      })
      .map((f) => {
        const e = filas[f.subject_id] as EstadoFila;
        return {
          subject_id: f.subject_id,
          exenta: e.exenta,
          motivo: e.exenta ? e.motivo : undefined,
          asignatura_origen: e.asignatura_origen,
          valores: e.valores.map((v, i) => ({ indice_origen: i, valor_original: v })).filter((v) => v.valor_original.trim()),
        };
      });
  }, [detalle.filas, filas]);

  const conErrores = (e: unknown) => {
    setErrores(e instanceof ApiError && Array.isArray(e.details) ? (e.details as ErrorHomologacion[]) : []);
  };

  const calcular = () => {
    setErrores([]);
    vistaPrevia.mutate(
      { id: detalle._id, filas: filasAEnviar },
      {
        onSuccess: (r) => {
          setErrores(r.errores);
          setVista(new Map(r.resultados.map((x) => [`${x.subject_id}|${x.periodo_numero}`, x])));
        },
      }
    );
  };

  const enviar = () => {
    setAviso(null);
    guardar.mutate(
      { id: detalle._id, filas: filasAEnviar, motivo_cambio: motivoCambio },
      { onSuccess: () => { setMotivoCambio(''); setAviso('Homologación guardada.'); }, onError: conErrores }
    );
  };

  const resultadoDe = (subjectId: string, periodo: number): ResultadoPeriodo | undefined =>
    vista?.get(`${subjectId}|${periodo}`) ?? detalle.filas.find((f) => f.subject_id === subjectId)?.resultados.find((r) => r.periodo_numero === periodo);

  const escala = detalle.escala;
  const descripcionEscala =
    escala.tipo === 'INSTITUCIONAL' ? `la escala de este colegio (${escala.valor_minimo} a ${escala.valor_maximo})` : escala.tipo === 'CONCEPTUAL' ? `${escala.nombre} (conceptos)` : `${escala.nombre} (${escala.valor_minimo} a ${escala.valor_maximo})`;
  const bloqueado = !detalle.editable;
  const hayCorrecciones = detalle.filas.some((f) => f.resultados.some((r) => r.estado !== 'PENDIENTE'));
  const historial = detalle.filas.flatMap((f) => f.resultados.flatMap((r) => (r.historial ?? []).map((h) => ({ ...h, asignatura: f.nombre, periodo: r.periodo_numero }))));

  if (detalle.periodos.length === 0) {
    return <Alert tone="info">Ingresó en el primer periodo: no hay periodos anteriores que homologar.</Alert>;
  }

  return (
    <div className="space-y-4">
      <Card>
        <div className="space-y-3">
          <p className="text-sm text-body">
            Escribe cada nota tal como aparece en el certificado de <strong>{detalle.institucion_procedencia.nombre}</strong>; se convierte a {descripcionEscala} y entra como la definitiva del periodo.
            Deja vacía una nota que el certificado no trae. Marca <strong>Exenta</strong> la asignatura que allá no se dictaba.
          </p>
          <div className="space-y-2">
            <span className="text-label text-body">Soportes del traslado (certificado de notas, boletines)</span>
            {detalle.soportes.map((s) => (
              <div key={s._id} className="flex items-center justify-between rounded-lg bg-soft px-3 py-2 text-sm">
                <span>{s.nombre} <span className="text-xs text-muted">· {formatoFechaHora(s.fecha)}</span></span>
                <span className="flex gap-2">
                  <IconButton tone="edit" label="Ver" onClick={() => void abrirSoporteTraslado(detalle._id, s._id)} icon={<EyeIcon className="h-4 w-4" />} />
                  <IconButton tone="danger" label="Quitar" disabled={bloqueado} onClick={() => quitarSoporte.mutate({ id: detalle._id, soporteId: s._id })} icon={<TrashIcon className="h-4 w-4" />} />
                </span>
              </div>
            ))}
            {!bloqueado && (
              <Dropzone
                extensiones={['.pdf', '.jpg', '.jpeg', '.png', '.webp']}
                maxBytes={MAX_BYTES_SOPORTE_TRASLADO}
                file={archivo}
                etiqueta="Soporte del traslado"
                hint="PDF, JPG, PNG o WEBP, hasta 5 MB"
                onFile={(f) => {
                  setArchivo(f);
                  if (f) cargarSoporte.mutate({ id: detalle._id, file: f }, { onSettled: () => setArchivo(null) });
                }}
              />
            )}
            {(cargarSoporte.error || quitarSoporte.error) && <Alert tone="error">{errorMessage(cargarSoporte.error ?? quitarSoporte.error)}</Alert>}
          </div>
        </div>
      </Card>

      {bloqueado && <Alert tone="warning">El año lectivo está cerrado: la homologación es de solo lectura.</Alert>}

      <Table>
        <TableHead>
          <tr>
            <Th>Asignatura</Th>
            <Th>Exenta</Th>
            <Th>Notas del colegio de origen ({escala.nombre})</Th>
            {detalle.periodos.map((p) => <Th key={p.numero}>{p.nombre}</Th>)}
          </tr>
        </TableHead>
        <TableBody>
          {detalle.filas.length === 0 && <EmptyRow colSpan={3 + detalle.periodos.length}>El grupo del estudiante no tiene plan de estudios.</EmptyRow>}
          {detalle.filas.map((f) => {
            const e = filas[f.subject_id];
            if (!e) return null;
            return (
              <tr key={f.subject_id} className="align-top">
                <Td>
                  <span className="block font-semibold text-ink">{f.nombre}</span>
                  <span className="block text-xs text-muted">{f.area}</span>
                </Td>
                <Td>
                  <Switch checked={e.exenta} onChange={(v) => cambiar(f.subject_id, { exenta: v })} label="Exenta" disabled={bloqueado} />
                </Td>
                <Td>
                  {e.exenta ? (
                    <Input label={`Motivo de exención de ${f.nombre}`} hideLabel placeholder="Ej.: el colegio de origen no dictaba esta asignatura" value={e.motivo} onChange={(ev) => cambiar(f.subject_id, { motivo: ev.target.value })} disabled={bloqueado} />
                  ) : (
                    <div className="flex flex-wrap gap-2">
                      {detalle.periodos_origen.map((p, i) => (
                        <div key={i} className="w-24">
                          <Input label={`${f.nombre}: ${p.nombre}`} hideLabel placeholder={p.nombre} title={p.nombre} value={e.valores[i] ?? ''}
                            onChange={(ev) => cambiar(f.subject_id, { valores: e.valores.map((v, k) => (k === i ? ev.target.value : v)) })} disabled={bloqueado} />
                          <span className="block truncate text-[10px] text-muted">{p.nombre}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </Td>
                {detalle.periodos.map((p) => <Td key={p.numero}><CeldaResultado r={resultadoDe(f.subject_id, p.numero)} /></Td>)}
              </tr>
            );
          })}
        </TableBody>
      </Table>

      {errores.length > 0 && (
        <Alert tone="error">
          <p className="font-semibold">No se pudieron convertir {errores.length} nota(s):</p>
          <ul className="list-disc pl-5">
            {errores.map((er, i) => <li key={i}>{er.asignatura} · {er.periodo_origen}: {er.mensaje}</li>)}
          </ul>
        </Alert>
      )}
      {guardar.error && errores.length === 0 && <Alert tone="error">{errorMessage(guardar.error)}</Alert>}
      {vistaPrevia.error && <Alert tone="error">{errorMessage(vistaPrevia.error)}</Alert>}
      {aviso && <Alert tone="success">{aviso}</Alert>}

      {!bloqueado && (
        <Card>
          <div className="space-y-3">
            {hayCorrecciones && (
              <Textarea
                label="Motivo del cambio"
                rows={2}
                value={motivoCambio}
                onChange={(e) => setMotivoCambio(e.target.value)}
                hint={`Obligatorio si corriges o quitas notas ya registradas (mínimo ${MIN_LONGITUD_MOTIVO_TRASLADO} caracteres). La nota anterior y su escala quedan en el historial.`}
              />
            )}
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={calcular} isLoading={vistaPrevia.isPending} disabled={filasAEnviar.length === 0}>Ver cómo quedaría</Button>
              <Button onClick={enviar} isLoading={guardar.isPending} disabled={filasAEnviar.length === 0}>Guardar homologación</Button>
            </div>
          </div>
        </Card>
      )}

      {historial.length > 0 && (
        <Card>
          <div className="space-y-2">
            <span className="text-label text-body">Historial de correcciones</span>
            <ul className="space-y-1 text-sm text-body">
              {historial.map((h, i) => (
                <li key={i}>
                  <strong>{h.asignatura}</strong> · periodo {h.periodo}: antes {NOMBRES_ESTADO_TRASLADO[h.estado_anterior].toLowerCase()}
                  {h.nota_anterior !== null ? ` ${h.nota_anterior}` : ''}
                  {h.fuentes_anteriores.length > 0 ? ` (${h.fuentes_anteriores.map((x) => `${x.periodo_origen}: ${x.valor_original} en ${x.escala.nombre}`).join('; ')})` : ''}
                  {' '}— {h.por || 'sistema'}, {formatoFechaHora(h.fecha)}. Motivo: {h.motivo}
                </li>
              ))}
            </ul>
          </div>
        </Card>
      )}
    </div>
  );
}
