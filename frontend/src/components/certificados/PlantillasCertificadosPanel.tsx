import { useEffect, useRef, useState } from 'react';
import { Alert, errorMessage } from '../ui/Alert';
import { Chip } from '../ui/Badge';
import { Button } from '../ui/Button';
import { Card } from '../ui/Card';
import { Drawer } from '../ui/Drawer';
import { Input, Select } from '../ui/Field';
import { Spinner } from '../ui/Spinner';
import { TabPanel, Tabs } from '../ui/Tabs';
import { VisorDocumento } from '../ui/VisorDocumento';
import type { EditorConVariablesHandle } from '../ui/EditorConVariables';
import { DatosDelSistema } from './plantillas/DatosDelSistema';
import { DisenoPlantillaCard } from './plantillas/DisenoPlantilla';
import { DestinatariosPlantilla } from './plantillas/DestinatariosPlantilla';
import { HistorialVersiones } from './plantillas/HistorialVersiones';
import { ParrafoPlantilla } from './plantillas/ParrafoPlantilla';
import { PublicarPlantillaDrawer } from './plantillas/PublicarPlantillaDrawer';
import { VistaEnVivoPlantilla } from './VistaEnVivoPlantilla';
import {
  ETIQUETA_ESTILO_BLOQUE,
  descargarVistaPreviaPlantilla,
  pedirPlantillaEstandar,
  usePlantillasCertificados,
  usePublicarPlantilla,
  variableAplica,
  useRenderPlantilla,
  type BloquePlantilla,
  type ClaveCertificado,
  type ContenidoPlantilla,
  DISENO_INICIAL,
  type PlantillaVigente,
  type VariableCertificado,
} from '../../hooks/useCertificados';
import { useDebouncedValue } from '../../hooks/useDebouncedValue';
import { ApiError } from '../../types/api';
import { formatoFechaHora } from '../../lib/fechas';

/** Los problemas que el servidor lista al rechazar una plantilla (`details`), o el mensaje si no hay lista. */
const problemasDe = (error: unknown): string[] => (error instanceof ApiError && Array.isArray(error.details) ? (error.details as string[]) : []);

const copiar = (c: ContenidoPlantilla): ContenidoPlantilla => structuredClone(c);
const contenidoDe = (p: PlantillaVigente): ContenidoPlantilla => ({ titulo: p.titulo, bloques: p.bloques, destinatarios: p.destinatarios, frase_otro: p.frase_otro, vigencia_dias: p.vigencia_dias, diseno: p.diseno ?? null });

/** Lo que cambió respecto a la versión vigente, en palabras de secretaría. */
function resumenDeCambios(vigente: ContenidoPlantilla, borrador: ContenidoPlantilla): string[] {
  const cambios: string[] = [];
  if (vigente.titulo !== borrador.titulo) cambios.push(`Título: «${borrador.titulo}»`);
  if (vigente.vigencia_dias !== borrador.vigencia_dias) cambios.push(borrador.vigencia_dias ? `Vigencia: ${borrador.vigencia_dias} días` : 'Sin vigencia');
  const antes = new Map(vigente.bloques.map((b) => [b.id, b]));
  const nombre = (b: BloquePlantilla) => ETIQUETA_ESTILO_BLOQUE[b.estilo];
  for (const b of borrador.bloques) {
    const previo = antes.get(b.id);
    if (!previo) cambios.push(`Párrafo agregado (${nombre(b)})`);
    else if (previo.texto !== b.texto || previo.activo !== b.activo || JSON.stringify(previo.condicion) !== JSON.stringify(b.condicion)) cambios.push(`Cambia: ${nombre(b)}`);
  }
  for (const b of vigente.bloques) if (!borrador.bloques.some((x) => x.id === b.id)) cambios.push(`Párrafo quitado (${nombre(b)})`);
  if (vigente.bloques.map((b) => b.id).join() !== borrador.bloques.filter((b) => antes.has(b.id)).map((b) => b.id).join() && borrador.bloques.length === vigente.bloques.length) cambios.push('Cambia el orden de los párrafos');
  if (JSON.stringify(vigente.diseno ?? null) !== JSON.stringify(borrador.diseno ?? null)) cambios.push(borrador.diseno ? 'Cambia el diseño del texto (letra, tamaño o colores)' : 'Vuelve el diseño original del texto');
  if (JSON.stringify(vigente.destinatarios) !== JSON.stringify(borrador.destinatarios) || vigente.frase_otro !== borrador.frase_otro) cambios.push('Cambian las opciones de «para quién o para qué se expide»');
  return cambios;
}

