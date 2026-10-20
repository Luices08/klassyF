import { type FormEvent, useState } from 'react';
import { Alert, errorMessage } from '../ui/Alert';
import { Chip, type Tone } from '../ui/Badge';
import { Button } from '../ui/Button';
import { Card, CardHeader } from '../ui/Card';
import { Drawer } from '../ui/Drawer';
import { Input } from '../ui/Field';
import { IconButton } from '../ui/IconButton';
import { MultiSelect } from '../ui/MultiSelect';
import { Select } from '../ui/Field';
import { Spinner } from '../ui/Spinner';
import { Switch } from '../ui/Switch';
import { EmptyRow, Table, TableBody, TableHead, Td, Th } from '../ui/Table';
import { BanIcon, CheckIcon, PencilIcon, PlusIcon, TrashIcon } from '../ui/icons';
import {
  ETIQUETA_ESTADO_MATRICULA,
  ETIQUETA_ESTADO_TITULACION,
  ETIQUETA_FUENTE,
  NIVELES_EDUCATIVOS_TIPO,
  useActivarTipoCertificado,
  useActualizarTipoCertificado,
  useArchivarTipoCertificado,
  useCrearTipoCertificado,
  useEliminarTipoCertificado,
  useTiposCertificado,
  type EstadoTipoCertificado,
  type FuenteCertificado,
  type ListaTiposCertificado,
  type TipoCertificado,
} from '../../hooks/useCertificados';
import { useAuth } from '../../context/AuthContext';
import { useGrades } from '../../hooks/useCatalogs';

const FUENTES: FuenteCertificado[] = ['TITULACION', 'CULMINACION', 'SERVICIO_SOCIAL', 'VALORACIONES', 'DEPENDENCIAS', 'PAZ_Y_SALVO_SALIDA'];

/** «Preescolar · Transición»: el alcance de un tipo en palabras (vacío = todos). */
const textoDeAlcance = (t: Pick<TipoCertificado, 'niveles' | 'grados_numeros'>, nombresDeGrado: Map<number, string>): string => {
  const niveles = (t.niveles ?? []).map((n) => NIVELES_EDUCATIVOS_TIPO.find((x) => x.valor === n)?.nombre ?? n);
  const grados = (t.grados_numeros ?? []).map((n) => nombresDeGrado.get(n) ?? `${n}°`);
  return [...niveles, ...grados].join(' · ') || 'Todos los grados';
};
const ESTADO_TONO: Record<EstadoTipoCertificado, Tone> = { BORRADOR: 'orange', ACTIVO: 'green', ARCHIVADO: 'neutral' };
const ESTADO_NOMBRE: Record<EstadoTipoCertificado, string> = { BORRADOR: 'Borrador', ACTIVO: 'Activo', ARCHIVADO: 'Archivado' };

/** «Constancia de conducta» → «CC»: una sugerencia que el usuario puede cambiar. */
const sugerirPrefijo = (nombre: string): string =>
  nombre
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .split(/\s+/)
    .filter((p) => p.length > 2)
    .map((p) => p[0]!.toUpperCase())
    .join('')
    .replace(/[^A-Z]/g, '')
    .slice(0, 4);

/**
 * Los tipos de documento que expide la secretaría. No es una lista fija: Secretaría y el administrador los crean, editan, archivan y
 * eliminan. Un tipo nuevo nace en borrador (se redacta y se prueba con la vista previa) y el administrador lo activa. Si ya se expidió
 * algo con él no se elimina —los documentos se verifican por su QR—: se archiva y deja de ofrecerse.
 */
