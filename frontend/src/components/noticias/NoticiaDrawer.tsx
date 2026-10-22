import { type FormEvent, useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import { useAnioDeTrabajo } from '../../hooks/useAniosLectivos';
import { useCampuses, useGrades } from '../../hooks/useCatalogs';
import { useGroups } from '../../hooks/useGroups';
import { useInstitution } from '../../hooks/useInstitution';
import {
  type AlcanceNoticia,
  ETIQUETA_ALCANCE,
  ETIQUETA_ROL_DESTINO,
  type PermisosNoticias,
  type RolDestinoNoticia,
  useActualizarNoticia,
  useCategoriasNoticia,
  useCrearNoticia,
  useImagenNoticia,
  useNoticiasParaMi,
} from '../../hooks/useNoticias';
import { reducirPortada } from '../../lib/imagenes';
import { type FormularioNoticia, ORDEN_ALCANCES, alcanceCabeEn, datosDeFormulario, textoDeHtml } from '../../lib/noticias';
import { opcionesDeGrupos } from '../../lib/opcionesBuscables';
import { Alert, errorMessage } from '../ui/Alert';
import { Drawer } from '../ui/Drawer';
import { Dropzone } from '../ui/Dropzone';
import { EditorRico } from '../ui/EditorRico';
import { Input, Select } from '../ui/Field';
import { MultiSelect } from '../ui/MultiSelect';
import { Switch } from '../ui/Switch';
import { EnfoqueDePortada } from './EnfoqueDePortada';
import { SelectorTamanoMosaico } from './SelectorTamanoMosaico';
import { VistaPreviaMosaico } from './VistaPreviaMosaico';

interface NoticiaDrawerProps {
  /** `null` = cerrado. El padre lo guarda para abrirlo vacío (nueva) o relleno (editar). */
  form: FormularioNoticia | null;
  onChange: (form: FormularioNoticia | null) => void;
  permisos: PermisosNoticias;
}

const ROLES_DESTINO: RolDestinoNoticia[] = ['DOCENTE', 'ESTUDIANTE', 'ACUDIENTE'];
const MAX_BYTES_FOTO_ORIGINAL = 15 * 1024 * 1024;

/**
 * El editor de noticias: a la izquierda el formulario (título, bajada, categoría, cuerpo con formato editorial, tamaño en el mosaico y portada con su punto de enfoque) y a
 * la derecha, en tiempo real, el «Mosaico de Noticias» con cómo convivirá con las que ya existen. Solo ofrece lo que quien publica puede usar (su alcance máximo, sus
 * categorías y sus sedes); el servidor lo vuelve a comprobar, así que esto es una ayuda para no equivocarse, no el candado. Toda noticia lleva una fotografía de portada.
 */
export function NoticiaDrawer({ form, onChange, permisos }: NoticiaDrawerProps) {
  const { user } = useAuth();
  const crear = useCrearNoticia();
  const actualizar = useActualizarNoticia();
  const [guardando, setGuardando] = useState(false);
  const [errorImagen, setErrorImagen] = useState<string | null>(null);
  const [preparandoFoto, setPreparandoFoto] = useState(false);
  const { anio } = useAnioDeTrabajo();
  const institucion = useInstitution();
  const categorias = useCategoriasNoticia(false, form !== null);
  const sedes = useCampuses(institucion.data?._id);
  const grados = useGrades('activo');
  const grupos = useGroups({ academic_year_id: form?.alcance === 'GRUPOS' ? anio?._id : undefined });
  const vigentes = useNoticiasParaMi(30, form !== null);
  // La portada que ya tiene (al editar) se pide con la sesión; la nueva, ya reducida, está en el formulario.
  const portadaActual = useImagenNoticia(form?.id ?? '', form?.imagen_version ?? null);

  const error = crear.error ?? actualizar.error;
  const urlPortada = form?.portada ?? (form?.imagen_version !== null ? (portadaActual.data ?? null) : null);
  const tienePortada = Boolean(form && (form.portada || (form.id && form.imagen_version !== null)));
  const hayOtraPrincipal = (vigentes.data ?? []).some((n) => n.id !== form?.id && n.tamano_mosaico === 'PRINCIPAL');

  const cerrar = () => {
    crear.reset();
    actualizar.reset();
    setErrorImagen(null);
    onChange(null);
  };

  const categoriasPermitidas = (categorias.data ?? []).filter((c) => !permisos.categorias_ids || permisos.categorias_ids.includes(c.id));
  const sedesPermitidas = (sedes.data ?? []).filter((s) => !permisos.sedes_ids || permisos.sedes_ids.includes(s._id));
  const alcances = ORDEN_ALCANCES.filter((a) => permisos.alcance_maximo && alcanceCabeEn(a, permisos.alcance_maximo)).reverse();
  const gruposPermitidos = (grupos.data ?? []).filter((g) => {
    const sede = typeof g.sede_id === 'object' ? g.sede_id._id : g.sede_id;
    return !permisos.sedes_ids || permisos.sedes_ids.includes(sede);
  });

  /** Elige la foto de portada: se reduce en el navegador (una foto de cámara pesa mucho más de lo que se necesita) y viaja con la noticia. */
  const elegirPortada = async (archivo: File | null) => {
    if (!form) return;
    setErrorImagen(null);
    if (!archivo) {
      onChange({ ...form, portada: null, portada_archivo: null });
      return;
    }
    setPreparandoFoto(true);
    try {
      const { dataUri } = await reducirPortada(archivo);
      onChange({ ...form, portada: dataUri, portada_archivo: archivo });
    } catch (err) {
      setErrorImagen(errorMessage(err));
    } finally {
      setPreparandoFoto(false);
    }
  };

  const guardar = async (e: FormEvent) => {
    e.preventDefault();
    if (!form) return;
    setGuardando(true);
    try {
      const datos = datosDeFormulario(form);
      if (form.id) await actualizar.mutateAsync({ id: form.id, ...datos });
      else await crear.mutateAsync(datos);
      cerrar();
    } catch {
      // El error de la noticia ya queda en `crear` o `actualizar` y se muestra arriba.
    } finally {
      setGuardando(false);
    }
  };

  const sinDestino =
    !form || (form.alcance === 'SEDES' && form.sedes_ids.length === 0) || (form.alcance === 'GRADOS' && form.grados_ids.length === 0) || (form.alcance === 'GRUPOS' && form.grupos_ids.length === 0);
  const sinCuerpo = !form || (textoDeHtml(form.contenido_html).length < 3 && !/<img\b/i.test(form.contenido_html));

  return (
    <Drawer
      open={form !== null}
      size="xl"
      title={form?.id ? 'Editar noticia' : 'Nueva noticia o evento'}
      onClose={cerrar}
      onSubmit={guardar}
      submitLabel={form?.id ? 'Guardar cambios' : form?.publicar_desde ? 'Programar' : 'Publicar noticia'}
      isSubmitting={guardando}
      submitDisabled={sinDestino || sinCuerpo || !tienePortada || preparandoFoto || form.titulo.trim().length < 3 || !form.categoria_id || form.roles_destino.length === 0}
    >
      {form && (
        <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_22rem]">
          <div className="min-w-0 space-y-4">
            {error && <Alert tone="error">{errorMessage(error)}</Alert>}
            {errorImagen && <Alert tone="warning">{errorImagen}</Alert>}

            <Input label="Título" value={form.titulo} maxLength={120} onChange={(e) => onChange({ ...form, titulo: e.target.value })} />
            <Input
              label="Subtítulo / bajada (entradilla)"
              value={form.subtitulo}
              maxLength={200}
              hint="Resume la noticia antes de entrar al cuerpo: es lo que se lee primero en el mosaico."
              onChange={(e) => onChange({ ...form, subtitulo: e.target.value })}
            />
            <Select label="Categoría" value={form.categoria_id} onChange={(e) => onChange({ ...form, categoria_id: e.target.value })}>
              <option value="">Elige una categoría</option>
              {categoriasPermitidas.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.nombre}
                </option>
              ))}
            </Select>

            <div className="space-y-1.5">
              <p className="text-label text-ink">Cuerpo de la noticia</p>
              <EditorRico editorial value={form.contenido_html} onChange={(contenido_html) => onChange({ ...form, contenido_html })} placeholder="Escribe la noticia…" etiqueta="Cuerpo de la noticia" />
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
              <Input label="Fecha de inicio" type="date" value={form.fecha_inicio} onChange={(e) => onChange({ ...form, fecha_inicio: e.target.value, fecha_fin: e.target.value ? form.fecha_fin : '' })} />
              <Input label="Fecha de fin (opcional)" type="date" value={form.fecha_fin} min={form.fecha_inicio || undefined} disabled={!form.fecha_inicio} onChange={(e) => onChange({ ...form, fecha_fin: e.target.value })} />
              <Input label="Hora (opcional)" type="time" value={form.hora} onChange={(e) => onChange({ ...form, hora: e.target.value })} />
            </div>
            <Input label="Lugar (opcional)" value={form.lugar} maxLength={120} onChange={(e) => onChange({ ...form, lugar: e.target.value })} />
            <Switch
              checked={form.afecta_clases}
              onChange={(afecta_clases) => onChange({ ...form, afecta_clases })}
              label="Afecta las clases ese día"
              description="Marca los eventos que suspenden o alteran las clases: sirve para medir la carga de los estudiantes."
            />

            <SelectorTamanoMosaico value={form.tamano_mosaico} onChange={(tamano_mosaico) => onChange({ ...form, tamano_mosaico })} hayOtraPrincipal={hayOtraPrincipal} />

            <div className="space-y-3">
              <p className="text-label text-ink">
                Fotografía de portada <span className="text-danger">*</span>
              </p>
              <Dropzone
                extensiones={['.png', '.jpg', '.jpeg', '.webp']}
                maxBytes={MAX_BYTES_FOTO_ORIGINAL}
                file={form.portada_archivo}
                onFile={(archivo) => void elegirPortada(archivo)}
                hint={
                  form.id && form.imagen_version !== null
                    ? 'Ya tiene portada. Elige otra foto solo si quieres reemplazarla.'
                    : 'Toda noticia lleva una foto. PNG, JPG o WEBP: se ajusta sola a un peso razonable. Solo la ven quienes pueden ver la noticia.'
                }
                disabled={preparandoFoto}
                etiqueta="Fotografía de portada"
              />
              {urlPortada && <EnfoqueDePortada src={urlPortada} x={form.enfoque_x} y={form.enfoque_y} tamano={form.tamano_mosaico} onChange={(enfoque_x, enfoque_y) => onChange({ ...form, enfoque_x, enfoque_y })} />}
              {!tienePortada && <p className="text-xs text-danger">Sin fotografía no se puede publicar la noticia.</p>}
            </div>

            <MultiSelect
              label="Dirigida a"
              options={ROLES_DESTINO.map((r) => ({ value: r, label: ETIQUETA_ROL_DESTINO[r] }))}
              selected={form.roles_destino}
              onChange={(roles_destino) => onChange({ ...form, roles_destino })}
              emptyLabel="Elige al menos un perfil"
            />
            <Select
              label="Alcance"
              value={form.alcance}
              onChange={(e) => onChange({ ...form, alcance: e.target.value as AlcanceNoticia, sedes_ids: [], grados_ids: [], grupos_ids: [] })}
            >
              {alcances.map((a) => (
                <option key={a} value={a}>
                  {ETIQUETA_ALCANCE[a]}
                </option>
              ))}
            </Select>
            {(form.alcance === 'SEDES' || form.alcance === 'GRADOS') && (
              <MultiSelect
                label={form.alcance === 'GRADOS' ? 'Sedes (opcional)' : 'Sedes'}
                options={sedesPermitidas.map((s) => ({ value: s._id, label: s.nombre }))}
                selected={form.sedes_ids}
                onChange={(sedes_ids) => onChange({ ...form, sedes_ids })}
                allLabel="Todas mis sedes"
                emptyLabel={form.alcance === 'SEDES' ? 'Elige al menos una sede' : undefined}
              />
            )}
            {form.alcance === 'GRADOS' && (
              <MultiSelect
                label="Grados"
                options={(grados.data ?? []).map((g) => ({ value: g._id, label: g.nombre }))}
                selected={form.grados_ids}
                onChange={(grados_ids) => onChange({ ...form, grados_ids })}
                emptyLabel="Elige al menos un grado"
              />
            )}
            {form.alcance === 'GRUPOS' && (
              <MultiSelect
                label="Grupos"
                options={opcionesDeGrupos(gruposPermitidos).map((o) => ({ value: o.value, label: o.detalle ? `${o.label} · ${o.detalle}` : o.label }))}
                selected={form.grupos_ids}
                onChange={(grupos_ids) => onChange({ ...form, grupos_ids })}
                emptyLabel="Elige al menos un grupo"
              />
            )}

            {!form.ya_publicada && (
              <Input
                label="Publicar el (opcional)"
                type="datetime-local"
                value={form.publicar_desde}
                onChange={(e) => onChange({ ...form, publicar_desde: e.target.value })}
                hint="Déjalo vacío para publicar ahora. Con una fecha y hora futuras, la noticia se publica sola a esa hora y entonces se avisa a sus destinatarios."
              />
            )}
            <Input
              label="Se deja de ver el (opcional)"
              type="date"
              value={form.vence_el}
              onChange={(e) => onChange({ ...form, vence_el: e.target.value })}
              hint="Si lo dejas vacío, deja de verse al terminar el evento."
            />
            {permisos.puede_fijar && <Switch checked={form.fijada} onChange={(fijada) => onChange({ ...form, fijada })} label="Fijar arriba" description="Sale primero para todos los lectores." />}
          </div>

          <aside className="min-w-0 lg:sticky lg:top-0 lg:self-start">
            <VistaPreviaMosaico form={form} categorias={categoriasPermitidas} portadaUrl={urlPortada} autor={user ? `${user.nombre} ${user.apellido}` : 'Autor'} />
          </aside>
        </div>
      )}
    </Drawer>
  );
}