/**
 * El texto de cada documento. Se redacta con los datos del sistema como fichas («Grado», «Nombre del colegio»…) y se ve el documento
 * mientras se escribe. Cada cambio publicado es una versión nueva (lo ya expedido no cambia). ADMIN y Secretaría redactan cualquier tipo
 * que no esté archivado.
 */
export function PlantillasCertificadosPanel() {
  const datos = usePlantillasCertificados();
  const [tipo, setTipo] = useState<ClaveCertificado | ''>('');
  // El editor avisa si tiene cambios sin publicar, para confirmar antes de cambiar de documento.
  const sinPublicar = useRef(false);

  if (datos.isLoading) return <Spinner />;
  if (datos.isError) return <Alert tone="error">{errorMessage(datos.error)}</Alert>;
  if (!datos.data) return null;
  const plantilla = datos.data.plantillas.find((p) => p.tipo === tipo) ?? datos.data.plantillas[0];
  if (!plantilla) return <Alert tone="info">No hay textos que puedas redactar ahora. Crea un tipo nuevo en «Tipos de documento»: aquí redactas su texto.</Alert>;

  const cambiarDocumento = (nuevo: ClaveCertificado) => {
    if (sinPublicar.current && !window.confirm('Tienes cambios sin publicar en este documento. Si cambias de documento se pierden. ¿Continuar?')) return;
    setTipo(nuevo);
  };

  return (
    // La clave reinicia el editor cuando cambia de documento o de versión publicada.
    <EditorPlantilla key={`${plantilla.tipo}:${plantilla.version}`} plantilla={plantilla} plantillas={datos.data.plantillas} variables={datos.data.variables} onCambiarDocumento={cambiarDocumento} sinPublicar={sinPublicar} />
  );
}