export function TiposDocumentoPanel() {
  const datos = useTiposCertificado();
  const [editando, setEditando] = useState<TipoCertificado | 'nuevo' | null>(null);
  const [confirmando, setConfirmando] = useState<{ tipo: TipoCertificado; accion: 'archivar' | 'eliminar' } | null>(null);
  const activar = useActivarTipoCertificado();
  const grados = useGrades();

  if (datos.isLoading) return <Spinner />;
  if (datos.isError) return <Alert tone="error">{errorMessage(datos.error)}</Alert>;
  if (!datos.data) return null;
  const lista = datos.data;
  const nombresDeGrado = new Map((grados.data ?? []).map((g) => [g.numero, g.nombre]));

  return (
    <div className="space-y-4">
      <Alert tone="info">
        Cada tipo nuevo nace en <strong>borrador</strong>: redacta su texto en la pestaña «Plantillas», pruébalo con la vista previa y el administrador lo activa. Un tipo con documentos ya expedidos no se
        elimina, se archiva: lo expedido sigue verificándose y reimprimiéndose.
      </Alert>
      {activar.isError && <Alert tone="error">{errorMessage(activar.error)}</Alert>}

      <Card className="space-y-4">
        <CardHeader
          title="Tipos de documento"
          subtitle={`${lista.tipos.length} de ${lista.maximo} posibles.`}
          action={
            <Button onClick={() => setEditando('nuevo')} disabled={lista.tipos.length >= lista.maximo}>
              <PlusIcon className="h-4 w-4" /> Nuevo tipo
            </Button>
          }
        />
        <Table>
          <TableHead>
            <tr>
              <Th>Documento</Th>
              <Th>Prefijo</Th>
              <Th>Estado</Th>
              <Th>Alcance</Th>
              <Th>Usa</Th>
              <Th>Expedidos</Th>
              <Th>Acciones</Th>
            </tr>
          </TableHead>
          <TableBody>
            {lista.tipos.map((t) => (
              <tr key={t.clave}>
                <Td>
                  <span className="block font-semibold text-ink">{t.nombre}</span>
                  {t.descripcion && <span className="block text-xs text-muted">{t.descripcion}</span>}
                </Td>
                <Td className="font-mono text-xs">{t.prefijo}</Td>
                <Td>
                  <Chip tone={ESTADO_TONO[t.estado]}>{ESTADO_NOMBRE[t.estado]}</Chip>
                </Td>
                <Td className="text-xs text-body">{textoDeAlcance(t, nombresDeGrado)}</Td>
                <Td>
                  <div className="flex flex-wrap gap-1">
                    {t.fuentes.length === 0 ? <span className="text-xs text-muted">Datos del estudiante</span> : t.fuentes.map((f) => <Chip key={f} tone="blue">{ETIQUETA_FUENTE[f]?.nombre ?? f}</Chip>)}
                  </div>
                </Td>
                <Td>{t.emitidos}</Td>
                <Td>
                  <div className="flex items-center justify-end gap-1.5">
                    {t.puede.activar && <IconButton tone="success" label={t.estado === 'ARCHIVADO' ? 'Volver a activar' : 'Activar'} icon={<CheckIcon />} disabled={activar.isPending} onClick={() => activar.mutate(t.clave)} />}
                    {t.puede.editar && <IconButton tone="edit" label="Editar" icon={<PencilIcon />} onClick={() => setEditando(t)} />}
                    {t.puede.archivar && <IconButton tone="neutral" label="Archivar (deja de ofrecerse)" icon={<BanIcon />} onClick={() => setConfirmando({ tipo: t, accion: 'archivar' })} />}
                    {t.puede.eliminar && (
                      <IconButton
                        tone="danger"
                        label={t.emitidos > 0 ? 'No se elimina: ya tiene documentos expedidos (archívalo)' : 'Eliminar'}
                        icon={<TrashIcon />}
                        disabled={t.emitidos > 0}
                        onClick={() => setConfirmando({ tipo: t, accion: 'eliminar' })}
                      />
                    )}
                  </div>
                </Td>
              </tr>
            ))}
            {lista.tipos.length === 0 && <EmptyRow colSpan={7}>No hay tipos de documento. Crea el primero con «Nuevo tipo».</EmptyRow>}
          </TableBody>
        </Table>
      </Card>

      {editando && <TipoDrawer key={editando === 'nuevo' ? 'nuevo' : editando.clave} tipo={editando === 'nuevo' ? null : editando} lista={lista} nombresDeGrado={nombresDeGrado} onClose={() => setEditando(null)} />}
      {confirmando && <ConfirmacionDrawer tipo={confirmando.tipo} accion={confirmando.accion} onClose={() => setConfirmando(null)} />}
    </div>
  );
}

