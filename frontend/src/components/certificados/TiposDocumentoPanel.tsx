import { type FormEvent, useState } from 'react';
import { Alert, errorMessage } from '../ui/Alert';
import { Chip, type Tone } from '../ui/Badge';
import { Button } from '../ui/Button';
import { Card, CardHeader } from '../ui/Card';
import { Drawer } from '../ui/Drawer';
import { Input } from '../ui/Field';
import { IconButton } from '../ui/IconButton';
import { MultiSelect } from '../ui/MultiSelect';
import { Spinner } from '../ui/Spinner';
import { Switch } from '../ui/Switch';
import { EmptyRow, Table, TableBody, TableHead, Td, Th } from '../ui/Table';
import { BanIcon, CheckIcon, PencilIcon, PlusIcon, TrashIcon } from '../ui/icons';
import {
  ETIQUETA_ESTADO_MATRICULA,
  ETIQUETA_FUENTE,
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

const FUENTES: FuenteCertificado[] = ['VALORACIONES', 'DEPENDENCIAS'];
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

  if (datos.isLoading) return <Spinner />;
  if (datos.isError) return <Alert tone="error">{errorMessage(datos.error)}</Alert>;
  if (!datos.data) return null;
  const lista = datos.data;

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
                <Td>
                  <div className="flex flex-wrap gap-1">
                    {t.fuentes.length === 0 ? <span className="text-xs text-muted">Datos del estudiante</span> : t.fuentes.map((f) => <Chip key={f} tone="blue">{ETIQUETA_FUENTE[f].nombre}</Chip>)}
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
            {lista.tipos.length === 0 && <EmptyRow colSpan={6}>No hay tipos de documento. Crea el primero con «Nuevo tipo».</EmptyRow>}
          </TableBody>
        </Table>
      </Card>

      {editando && <TipoDrawer key={editando === 'nuevo' ? 'nuevo' : editando.clave} tipo={editando === 'nuevo' ? null : editando} lista={lista} onClose={() => setEditando(null)} />}
      {confirmando && <ConfirmacionDrawer tipo={confirmando.tipo} accion={confirmando.accion} onClose={() => setConfirmando(null)} />}
    </div>
  );
}

function TipoDrawer({ tipo, lista, onClose }: { tipo: TipoCertificado | null; lista: ListaTiposCertificado; onClose: () => void }) {
  const crear = useCrearTipoCertificado();
  const actualizar = useActualizarTipoCertificado();
  const [nombre, setNombre] = useState(tipo?.nombre ?? '');
  const [descripcion, setDescripcion] = useState(tipo?.descripcion ?? '');
  const [prefijo, setPrefijo] = useState(tipo?.prefijo ?? '');
  const [prefijoTocado, setPrefijoTocado] = useState(Boolean(tipo));
  const [estados, setEstados] = useState<string[]>(tipo?.estados_matricula ?? ['MATRICULADO_DEFINITIVO', 'MATRICULADO_CONDICIONAL']);
  const [fuentes, setFuentes] = useState<FuenteCertificado[]>(tipo?.fuentes ?? []);
  const [variables, setVariables] = useState<string[]>(tipo?.variables_obligatorias ?? []);

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
    const base = { nombre: nombre.trim(), descripcion: descripcion.trim(), prefijo: prefijo.trim().toUpperCase(), estados_matricula: estados, fuentes };
    if (tipo) {
      await actualizar.mutateAsync({ clave: tipo.clave, cambios: { ...base, ...(esAdmin ? { variables_obligatorias: variables } : {}) } });
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