function EditorPlantilla({
  plantilla,
  plantillas,
  variables,
  onCambiarDocumento,
  sinPublicar,
}: {
  plantilla: PlantillaVigente;
  plantillas: PlantillaVigente[];
  variables: VariableCertificado[];
  onCambiarDocumento: (tipo: ClaveCertificado) => void;
  sinPublicar: { current: boolean };
}) {
  const [borrador, setBorrador] = useState<ContenidoPlantilla>(() => copiar(contenidoDe(plantilla)));
  const [pestana, setPestana] = useState('texto');
  const [nota, setNota] = useState('');
  const [problemas, setProblemas] = useState<string[]>([]);
  const [aviso, setAviso] = useState<{ tono: 'success' | 'error'; texto: string } | null>(null);
  const [publicando, setPublicando] = useState(false);
  const [errorPublicar, setErrorPublicar] = useState<string | null>(null);
  const [previa, setPrevia] = useState<{ url: string } | null>(null);
  const [generando, setGenerando] = useState(false);
  const [cargandoEstandar, setCargandoEstandar] = useState(false);
  const editores = useRef(new Map<string, EditorConVariablesHandle>());
  const [bloqueEnfocado, setBloqueEnfocado] = useState<string | null>(null);
  const publicar = usePublicarPlantilla();

  useEffect(() => {
    const url = previa?.url;
    return () => {
      if (url) URL.revokeObjectURL(url);
    };
  }, [previa?.url]);

  const aplicables = variables.filter((v) => variableAplica(v.fuente, plantilla.fuentes));
  const obligatorios = new Set(plantilla.requisitos.bloques);
  const vigente = contenidoDe(plantilla);
  const cambiado = JSON.stringify(borrador) !== JSON.stringify(vigente);
  sinPublicar.current = cambiado;

  // Lo que se escribió y aún no se publicó se pierde si se cierra la pestaña: el navegador avisa.
  useEffect(() => {
    if (!cambiado) return;
    const avisar = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener('beforeunload', avisar);
    return () => window.removeEventListener('beforeunload', avisar);
  }, [cambiado]);

  // La vista en vivo se pide al dejar de escribir, no en cada tecla.
  const vistaEnVivo = useRenderPlantilla(plantilla.tipo, useDebouncedValue(borrador, 700));

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

  /** Coloca el dato elegido en el panel en el párrafo donde se estaba escribiendo (o en el primero). */
  const insertarVariable = (clave: string) => {
    const id = bloqueEnfocado ?? borrador.bloques.find((b) => b.estilo !== 'TABLA_NOTAS')?.id;
    if (id) editores.current.get(id)?.insertarVariable(clave);
  };

  const verPdfExacto = async () => {
    setAviso(null);
    setProblemas([]);
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

  const cargarEstandar = async () => {
    if (cambiado && !window.confirm('Se reemplaza lo que tienes sin publicar por el texto estándar sugerido. Nada se publica hasta que tú lo hagas. ¿Continuar?')) return;
    setAviso(null);
    setCargandoEstandar(true);
    try {
      // El texto estándar no trae diseño propio: se conserva el que ya se eligió.
      setBorrador({ ...copiar(await pedirPlantillaEstandar(plantilla.tipo)), diseno: borrador.diseno ?? null });
      setAviso({ tono: 'success', texto: 'Se cargó el texto estándar sugerido como borrador. Revísalo y ajústalo; no se ha publicado nada.' });
    } catch (err) {
      setAviso({ tono: 'error', texto: errorMessage(err) });
    } finally {
      setCargandoEstandar(false);
    }
  };

  const descartar = () => {
    if (!window.confirm('Se descartan los cambios que no has publicado y se vuelve al texto vigente. ¿Continuar?')) return;
    setBorrador(copiar(vigente));
    setProblemas([]);
    setAviso(null);
  };

  const publicarVersion = async () => {
    setProblemas([]);
    setErrorPublicar(null);
    try {
      const r = await publicar.mutateAsync({ tipo: plantilla.tipo, contenido: borrador, nota });
      setPublicando(false);
      setAviso({ tono: 'success', texto: `Se publicó la versión ${r.version}. Los documentos que se expidan desde ahora usan este texto.` });
    } catch (err) {
      setProblemas(problemasDe(err));
      setErrorPublicar(errorMessage(err));
    }
  };

  return (
    <div className="space-y-4">
      <Card className="sticky top-0 z-20 space-y-3">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div className="flex flex-wrap items-end gap-3">
            <div className="min-w-56">
              <Select label="Documento" value={plantilla.tipo} onChange={(e) => onCambiarDocumento(e.target.value as ClaveCertificado)}>
                {plantillas.map((p) => (
                  <option key={p.tipo} value={p.tipo}>
                    {p.nombre}
                    {p.estado_tipo === 'BORRADOR' ? ' (borrador)' : ''}
                  </option>
                ))}
              </Select>
            </div>
            <div className="flex flex-wrap items-center gap-2 pb-2">
              <Chip tone={plantilla.estado_tipo === 'ACTIVO' ? 'green' : 'orange'}>{plantilla.estado_tipo === 'ACTIVO' ? 'Activo' : 'Borrador'}</Chip>
              <Chip tone="blue">Versión {plantilla.version}</Chip>
              {cambiado && <Chip tone="orange">Cambios sin publicar</Chip>}
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button type="button" variant="secondary" onClick={descartar} disabled={!cambiado}>
              Descartar cambios
            </Button>
            <Button type="button" variant="outline" onClick={verPdfExacto} isLoading={generando}>
              Ver PDF exacto
            </Button>
            <Button
              type="button"
              onClick={() => {
                setErrorPublicar(null);
                setProblemas([]);
                setPublicando(true);
              }}
              disabled={!cambiado}
            >
              Publicar…
            </Button>
          </div>
        </div>
        <p className="text-xs text-muted">
          Publicada el {formatoFechaHora(plantilla.publicada_at)}. Mínimos que debe conservar: {plantilla.requisitos.fuente}. El encabezado (escudo, nombre, DANE, NIT, resolución, sede, jornada y año), el QR y la huella los pone el sistema: no se editan.
        </p>
      </Card>

      {aviso && <Alert tone={aviso.tono}>{aviso.texto}</Alert>}
      {problemas.length > 0 && !publicando && (
        <Alert tone="error">
          <ul className="list-disc space-y-1 pl-4">
            {problemas.map((p) => (
              <li key={p}>{p}</li>
            ))}
          </ul>
        </Alert>
      )}

      <Tabs
        items={[
          { key: 'texto', label: 'Texto' },
          { key: 'diseno', label: 'Diseño' },
          { key: 'destinatarios', label: 'Destinatarios y vigencia' },
          { key: 'versiones', label: 'Versiones' },
        ]}
        active={pestana}
        onChange={setPestana}
      />

      {(pestana === 'texto' || pestana === 'diseno') && (
        <div className="grid gap-4 pt-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] lg:items-start">
          <div className="space-y-4">
            {pestana === 'diseno' && <DisenoPlantillaCard diseno={borrador.diseno} onCambiar={(diseno) => setBorrador((b) => ({ ...b, diseno: diseno && JSON.stringify(diseno) === JSON.stringify(DISENO_INICIAL) ? null : diseno }))} />}
            {pestana === 'texto' && (
              <>
            <Card className="space-y-3">
              <div className="flex flex-wrap items-end justify-between gap-3">
                <div className="min-w-64 flex-1">
                  <Input label="Título del documento" value={borrador.titulo} onChange={(e) => setBorrador((b) => ({ ...b, titulo: e.target.value }))} maxLength={100} />
                </div>
                <Button type="button" variant="outline" onClick={cargarEstandar} isLoading={cargandoEstandar}>
                  Cargar texto estándar sugerido
                </Button>
              </div>
              <p className="text-xs text-muted">El texto estándar es un punto de partida: se carga como borrador, sin publicarlo, para que lo ajustes a tu SIEE antes de publicar.</p>
            </Card>

            <DatosDelSistema variables={aplicables} onInsertar={insertarVariable} />

            <Card className="space-y-3">
              <p className="text-sm text-muted">Los párrafos se dibujan en este orden.</p>
              {borrador.bloques.map((b, indice) => (
                <ParrafoPlantilla
                  key={b.id}
                  ref={(h) => {
                    if (h) editores.current.set(b.id, h);
                    else editores.current.delete(b.id);
                  }}
                  bloque={b}
                  numero={indice + 1}
                  esObligatorio={obligatorios.has(b.id)}
                  puedeSubir={indice > 0}
                  puedeBajar={indice < borrador.bloques.length - 1}
                  variables={aplicables}
                  onCambiar={(cambio) => cambiarBloque(b.id, cambio)}
                  onMover={(delta) => mover(indice, delta)}
                  onQuitar={() => setBorrador((x) => ({ ...x, bloques: x.bloques.filter((y) => y.id !== b.id) }))}
                  onEnfocar={() => setBloqueEnfocado(b.id)}
                />
              ))}
              <Button type="button" variant="outline" onClick={agregarParrafo} disabled={borrador.bloques.length >= 14}>
                Agregar párrafo
              </Button>
            </Card>
              </>
            )}
          </div>

          <div className="space-y-4 lg:sticky lg:top-28">
            <Card className="space-y-3">
              <p className="text-sm font-semibold text-ink">Así se ve</p>
              <p className="text-xs text-muted">Con datos de muestra; se actualiza al dejar de escribir. «Ver PDF exacto» muestra el documento tal como se imprime.</p>
              <VistaEnVivoPlantilla datos={vistaEnVivo.data} cargando={vistaEnVivo.isFetching} error={vistaEnVivo.error} diseno={borrador.diseno} />
            </Card>
          </div>
        </div>
      )}

      <TabPanel active={pestana} tabKey="destinatarios">
        <DestinatariosPlantilla borrador={borrador} onCambiar={(cambio) => setBorrador(cambio)} />
      </TabPanel>

      <TabPanel active={pestana} tabKey="versiones">
        <HistorialVersiones tipo={plantilla.tipo} />
      </TabPanel>

      <PublicarPlantillaDrawer
        open={publicando}
        nombre={plantilla.nombre}
        versionNueva={plantilla.version + 1}
        nota={nota}
        onNota={setNota}
        cambios={resumenDeCambios(vigente, borrador)}
        problemas={problemas}
        error={errorPublicar}
        isSubmitting={publicar.isPending}
        onClose={() => setPublicando(false)}
        onPublicar={publicarVersion}
      />

      <Drawer open={Boolean(previa)} size="xl" title="Vista previa con un estudiante inventado" subtitle="No tiene validez: el QR y la huella solo existen al expedir." onClose={() => setPrevia(null)}>
        {previa && <VisorDocumento url={previa.url} titulo="Así se imprimirá" nombreArchivo="vista-previa-plantilla.pdf" />}
      </Drawer>
    </div>
  );
}