function TipoDrawer({ tipo, lista, nombresDeGrado, onClose }: { tipo: TipoCertificado | null; lista: ListaTiposCertificado; nombresDeGrado: Map<number, string>; onClose: () => void }) {
  const crear = useCrearTipoCertificado();
  const actualizar = useActualizarTipoCertificado();
  const [nombre, setNombre] = useState(tipo?.nombre ?? '');
  const [descripcion, setDescripcion] = useState(tipo?.descripcion ?? '');
  const [prefijo, setPrefijo] = useState(tipo?.prefijo ?? '');
  const [prefijoTocado, setPrefijoTocado] = useState(Boolean(tipo));
  const [estados, setEstados] = useState<string[]>(tipo?.estados_matricula ?? ['MATRICULADO_DEFINITIVO', 'MATRICULADO_CONDICIONAL']);
  const [fuentes, setFuentes] = useState<FuenteCertificado[]>(tipo?.fuentes ?? []);
  const [variables, setVariables] = useState<string[]>(tipo?.variables_obligatorias ?? []);
  const [autoservicio, setAutoservicio] = useState(tipo?.autoservicio_acudiente ?? false);
  // Alcance: un nivel (o todos) y, si hace falta, grados concretos. Vacío = todos.
  const [nivel, setNivel] = useState(tipo?.niveles?.[0] ?? '');
  const [grados, setGrados] = useState<string[]>((tipo?.grados_numeros ?? []).map(String));
  const [estadosTitulacion, setEstadosTitulacion] = useState<string[]>(tipo?.estados_titulacion ?? []);

  // El prefijo y las fuentes son parte de los códigos y del contenido: solo cambian en borrador y sin documentos expedidos.
  const bloqueado = tipo !== null && (tipo.estado !== 'BORRADOR' || tipo.emitidos > 0);
  const motivoBloqueo = tipo?.emitidos ? 'Ya se expidieron documentos de este tipo.' : 'Solo se cambia mientras el tipo está en borrador.';
  // Qué datos no puede perder el texto lo define solo el administrador.
  const esAdmin = useAuth().user?.rol === 'ADMIN';
  const error = crear.error ?? actualizar.error;
  const guardando = crear.isPending || actualizar.isPending;
  const valido = nombre.trim().length >= 3 && /^[A-Za-z]{2,4}$/.test(prefijo.trim()) && estados.length > 0;

  const enviar = async (e: FormEvent) => {
    e.preventDefault();
    const base = {
      nombre: nombre.trim(),
      descripcion: descripcion.trim(),
      prefijo: prefijo.trim().toUpperCase(),
      estados_matricula: estados,
      fuentes,
      niveles: nivel ? [nivel] : [],
      grados_numeros: grados.map(Number),
      // La situación con que se expide la define el administrador al editar; al crear el tipo se envía como parte del alta.
      ...(fuentes.includes('TITULACION') && (esAdmin || !tipo) ? { estados_titulacion: estadosTitulacion } : {}),
    };
    if (tipo) {
      await actualizar.mutateAsync({ clave: tipo.clave, cambios: { ...base, ...(esAdmin ? { variables_obligatorias: variables, autoservicio_acudiente: autoservicio && !fuentes.includes('DEPENDENCIAS') } : {}) } });
    } else {
      await crear.mutateAsync(base);
    }
    onClose();
  };

  return (
    <Drawer
      open
      title={tipo ? 'Editar tipo de documento' : 'Nuevo tipo de documento'}
      subtitle={tipo ? tipo.nombre : 'Nace en borrador: lo redactas y el administrador lo activa.'}
      onClose={onClose}
      onSubmit={(e) => void enviar(e).catch(() => undefined)}
      submitLabel={tipo ? 'Guardar' : 'Crear'}
      isSubmitting={guardando}
      submitDisabled={!valido}
    >
      {error && <Alert tone="error">{errorMessage(error)}</Alert>}
      <Input
        label="Nombre del documento"
        value={nombre}
        maxLength={80}
        placeholder="Ej. Constancia de conducta"
        onChange={(e) => {
          setNombre(e.target.value);
          if (!prefijoTocado) setPrefijo(sugerirPrefijo(e.target.value));
        }}
      />
      <Input label="Descripción (opcional)" value={descripcion} maxLength={200} onChange={(e) => setDescripcion(e.target.value)} hint="Se muestra al elegir el documento al expedir." />
      <Input
        label="Prefijo del código"
        value={prefijo}
        maxLength={4}
        disabled={bloqueado}
        onChange={(e) => {
          setPrefijoTocado(true);
          setPrefijo(e.target.value.toUpperCase().replace(/[^A-Z]/g, ''));
        }}
        hint={bloqueado ? motivoBloqueo : `De 2 a 4 letras. Los códigos quedan así: ${prefijo || 'CC'}-${new Date().getFullYear()}-0001.`}
      />
      <MultiSelect
        label="Se puede expedir con la matrícula…"
        options={lista.estados_matricula.map((valor) => ({ value: valor, label: ETIQUETA_ESTADO_MATRICULA[valor] ?? valor }))}
        selected={estados}
        onChange={setEstados}
        emptyLabel="Elige al menos un estado"
      />
      <div className="space-y-3 rounded-lg border border-border p-3">
        <p className="text-sm font-semibold text-ink">A qué grados se ofrece</p>
        <Select label="Nivel" value={nivel} onChange={(e) => setNivel(e.target.value)}>
          <option value="">Todos los niveles</option>
          {NIVELES_EDUCATIVOS_TIPO.map((n) => (
            <option key={n.valor} value={n.valor}>
              {n.nombre}
            </option>
          ))}
        </Select>
        <MultiSelect
          label="Grados concretos (opcional)"
          options={[...nombresDeGrado.entries()].sort((a, b) => a[0] - b[0]).map(([numero, nombre]) => ({ value: String(numero), label: nombre }))}
          selected={grados}
          onChange={setGrados}
          allLabel="Todos los grados del nivel"
        />
        <p className="text-xs text-muted">El documento solo se ofrece a matrículas de estos grados. Para uno de culminación (Transición, 5° o 9°) elige el grado que culmina.</p>
      </div>
      <div className="space-y-3 rounded-lg border border-border p-3">
        <p className="text-sm font-semibold text-ink">Qué datos de otros módulos usa</p>
        <p className="text-xs text-muted">Sin nada encendido, el documento usa solo los datos del colegio, el estudiante y su matrícula. El sistema nunca inventa datos: el texto solo los coloca.</p>
        {FUENTES.map((f) => (
          <Switch
            key={f}
            label={ETIQUETA_FUENTE[f].nombre}
            description={ETIQUETA_FUENTE[f].descripcion}
            checked={fuentes.includes(f)}
            onChange={(valor) => setFuentes((actuales) => (valor ? [...actuales, f] : actuales.filter((x) => x !== f)))}
            disabled={bloqueado}
            disabledReason={bloqueado ? motivoBloqueo : null}
          />
        ))}
      </div>
      {fuentes.includes('TITULACION') && (esAdmin || !tipo) && (
        <MultiSelect
          label="Se expide cuando el estudiante está…"
          options={Object.entries(ETIQUETA_ESTADO_TITULACION).map(([valor, etiqueta]) => ({ value: valor, label: etiqueta }))}
          selected={estadosTitulacion}
          onChange={setEstadosTitulacion}
          emptyLabel="Elige al menos una situación"
        />
      )}
      {esAdmin && tipo && (
        <Switch
          label="El acudiente lo genera desde su portal"
          description="Se expide al instante, sin intervención de secretaría (máximo 3 por estudiante al día). Las firmas siguen la política del documento; la de Rectoría solo sale si la secretaría tiene esa delegación. No aplica a documentos con confirmación de dependencias (paz y salvo)."
          checked={autoservicio && !fuentes.includes('DEPENDENCIAS')}
          onChange={setAutoservicio}
          disabled={fuentes.includes('DEPENDENCIAS')}
          disabledReason={fuentes.includes('DEPENDENCIAS') ? 'Un documento que exige confirmar dependencias lo expide siempre la secretaría.' : null}
        />
      )}
      {esAdmin && (
        <MultiSelect
          label="Datos que el texto no puede perder (opcional)"
          options={lista.variables.map((v) => ({ value: v.clave, label: v.etiqueta }))}
          selected={variables}
          onChange={setVariables}
          allLabel="Solo los mínimos"
        />
      )}
    </Drawer>
  );
}

