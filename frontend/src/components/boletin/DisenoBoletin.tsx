import { type ChangeEvent, type ReactNode, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Alert, errorMessage } from '../ui/Alert';
import { Button } from '../ui/Button';
import { Card, CardHeader } from '../ui/Card';
import { Input, Select, Textarea } from '../ui/Field';
import { IconButton } from '../ui/IconButton';
import { ChevronDownIcon, TrashIcon } from '../ui/icons';
import { Spinner } from '../ui/Spinner';
import { VistaPreviaPdf } from '../ui/VistaPreviaPdf';
import {
  CLAVES_TEXTOS_BOLETIN,
  type ClaveTextoBoletin,
  ESCUDO_TAMANO_MAXIMO,
  ESCUDO_TAMANO_MINIMO,
  MAX_BYTES_ESCUDO,
  FUENTES_BOLETIN,
  MAX_FIRMAS_BOLETIN,
  MAX_OPCIONES_PROMOCION,
  TAMANOS_TEXTO_BOLETIN,
  PAPELES_BOLETIN,
  POSICIONES_ESCUDO,
  type PlantillaBoletin,
  type PosicionEscudo,
  type SeccionBoletin,
  cargarPdfMuestra,
  useActualizarConfiguracionBoletin,
  useConfiguracionBoletin,
} from '../../hooks/useBoletin';
import { useInstitution } from '../../hooks/useInstitution';

const NOMBRE_SECCION: Record<SeccionBoletin, string> = {
  DATOS_ESTUDIANTE: 'Datos del estudiante',
  AREAS: 'Áreas y asignaturas',
  DIFICULTADES: 'Áreas con dificultades y apoyos',
  CALENDARIO: 'Calendario de entrega de todos los periodos',
  COMPROMISOS: 'Compromisos de seguimiento (para escribir a mano)',
  PROMOCION: 'Estado de promoción (casillas para marcar)',
  ESCALA: 'Escala de valoración',
  ENTREGA: 'Fecha de entrega',
  RECLAMACIONES: 'Aclaraciones y reclamaciones',
  FIRMAS: 'Firmas',
};

const NOMBRE_POSICION: Record<PosicionEscudo, string> = {
  IZQUIERDA: 'A la izquierda del nombre del colegio',
  CENTRO: 'Centrado, arriba',
  DERECHA: 'A la derecha',
  MARCA_DE_AGUA: 'Marca de agua (de fondo, tenue)',
};

const NOMBRE_PAPEL = { LETTER: 'Carta', A4: 'A4' } as const;
const NOMBRE_FUENTE = { SANS: 'Sin serifa (Helvetica)', SERIF: 'Con serifa (Times)', MONO: 'Máquina de escribir (Courier)' } as const;
const NOMBRE_TAMANO = { PEQUENO: 'Pequeño', NORMAL: 'Normal', GRANDE: 'Grande' } as const;

/** Cada texto fijo del PDF con su nombre para el colegio; `marcas` son las palabras entre llaves que el sistema reemplaza al imprimir. */
const TEXTOS_FIJOS: Record<ClaveTextoBoletin, { etiqueta: string; marcas?: string }> = {
  promedio_general: { etiqueta: 'Rótulo del promedio general' },
  documento: { etiqueta: 'Rótulo «Documento»' },
  grado: { etiqueta: 'Rótulo «Grado»' },
  grupo: { etiqueta: 'Rótulo «Grupo»' },
  jornada: { etiqueta: 'Rótulo «Jornada»' },
  inasistencias: { etiqueta: 'Rótulo «Inasistencias»' },
  justificadas: { etiqueta: 'Palabra «justificadas»' },
  injustificadas: { etiqueta: 'Palabra «injustificadas»' },
  retardos: { etiqueta: 'Palabra «retardos»' },
  puesto: { etiqueta: 'Texto del puesto', marcas: '{puesto} {total}' },
  periodo_linea: { etiqueta: 'Línea del periodo y año', marcas: '{periodo} {anio}' },
  sin_cerrar: { etiqueta: 'Asignatura sin cerrar' },
  falla: { etiqueta: 'Palabra de las fallas' },
  sin_malla: { etiqueta: 'Aviso cuando no hay malla curricular' },
  informe_parcial: { etiqueta: 'Aviso de informe parcial' },
  informe_parcial_faltan: { etiqueta: 'Aviso de lo que falta cerrar', marcas: '{pendientes}' },
  escala_columna_1: { etiqueta: 'Escala: título de la columna 1' },
  escala_columna_2: { etiqueta: 'Escala: título de la columna 2' },
  escala_columna_3: { etiqueta: 'Escala: título de la columna 3' },
  escala_equivalencia: { etiqueta: 'Escala: equivalencia nacional', marcas: '{nivel}' },
  fecha_entrega: { etiqueta: 'Texto de la fecha de entrega', marcas: '{fecha}' },
  calendario_sin_fecha: { etiqueta: 'Calendario: periodo sin fecha' },
  dificultades_intro: { etiqueta: 'Dificultades: frase de introducción' },
  dificultades_ninguna: { etiqueta: 'Dificultades: cuando no hay ninguna' },
  compromisos_intro: { etiqueta: 'Compromisos: frase de introducción' },
  promocion_intro: { etiqueta: 'Promoción: frase de introducción' },
};

