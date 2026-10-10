import { useEffect, useRef, useState } from 'react';
import { Alert, errorMessage } from '../ui/Alert';
import { Button } from '../ui/Button';
import { Card, CardHeader } from '../ui/Card';
import { Input, Select, Textarea } from '../ui/Field';
import { Spinner } from '../ui/Spinner';
import { Switch } from '../ui/Switch';
import { EmptyRow, Table, TableBody, TableHead, Td, Th } from '../ui/Table';
import { VisorDocumento } from '../ui/VisorDocumento';
import {
  ETIQUETA_ESTILO_BLOQUE,
  descargarVistaPreviaPlantilla,
  usePlantillasCertificados,
  usePublicarPlantilla,
  useRestablecerPlantilla,
  useVersionesPlantilla,
  type BloquePlantilla,
  type ClaveCertificado,
  type ContenidoPlantilla,
  type PlantillaVigente,
  type VariableCertificado,
} from '../../hooks/useCertificados';
import { ApiError } from '../../types/api';
import { formatoFechaHora } from '../../lib/fechas';

/** Los problemas que el servidor lista al rechazar una plantilla (`details`), o el mensaje si no hay lista. */
const problemasDe = (error: unknown): string[] => (error instanceof ApiError && Array.isArray(error.details) ? (error.details as string[]) : []);

/**
 * El texto de cada documento: lo edita el ADMIN y cada cambio es una versión nueva (lo ya expedido no cambia). Los datos del colegio y
 * del estudiante no se escriben aquí: se colocan con variables que el sistema toma de su módulo de origen.
 */
export function PlantillasCertificadosPanel() {
  const datos = usePlantillasCertificados();
  const [tipo, setTipo] = useState<ClaveCertificado>('CONSTANCIA_ESTUDIO');

  if (datos.isLoading) return <Spinner />;
  if (datos.isError) return <Alert tone="error">{errorMessage(datos.error)}</Alert>;
  if (!datos.data) return null;
  const plantilla = datos.data.plantillas.find((p) => p.tipo === tipo) ?? datos.data.plantillas[0];
  if (!plantilla) return null;

  return (
    <div className="space-y-4">
      <Alert tone="info">
        Aquí se redacta el texto de cada documento. El encabezado (escudo, nombre, DANE, NIT, resolución, sede, jornada y año) y el QR con la huella los pone el sistema con los datos de la institución: no se editan.
        Usa las variables para colocar datos que vienen de otros módulos. Cada publicación crea una versión nueva; los documentos ya expedidos conservan su texto.
      </Alert>
      <Select label="Documento" value={plantilla.tipo} onChange={(e) => setTipo(e.target.value as ClaveCertificado)}>
        {datos.data.plantillas.map((p) => (
          <option key={p.tipo} value={p.tipo}>
            {p.nombre}
          </option>
        ))}
      </Select>
      {/* La clave reinicia el editor cuando cambia de documento o de versión publicada. */}
      <EditorPlantilla key={`${plantilla.tipo}:${plantilla.version}`} plantilla={plantilla} variables={datos.data.variables} />
    </div>
  );
}

const copiar = (c: ContenidoPlantilla): ContenidoPlantilla => structuredClone(c);