function ConfirmacionDrawer({ tipo, accion, onClose }: { tipo: TipoCertificado; accion: 'archivar' | 'eliminar'; onClose: () => void }) {
  const archivar = useArchivarTipoCertificado();
  const eliminar = useEliminarTipoCertificado();
  const operacion = accion === 'archivar' ? archivar : eliminar;
  const enviar = async (e: FormEvent) => {
    e.preventDefault();
    await operacion.mutateAsync(tipo.clave);
    onClose();
  };

  return (
    <Drawer
      open
      title={accion === 'archivar' ? 'Archivar tipo de documento' : 'Eliminar tipo de documento'}
      subtitle={tipo.nombre}
      onClose={onClose}
      onSubmit={(e) => void enviar(e).catch(() => undefined)}
      submitLabel={accion === 'archivar' ? 'Archivar' : 'Eliminar'}
      submitVariant={accion === 'eliminar' ? 'soft-danger' : 'primary'}
      isSubmitting={operacion.isPending}
    >
      {operacion.isError && <Alert tone="error">{errorMessage(operacion.error)}</Alert>}
      {accion === 'archivar' ? (
        <p className="text-sm text-body">
          «{tipo.nombre}» deja de ofrecerse al expedir. Los {tipo.emitidos} documento(s) ya expedidos siguen vigentes, se verifican por su QR y se pueden reimprimir. El administrador lo puede volver a activar.
        </p>
      ) : (
        <p className="text-sm text-body">Se elimina «{tipo.nombre}» junto con los textos que se redactaron para él. Esta acción no se puede deshacer. Como nunca se expidió nada con este tipo, no afecta ningún documento.</p>
      )}
    </Drawer>
  );
}