/** Casilla de verificación con su texto: el patrón que ya usan las demás pantallas. */
function Casilla({ marcada, deshabilitada, onChange, children }: { marcada: boolean; deshabilitada: boolean; onChange: (v: boolean) => void; children: ReactNode }) {
  return (
    <label className="flex items-center gap-2 text-sm text-body">
      <input type="checkbox" checked={marcada} disabled={deshabilitada} onChange={(e) => onChange(e.target.checked)} />
      {children}
    </label>
  );
}

/** El borrador viaja entero en la clave de caché de la vista previa; el escudo (una imagen larga) se resume para no hashear cientos de KB en cada render. */
function claveDe(plantilla: PlantillaBoletin): string {
  const url = plantilla.escudo.url;
  return JSON.stringify({ ...plantilla, escudo: { ...plantilla.escudo, url: url ? `${url.length}:${url.slice(-24)}` : null } });
}

/**
 * Todo lo que el colegio decide de cómo se ve el boletín: escudo (cuál, dónde y de qué tamaño), encabezado, qué secciones salen y en qué orden,
 * qué se muestra de cada asignatura, firmas y pie. A la derecha, el PDF de muestra se actualiza solo con lo que se va editando, sin guardar.
 */
export function DisenoBoletin({ puedeEditar }: { puedeEditar: boolean }) {
  const { data: institucion } = useInstitution();
  const { data: configuracion, isLoading, isError, error } = useConfiguracionBoletin();
  const actualizar = useActualizarConfiguracionBoletin();

  const [borrador, setBorrador] = useState<PlantillaBoletin | null>(null);
  const [vista, setVista] = useState<PlantillaBoletin | null>(null);
  const [errorEscudo, setErrorEscudo] = useState<string | null>(null);
  const [guardado, setGuardado] = useState(false);
  const [verTextos, setVerTextos] = useState(false);

  const guardada = configuracion?.plantilla;
  useEffect(() => {
    if (guardada) setBorrador(guardada);
  }, [guardada]);

  // La vista previa espera un instante a que termines de escribir para no pedir un PDF por cada tecla.
  useEffect(() => {
    if (!borrador) return;
    const espera = setTimeout(() => setVista(borrador), vista === null ? 0 : 1000);
    return () => clearTimeout(espera);
    // `vista` solo decide si es la primera vez; no debe reiniciar la espera.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [borrador]);

  if (isLoading || !borrador) return isError ? <Alert tone="error">{errorMessage(error)}</Alert> : <Spinner label="Cargando el diseño del boletín..." />;

  const sinGuardar = guardada !== undefined && JSON.stringify(borrador) !== JSON.stringify(guardada);
  const deshabilitado = !puedeEditar;

  function cambiar(fn: (p: PlantillaBoletin) => PlantillaBoletin) {
    setGuardado(false);
    setBorrador((actual) => (actual ? fn(actual) : actual));
  }

  function mover(indice: number, delta: -1 | 1) {
    cambiar((p) => {
      const secciones = [...p.secciones];
      const destino = indice + delta;
      if (destino < 0 || destino >= secciones.length) return p;
      [secciones[indice], secciones[destino]] = [secciones[destino]!, secciones[indice]!];
      return { ...p, secciones };
    });
  }

  function alElegirEscudo(e: ChangeEvent<HTMLInputElement>) {
    const archivo = e.target.files?.[0];
    if (!archivo) return;
    setErrorEscudo(null);
    if (!['image/png', 'image/jpeg'].includes(archivo.type)) {
      setErrorEscudo('El escudo debe ser una imagen PNG o JPG.');
      e.target.value = '';
      return;
    }
    if (archivo.size > MAX_BYTES_ESCUDO) {
      setErrorEscudo('El escudo no puede pesar más de 500 KB.');
      e.target.value = '';
      return;
    }
    const lector = new FileReader();
    lector.onload = () => {
      if (typeof lector.result === 'string') cambiar((p) => ({ ...p, escudo: { ...p.escudo, url: lector.result as string } }));
    };
    lector.readAsDataURL(archivo);
  }

  async function guardar() {
    if (!borrador) return;
    setGuardado(false);
    await actualizar.mutateAsync({ plantilla: borrador });
    setGuardado(true);
  }

  async function volverAlOriginal() {
    if (!window.confirm('¿Volver al diseño original del boletín? Se pierden los cambios del diseño guardados hasta ahora (los textos por desempeño y las fechas no se tocan).')) return;
    setGuardado(false);
    await actualizar.mutateAsync({ plantilla: {} });
    setGuardado(true);
  }

  return (
    <div className="space-y-4">
      {!institucion && (
        <Alert tone="info">
          Aún no has configurado la institución, así que la vista previa usa un nombre de ejemplo y sin logo. Para guardar el diseño primero crea la institución en{' '}
          <Link to="/admin/setup" className="font-semibold underline">
            Configuración institucional
          </Link>
          .
        </Alert>
      )}

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <div className="space-y-4">
          <Card>
            <CardHeader title="Encabezado" subtitle="Lo primero que se ve en cada boletín." />
            <div className="space-y-4">
              <Input label="Título del documento" value={borrador.titulo} maxLength={120} disabled={deshabilitado} onChange={(e) => cambiar((p) => ({ ...p, titulo: e.target.value }))} hint="Déjalo vacío para no mostrar título." />
              <Input label="Subtítulo o lema (opcional)" value={borrador.subtitulo} maxLength={120} disabled={deshabilitado} onChange={(e) => cambiar((p) => ({ ...p, subtitulo: e.target.value }))} />
              <div className="space-y-2">
                <Casilla marcada={borrador.mostrar_datos_institucion} deshabilitada={deshabilitado} onChange={(v) => cambiar((p) => ({ ...p, mostrar_datos_institucion: v }))}>
                  Mostrar DANE, NIT y resolución de la institución
                </Casilla>
                <Casilla marcada={borrador.mostrar_sede_jornada} deshabilitada={deshabilitado} onChange={(v) => cambiar((p) => ({ ...p, mostrar_sede_jornada: v }))}>
                  Mostrar la sede y la jornada
                </Casilla>
              </div>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <Select label="Tamaño del papel" value={borrador.papel} disabled={deshabilitado} onChange={(e) => cambiar((p) => ({ ...p, papel: e.target.value as PlantillaBoletin['papel'] }))}>
                  {PAPELES_BOLETIN.map((papel) => (
                    <option key={papel} value={papel}>
                      {NOMBRE_PAPEL[papel]}
                    </option>
                  ))}
                </Select>
                <Input label="Color de títulos" type="color" value={borrador.color_acento} disabled={deshabilitado} className="h-10 p-1" onChange={(e) => cambiar((p) => ({ ...p, color_acento: e.target.value }))} />
              </div>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <Select label="Tipo de letra" value={borrador.fuente} disabled={deshabilitado} onChange={(e) => cambiar((p) => ({ ...p, fuente: e.target.value as PlantillaBoletin['fuente'] }))}>
                  {FUENTES_BOLETIN.map((f) => (
                    <option key={f} value={f}>
                      {NOMBRE_FUENTE[f]}
                    </option>
                  ))}
                </Select>
                <Select label="Tamaño de la letra" value={borrador.tamano_texto} disabled={deshabilitado} onChange={(e) => cambiar((p) => ({ ...p, tamano_texto: e.target.value as PlantillaBoletin['tamano_texto'] }))}>
                  {TAMANOS_TEXTO_BOLETIN.map((tamano) => (
                    <option key={tamano} value={tamano}>
                      {NOMBRE_TAMANO[tamano]}
                    </option>
                  ))}
                </Select>
              </div>
            </div>
          </Card>

          <Card>
            <CardHeader title="Escudo del colegio" subtitle="Cuál se usa, dónde va y qué tan grande." />
            <div className="space-y-4">
              <Casilla marcada={borrador.escudo.mostrar} deshabilitada={deshabilitado} onChange={(v) => cambiar((p) => ({ ...p, escudo: { ...p.escudo, mostrar: v } }))}>
                Mostrar el escudo en el boletín
              </Casilla>
              {borrador.escudo.mostrar && (
                <>
                  <div className="flex items-center gap-4">
                    {borrador.escudo.url ? (
                      <img src={borrador.escudo.url} alt="Escudo del boletín" className="h-16 w-16 rounded-lg border border-border object-contain" />
                    ) : (
                      <div className="flex h-16 w-16 items-center justify-center rounded-lg border border-dashed border-border text-center text-[10px] text-muted">Logo institucional</div>
                    )}
                    <div className="space-y-1 text-sm text-body">
                      <p>{borrador.escudo.url ? 'Escudo propio de este boletín.' : 'Se usa el logo que cargaste en Configuración institucional.'}</p>
                      {borrador.escudo.url && !deshabilitado && (
                        <Button type="button" variant="secondary" onClick={() => cambiar((p) => ({ ...p, escudo: { ...p.escudo, url: null } }))}>
                          Quitar y usar el logo institucional
                        </Button>
                      )}
                    </div>
                  </div>
                  <Input label="Subir otro escudo (PNG o JPG, máx. 500 KB)" type="file" accept="image/png,image/jpeg" disabled={deshabilitado} onChange={alElegirEscudo} error={errorEscudo ?? undefined} />
                  <Select label="Posición" value={borrador.escudo.posicion} disabled={deshabilitado} onChange={(e) => cambiar((p) => ({ ...p, escudo: { ...p.escudo, posicion: e.target.value as PosicionEscudo } }))}>
                    {POSICIONES_ESCUDO.map((posicion) => (
                      <option key={posicion} value={posicion}>
                        {NOMBRE_POSICION[posicion]}
                      </option>
                    ))}
                  </Select>
                  <div>
                    <label htmlFor="tamano-escudo" className="mb-1.5 block text-label text-body">
                      Tamaño: {borrador.escudo.tamano}
                    </label>
                    <input
                      id="tamano-escudo"
                      type="range"
                      min={ESCUDO_TAMANO_MINIMO}
                      max={ESCUDO_TAMANO_MAXIMO}
                      value={borrador.escudo.tamano}
                      disabled={deshabilitado}
                      className="w-full"
                      onChange={(e) => cambiar((p) => ({ ...p, escudo: { ...p.escudo, tamano: Number(e.target.value) } }))}
                    />
                  </div>
                </>
              )}
            </div>
          </Card>

          <Card>
            <CardHeader title="Secciones y su orden" subtitle="Muestra, oculta, retitula y reordena cada parte. El encabezado siempre va primero." />
            <div className="space-y-3">
              {borrador.secciones.map((seccion, indice) => (
                <div key={seccion.clave} className="flex items-end gap-2 rounded-lg border border-border p-3">
                  <div className="flex flex-col gap-1">
                    <IconButton label="Subir" icon={<ChevronDownIcon className="rotate-180" />} disabled={deshabilitado || indice === 0} onClick={() => mover(indice, -1)} />
                    <IconButton label="Bajar" icon={<ChevronDownIcon />} disabled={deshabilitado || indice === borrador.secciones.length - 1} onClick={() => mover(indice, 1)} />
                  </div>
                  <div className="min-w-0 flex-1 space-y-2">
                    <Casilla
                      marcada={seccion.visible}
                      deshabilitada={deshabilitado}
                      onChange={(v) => cambiar((p) => ({ ...p, secciones: p.secciones.map((s) => (s.clave === seccion.clave ? { ...s, visible: v } : s)) }))}
                    >
                      <span className="font-semibold text-ink">{NOMBRE_SECCION[seccion.clave]}</span>
                    </Casilla>
                    <Input
                      label={`Título de «${NOMBRE_SECCION[seccion.clave]}»`}
                      hideLabel
                      placeholder="Sin título"
                      value={seccion.titulo}
                      maxLength={120}
                      disabled={deshabilitado || !seccion.visible}
                      onChange={(e) => cambiar((p) => ({ ...p, secciones: p.secciones.map((s) => (s.clave === seccion.clave ? { ...s, titulo: e.target.value } : s)) }))}
                    />
                  </div>
                </div>
              ))}
            </div>
          </Card>

          <Card>
            <CardHeader title="Datos del estudiante" />
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              <Casilla marcada={borrador.estudiante.documento} deshabilitada={deshabilitado} onChange={(v) => cambiar((p) => ({ ...p, estudiante: { ...p.estudiante, documento: v } }))}>
                Documento
              </Casilla>
              <Casilla marcada={borrador.estudiante.grado} deshabilitada={deshabilitado} onChange={(v) => cambiar((p) => ({ ...p, estudiante: { ...p.estudiante, grado: v } }))}>
                Grado
              </Casilla>
              <Casilla marcada={borrador.estudiante.grupo} deshabilitada={deshabilitado} onChange={(v) => cambiar((p) => ({ ...p, estudiante: { ...p.estudiante, grupo: v } }))}>
                Grupo
              </Casilla>
              <Casilla marcada={borrador.estudiante.inasistencias} deshabilitada={deshabilitado} onChange={(v) => cambiar((p) => ({ ...p, estudiante: { ...p.estudiante, inasistencias: v } }))}>
                Inasistencias y retardos
              </Casilla>
              <Casilla marcada={borrador.estudiante.promedio} deshabilitada={deshabilitado} onChange={(v) => cambiar((p) => ({ ...p, estudiante: { ...p.estudiante, promedio: v } }))}>
                Promedio general
              </Casilla>
            </div>
            <p className="mt-2 text-xs text-muted">El puesto en el grupo se decide en la pestaña «Entrega y reclamaciones».</p>
          </Card>

          <Card>
            <CardHeader title="Qué se muestra en cada área y asignatura" />
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              {(
                [
                  ['nota', 'Nota numérica'],
                  ['desempeno', 'Nivel de desempeño'],
                  ['nota_area', 'Nota y nivel del área'],
                  ['fallas', 'Fallas por asignatura'],
                  ['descripcion', 'Descripción del desempeño'],
                  ['recomendacion', 'Recomendación'],
                  ['componentes', 'Componentes de la valoración (hetero, auto...)'],
                  ['observacion', 'Observación del docente'],
                ] as const
              ).map(([clave, texto]) => (
                <Casilla key={clave} marcada={borrador.asignaturas[clave]} deshabilitada={deshabilitado} onChange={(v) => cambiar((p) => ({ ...p, asignaturas: { ...p.asignaturas, [clave]: v } }))}>
                  {texto}
                </Casilla>
              ))}
            </div>
            <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
              {(
                [
                  ['componentes', 'Rótulo de los componentes'],
                  ['descripcion', 'Rótulo de la descripción'],
                  ['recomendacion', 'Rótulo de la recomendación'],
                  ['observacion', 'Rótulo de la observación'],
                ] as const
              ).map(([clave, texto]) => (
                <Input key={clave} label={texto} value={borrador.rotulos[clave]} maxLength={60} disabled={deshabilitado} onChange={(e) => cambiar((p) => ({ ...p, rotulos: { ...p.rotulos, [clave]: e.target.value } }))} />
              ))}
            </div>
          </Card>

          <Card>
            <CardHeader title="Dificultades y apoyos" subtitle="Lo pide la guía de boletines: indicar en qué asignaturas hay dificultades y qué apoyo ofrece el colegio. Actívala en «Secciones y su orden»." />
            <Textarea
              label="Actividades de apoyo y recuperación del colegio"
              rows={4}
              value={borrador.texto_apoyo}
              maxLength={800}
              disabled={deshabilitado}
              onChange={(e) => cambiar((p) => ({ ...p, texto_apoyo: e.target.value }))}
              hint="Tal como las define el SIEE. Sale bajo la lista de asignaturas con desempeño bajo (que el sistema arma sola con sus recomendaciones)."
            />
          </Card>

          <Card>
            <CardHeader title="Compromisos y promoción" subtitle="Se activan en «Secciones y su orden». Se escriben o marcan a mano al entregar el informe." />
            <div className="space-y-4">
              <Input
                label="Renglones para los compromisos de seguimiento"
                type="number"
                min={1}
                max={10}
                value={borrador.compromisos_lineas}
                disabled={deshabilitado}
                onChange={(e) => cambiar((p) => ({ ...p, compromisos_lineas: Math.min(10, Math.max(1, Number(e.target.value) || 1)) }))}
              />
              <div className="space-y-2">
                <p className="text-label text-body">Opciones de la decisión de promoción (informe final)</p>
                {borrador.promocion_opciones.map((opcion, indice) => (
                  <div key={indice} className="flex items-center gap-2">
                    <div className="flex-1">
                      <Input
                        label={`Opción ${indice + 1} de promoción`}
                        hideLabel
                        value={opcion}
                        maxLength={40}
                        disabled={deshabilitado}
                        onChange={(e) => cambiar((p) => ({ ...p, promocion_opciones: p.promocion_opciones.map((o, i) => (i === indice ? e.target.value : o)) }))}
                      />
                    </div>
                    {puedeEditar && (
                      <IconButton tone="danger" label="Quitar opción" icon={<TrashIcon />} onClick={() => cambiar((p) => ({ ...p, promocion_opciones: p.promocion_opciones.filter((_, i) => i !== indice) }))} />
                    )}
                  </div>
                ))}
                {puedeEditar && borrador.promocion_opciones.length < MAX_OPCIONES_PROMOCION && (
                  <Button type="button" variant="outline" onClick={() => cambiar((p) => ({ ...p, promocion_opciones: [...p.promocion_opciones, ''] }))}>
                    Agregar opción
                  </Button>
                )}
                <p className="text-xs text-muted">El sistema aún no calcula la promoción (faltan las reglas de promoción de M19/M20): imprime estas casillas para que la comisión marque la decisión.</p>
              </div>
            </div>
          </Card>

          <Card>
            <CardHeader
              title="Textos fijos del documento"
              subtitle="Cada palabra que el sistema imprime por su cuenta se puede cambiar. Las palabras entre llaves, como {puesto}, se reemplazan al imprimir."
              action={
                <Button type="button" variant="secondary" onClick={() => setVerTextos((v) => !v)}>
                  {verTextos ? 'Ocultar' : `Editar los ${CLAVES_TEXTOS_BOLETIN.length} textos`}
                </Button>
              }
            />
            {verTextos && (
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                {CLAVES_TEXTOS_BOLETIN.map((clave) => (
                  <Input
                    key={clave}
                    label={TEXTOS_FIJOS[clave].etiqueta}
                    value={borrador.textos[clave]}
                    maxLength={220}
                    disabled={deshabilitado}
                    hint={TEXTOS_FIJOS[clave].marcas ? `Puedes usar: ${TEXTOS_FIJOS[clave].marcas}` : undefined}
                    onChange={(e) => cambiar((p) => ({ ...p, textos: { ...p.textos, [clave]: e.target.value } }))}
                  />
                ))}
              </div>
            )}
          </Card>

          <Card>
            <CardHeader
              title="Firmas"
              subtitle="Actívalas en «Secciones y su orden». Quien firma como director de grupo sale del grupo de cada estudiante."
              action={
                puedeEditar && borrador.firmas.length < MAX_FIRMAS_BOLETIN ? (
                  <Button type="button" variant="outline" onClick={() => cambiar((p) => ({ ...p, firmas: [...p.firmas, { cargo: '', nombre: '', usa_director_grupo: false }] }))}>
                    Agregar firma
                  </Button>
                ) : undefined
              }
            />
            {borrador.firmas.length === 0 && <p className="text-sm text-muted">No hay firmas definidas.</p>}
            <div className="space-y-3">
              {borrador.firmas.map((firma, indice) => (
                <div key={indice} className="flex items-end gap-2 rounded-lg border border-border p-3">
                  <div className="grid min-w-0 flex-1 grid-cols-1 gap-3 sm:grid-cols-2">
                    <Input label="Cargo" value={firma.cargo} maxLength={80} disabled={deshabilitado} onChange={(e) => cambiar((p) => ({ ...p, firmas: p.firmas.map((f, i) => (i === indice ? { ...f, cargo: e.target.value } : f)) }))} />
                    <Input
                      label="Nombre"
                      value={firma.usa_director_grupo ? '' : firma.nombre}
                      placeholder={firma.usa_director_grupo ? 'El director de cada grupo' : 'Solo la línea para firmar'}
                      maxLength={80}
                      disabled={deshabilitado || firma.usa_director_grupo}
                      onChange={(e) => cambiar((p) => ({ ...p, firmas: p.firmas.map((f, i) => (i === indice ? { ...f, nombre: e.target.value } : f)) }))}
                    />
                    <div className="sm:col-span-2">
                      <Casilla marcada={firma.usa_director_grupo} deshabilitada={deshabilitado} onChange={(v) => cambiar((p) => ({ ...p, firmas: p.firmas.map((f, i) => (i === indice ? { ...f, usa_director_grupo: v } : f)) }))}>
                        Es la firma del director del grupo del estudiante
                      </Casilla>
                    </div>
                  </div>
                  {puedeEditar && <IconButton tone="danger" label="Quitar firma" icon={<TrashIcon />} onClick={() => cambiar((p) => ({ ...p, firmas: p.firmas.filter((_, i) => i !== indice) }))} />}
                </div>
              ))}
            </div>
          </Card>

          <Card>
            <CardHeader title="Pie del boletín" />
            <Textarea label="Texto final (opcional)" rows={3} value={borrador.pie_texto} maxLength={600} disabled={deshabilitado} onChange={(e) => cambiar((p) => ({ ...p, pie_texto: e.target.value }))} hint="Sale al final, centrado. Por ejemplo, un mensaje para las familias." />
          </Card>

          {actualizar.isError && <Alert tone="error">{errorMessage(actualizar.error)}</Alert>}
          {guardado && !sinGuardar && <Alert tone="success">Diseño guardado. Ya se aplica a todos los boletines.</Alert>}
          {puedeEditar && (
            <div className="sticky bottom-4 z-10 flex flex-wrap items-center justify-end gap-2 rounded-xl border border-border bg-surface p-3 shadow-sm">
              {sinGuardar && <span className="mr-auto text-sm text-warning">Tienes cambios sin guardar.</span>}
              <Button type="button" variant="secondary" disabled={actualizar.isPending} onClick={() => void volverAlOriginal()}>
                Volver al diseño original
              </Button>
              <Button type="button" variant="secondary" disabled={!sinGuardar || actualizar.isPending} onClick={() => guardada && setBorrador(guardada)}>
                Descartar cambios
              </Button>
              <Button type="button" disabled={!sinGuardar} isLoading={actualizar.isPending} onClick={() => void guardar()}>
                Guardar diseño
              </Button>
            </div>
          )}
        </div>

        <div className="lg:sticky lg:top-4 lg:self-start">
          {vista && (
            <VistaPreviaPdf
              claveConsulta={['muestra', claveDe(vista)]}
              cargar={() => cargarPdfMuestra(vista)}
              nombreArchivo="boletin-muestra.pdf"
              titulo="Vista previa del boletín"
              nota={
                <p className="mb-3 text-xs text-muted">
                  Muestra con un estudiante inventado y la escala, los textos, la entrega y las reclamaciones reales del colegio. Se actualiza sola mientras editas, sin guardar.
                </p>
              }
            />
          )}
        </div>
      </div>
    </div>
  );
}