function EditorPlantilla({ plantilla, variables }: { plantilla: PlantillaVigente; variables: VariableCertificado[] }) {
  const [borrador, setBorrador] = useState<ContenidoPlantilla>(() =>
    copiar({ titulo: plantilla.titulo, bloques: plantilla.bloques, destinatarios: plantilla.destinatarios, frase_otro: plantilla.frase_otro, vigencia_dias: plantilla.vigencia_dias })
  );
  const [nota, setNota] = useState('');
  const [problemas, setProblemas] = useState<string[]>([]);
  const [aviso, setAviso] = useState<{ tono: 'success' | 'error'; texto: string } | null>(null);
  const [previa, setPrevia] = useState<{ url: string } | null>(null);
  const [generando, setGenerando] = useState(false);
  const [verHistorial, setVerHistorial] = useState(false);
  const campos = useRef(new Map<string, HTMLTextAreaElement>());
  const [bloqueEnfocado, setBloqueEnfocado] = useState<string | null>(null);
  const publicar = usePublicarPlantilla();
  const restablecer = useRestablecerPlantilla();

  useEffect(() => {
    const url = previa?.url;
    return () => {
      if (url) URL.revokeObjectURL(url);
    };
  }, [previa?.url]);

  const aplicables = variables.filter((v) => !v.solo_en || v.solo_en.includes(plantilla.tipo));
  const origenes = [...new Set(aplicables.map((v) => v.origen))];
  const obligatorios = new Set(plantilla.requisitos.bloques);
  const cambiado = JSON.stringify(borrador) !== JSON.stringify({ titulo: plantilla.titulo, bloques: plantilla.bloques, destinatarios: plantilla.destinatarios, frase_otro: plantilla.frase_otro, vigencia_dias: plantilla.vigencia_dias });

  const cambiarBloque = (id: string, cambio: Partial<BloquePlantilla>) => setBorrador((b) => ({ ...b, bloques: b.bloques.map((x) => (x.id === id ? { ...x, ...cambio } : x)) }));
  const mover = (indice: number, delta: -1 | 1) =>
    setBorrador((b) => {
      const bloques = [...b.bloques];
      const destino = indice + delta;
      if (destino < 0 || destino >= bloques.length) return b;
      [bloques[indice], bloques[destino]] = [bloques[destino] as BloquePlantilla, bloques[indice] as BloquePlantilla];
      return { ...b, bloques };
    });
  const agregarParrafo = () =>
    setBorrador((b) => {
      let n = 1;
      while (b.bloques.some((x) => x.id === `extra-${n}`)) n += 1;
      return { ...b, bloques: [...b.bloques, { id: `extra-${n}`, estilo: 'CUERPO', texto: '', condicion: null, activo: true }] };
    });

  /** Inserta {{variable}} donde está el cursor del último párrafo que se tocó. */
  const insertarVariable = (clave: string) => {
    const id = bloqueEnfocado ?? borrador.bloques.find((b) => b.estilo !== 'TABLA_NOTAS')?.id;
    if (!id) return;
    const campo = campos.current.get(id);
    const bloque = borrador.bloques.find((b) => b.id === id);
    if (!bloque) return;
    const inicio = campo?.selectionStart ?? bloque.texto.length;
    const fin = campo?.selectionEnd ?? inicio;
    const token = `{{${clave}}}`;
    cambiarBloque(id, { texto: `${bloque.texto.slice(0, inicio)}${token}${bloque.texto.slice(fin)}` });
    requestAnimationFrame(() => {
      campo?.focus();
      campo?.setSelectionRange(inicio + token.length, inicio + token.length);
    });
  };

  const verPrevia = async () => {
    setProblemas([]);
    setAviso(null);
    setGenerando(true);
    try {
      const { url } = await descargarVistaPreviaPlantilla(plantilla.tipo, borrador);
      setPrevia({ url });
    } catch (err) {
      setProblemas(problemasDe(err));
      setAviso({ tono: 'error', texto: errorMessage(err) });
    } finally {
      setGenerando(false);
    }
  };

  const publicarVersion = async () => {
    setProblemas([]);
    setAviso(null);
    try {
      const r = await publicar.mutateAsync({ tipo: plantilla.tipo, contenido: borrador, nota });
      setAviso({ tono: 'success', texto: `Se publicó la versión ${r.version}. Los documentos que se expidan desde ahora usan este texto.` });
    } catch (err) {
      setProblemas(problemasDe(err));
      setAviso({ tono: 'error', texto: errorMessage(err) });
    }
  };

  const restablecerPartida = async () => {
    if (!window.confirm('Se publicará una versión nueva con el texto de partida del sistema. Tus versiones anteriores quedan en el historial. ¿Continuar?')) return;
    setAviso(null);
    try {
      const r = await restablecer.mutateAsync(plantilla.tipo);
      setAviso({ tono: 'success', texto: `Se restableció el texto de partida como versión ${r.version}.` });
    } catch (err) {
      setAviso({ tono: 'error', texto: errorMessage(err) });
    }
  };

  const claveDe = (etiqueta: string, existentes: string[]): string => {
    const base = etiqueta.normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase().replace(/[^A-Z0-9]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 30) || 'OPCION';
    let clave = base === 'OTRO' ? 'OTRA_OPCION' : base;
    let n = 2;
    while (existentes.includes(clave)) clave = `${base}_${n++}`;
    return clave;
  };

  return (
    <div className="space-y-4">
      <Card className="space-y-4">
        <CardHeader title={`${plantilla.nombre} · versión ${plantilla.version}`} subtitle={`Publicada el ${formatoFechaHora(plantilla.publicada_at)}. Mínimos que debe conservar: ${plantilla.requisitos.fuente}.`} />
        <div className="grid gap-3 sm:grid-cols-3">
          <div className="sm:col-span-2">
            <Input label="Título del documento" value={borrador.titulo} onChange={(e) => setBorrador((b) => ({ ...b, titulo: e.target.value }))} maxLength={100} />
          </div>
          <Input
            label="Vigencia (días)"
            type="number"
            min={1}
            max={365}
            value={borrador.vigencia_dias ?? ''}
            onChange={(e) => setBorrador((b) => ({ ...b, vigencia_dias: e.target.value === '' ? null : Number(e.target.value) }))}
            hint="Vacío = sin vigencia. Se usa con la variable «Vigencia del documento»."
          />
        </div>
      </Card>

      <Card className="space-y-3">
        <CardHeader title="Variables" subtitle="Toca una para colocarla en el párrafo donde está el cursor. El dato lo toma el sistema de su módulo de origen." />
        <div className="space-y-2">
          {origenes.map((origen) => (
            <div key={origen}>
              <p className="mb-1 text-xs font-semibold text-muted">{origen}</p>
              <div className="flex flex-wrap gap-1.5">
                {aplicables
                  .filter((v) => v.origen === origen)
                  .map((v) => (
                    <button key={v.clave} type="button" title={`${v.clave} — ejemplo: ${v.ejemplo}`} onClick={() => insertarVariable(v.clave)} className="rounded-full bg-primary-soft px-3 py-1 text-xs font-medium text-primary hover:bg-primary hover:text-white">
                      {v.etiqueta}
                    </button>
                  ))}
              </div>
            </div>
          ))}
        </div>
      </Card>

      <Card className="space-y-4">
        <CardHeader title="Texto del documento" subtitle="Los bloques se dibujan en este orden. Un bloque con condición solo aparece si hay (o no hay) ese dato." />
        {borrador.bloques.map((b, indice) => {
          const esObligatorio = obligatorios.has(b.id);
          return (
            <div key={b.id} className="space-y-2 rounded-lg border border-border p-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-sm font-semibold text-ink">
                  {ETIQUETA_ESTILO_BLOQUE[b.estilo]} <span className="text-xs font-normal text-muted">({b.id}{esObligatorio ? ' · obligatorio' : ''})</span>
                </p>
                <div className="flex flex-wrap items-center gap-2">
                  <Button type="button" variant="secondary" className="px-2 py-0.5 text-xs" disabled={indice === 0} onClick={() => mover(indice, -1)}>
                    Subir
                  </Button>
                  <Button type="button" variant="secondary" className="px-2 py-0.5 text-xs" disabled={indice === borrador.bloques.length - 1} onClick={() => mover(indice, 1)}>
                    Bajar
                  </Button>
                  {!esObligatorio && b.id.startsWith('extra-') && (
                    <Button type="button" variant="soft-danger" className="px-2 py-0.5 text-xs" onClick={() => setBorrador((x) => ({ ...x, bloques: x.bloques.filter((y) => y.id !== b.id) }))}>
                      Quitar
                    </Button>
                  )}
                </div>
              </div>
              {b.estilo === 'TABLA_NOTAS' ? (
                <p className="text-xs text-muted">Aquí va la tabla de valoraciones. La arma el módulo de notas con la escala de la institución (qué columnas, decimales y equivalencia nacional); este bloque solo fija en qué lugar del documento se coloca.</p>
              ) : (
                <Textarea
                  label="Texto"
                  hideLabel
                  rows={b.estilo === 'FORMULA' ? 1 : 3}
                  value={b.texto}
                  ref={(el) => {
                    if (el) campos.current.set(b.id, el);
                    else campos.current.delete(b.id);
                  }}
                  onFocus={() => setBloqueEnfocado(b.id)}
                  onChange={(e) => cambiarBloque(b.id, { texto: e.target.value })}
                  maxLength={1500}
                />
              )}
              <div className="grid gap-3 sm:grid-cols-2">
                <Select
                  label="Se muestra"
                  value={b.condicion ? b.condicion.tipo : 'SIEMPRE'}
                  onChange={(e) => cambiarBloque(b.id, { condicion: e.target.value === 'SIEMPRE' ? null : { tipo: e.target.value as 'HAY' | 'NO_HAY', variable: b.condicion?.variable ?? aplicables[0]?.clave ?? '' } })}
                >
                  <option value="SIEMPRE">Siempre</option>
                  <option value="HAY">Solo si hay este dato…</option>
                  <option value="NO_HAY">Solo si NO hay este dato…</option>
                </Select>
                {b.condicion && (
                  <Select label="Dato" value={b.condicion.variable} onChange={(e) => cambiarBloque(b.id, { condicion: { tipo: b.condicion!.tipo, variable: e.target.value } })}>
                    {aplicables.map((v) => (
                      <option key={v.clave} value={v.clave}>
                        {v.etiqueta}
                      </option>
                    ))}
                  </Select>
                )}
              </div>
              <Switch label="Bloque activo" checked={b.activo} onChange={(valor) => cambiarBloque(b.id, { activo: valor })} disabled={esObligatorio} disabledReason={esObligatorio ? 'Es obligatorio en este documento.' : null} />
            </div>
          );
        })}
        <Button type="button" variant="outline" onClick={agregarParrafo} disabled={borrador.bloques.length >= 14}>
          Agregar párrafo
        </Button>
      </Card>

      <Card className="space-y-3">
        <CardHeader title="Destinatario o motivo" subtitle="Las opciones que ve la secretaria al expedir; la primera es la predeterminada. «Otro (especificar…)» siempre se agrega al final." />
        {borrador.destinatarios.map((d, i) => (
          <div key={d.clave} className="grid gap-2 sm:grid-cols-[1fr_2fr_auto] sm:items-end">
            <Input label="Nombre en el selector" value={d.etiqueta} maxLength={80} onChange={(e) => setBorrador((b) => ({ ...b, destinatarios: b.destinatarios.map((x, j) => (j === i ? { ...x, etiqueta: e.target.value } : x)) }))} />
            <Input label="Frase del documento" value={d.frase} maxLength={200} onChange={(e) => setBorrador((b) => ({ ...b, destinatarios: b.destinatarios.map((x, j) => (j === i ? { ...x, frase: e.target.value } : x)) }))} />
            <Button type="button" variant="soft-danger" className="px-3 py-2 text-xs" disabled={borrador.destinatarios.length <= 1} onClick={() => setBorrador((b) => ({ ...b, destinatarios: b.destinatarios.filter((_, j) => j !== i) }))}>
              Quitar
            </Button>
          </div>
        ))}
        <Button
          type="button"
          variant="outline"
          disabled={borrador.destinatarios.length >= 12}
          onClick={() => setBorrador((b) => ({ ...b, destinatarios: [...b.destinatarios, { clave: claveDe(`Nueva opción ${b.destinatarios.length + 1}`, b.destinatarios.map((x) => x.clave)), etiqueta: `Nueva opción ${b.destinatarios.length + 1}`, frase: 'Se expide para ' }] }))}
        >
          Agregar opción
        </Button>
        <Input label="Frase cuando eligen «Otro»" value={borrador.frase_otro} maxLength={200} onChange={(e) => setBorrador((b) => ({ ...b, frase_otro: e.target.value }))} hint="{texto} es lo que escriba quien expide. Si lo deja vacío se usa la primera opción." />
      </Card>

      {aviso && <Alert tone={aviso.tono}>{aviso.texto}</Alert>}
      {problemas.length > 0 && (
        <Alert tone="error">
          <ul className="list-disc space-y-1 pl-4">
            {problemas.map((p) => (
              <li key={p}>{p}</li>
            ))}
          </ul>
        </Alert>
      )}

      <Card className="space-y-3">
        <div className="grid gap-3 sm:grid-cols-[1fr_auto] sm:items-end">
          <Input label="Nota del cambio (opcional)" value={nota} onChange={(e) => setNota(e.target.value)} maxLength={300} placeholder="Ej. Se agrega la vigencia de 30 días" />
          <div className="flex flex-wrap gap-2">
            <Button type="button" variant="secondary" onClick={verPrevia} isLoading={generando}>
              Vista previa
            </Button>
            <Button type="button" onClick={publicarVersion} isLoading={publicar.isPending} disabled={!cambiado}>
              Publicar versión nueva
            </Button>
          </div>
        </div>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <Button type="button" variant="soft-danger" className="px-3 py-1 text-xs" onClick={restablecerPartida} isLoading={restablecer.isPending}>
            Restablecer el texto de partida
          </Button>
          <Button type="button" variant="secondary" className="px-3 py-1 text-xs" onClick={() => setVerHistorial((v) => !v)}>
            {verHistorial ? 'Ocultar historial' : 'Ver historial de versiones'}
          </Button>
        </div>
      </Card>

      {previa && (
        <Card>
          <VisorDocumento url={previa.url} titulo="Vista previa con un estudiante inventado (no tiene validez)" nombreArchivo="vista-previa-plantilla.pdf" />
        </Card>
      )}
      {verHistorial && <HistorialVersiones tipo={plantilla.tipo} />}
    </div>
  );
}

function HistorialVersiones({ tipo }: { tipo: ClaveCertificado }) {
  const versiones = useVersionesPlantilla(tipo);
  if (versiones.isLoading) return <Spinner />;
  if (versiones.isError) return <Alert tone="error">{errorMessage(versiones.error)}</Alert>;
  return (
    <Table>
      <TableHead>
        <tr>
          <Th>Versión</Th>
          <Th>Publicada</Th>
          <Th>Por</Th>
          <Th>Nota</Th>
          <Th>Huella</Th>
        </tr>
      </TableHead>
      <TableBody>
        {versiones.data?.map((v) => (
          <tr key={v.version}>
            <Td className="font-semibold text-ink">
              v{v.version} {v.estado === 'VIGENTE' && <span className="text-xs font-normal text-success">vigente</span>}
            </Td>
            <Td>{formatoFechaHora(v.publicada_at)}</Td>
            <Td>{v.publicada_por ?? '—'}</Td>
            <Td>{v.nota || '—'}</Td>
            <Td className="font-mono text-xs">{v.hash}</Td>
          </tr>
        ))}
        {versiones.data?.length === 0 && <EmptyRow colSpan={5}>Sin versiones.</EmptyRow>}
      </TableBody>
    </Table>
  );
}
