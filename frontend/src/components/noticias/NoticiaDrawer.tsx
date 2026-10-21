import { type FormEvent, useState } from 'react';
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
  useQuitarImagenNoticia,
  useSubirImagenNoticia,
} from '../../hooks/useNoticias';
import { type FormularioNoticia, ORDEN_ALCANCES, alcanceCabeEn, datosDeFormulario } from '../../lib/noticias';
import { opcionesDeGrupos } from '../../lib/opcionesBuscables';
import { Alert, errorMessage } from '../ui/Alert';
import { Button } from '../ui/Button';
import { Drawer } from '../ui/Drawer';
import { Dropzone } from '../ui/Dropzone';
import { Input, Select, Textarea } from '../ui/Field';
import { MultiSelect } from '../ui/MultiSelect';
import { Switch } from '../ui/Switch';
import { ImagenNoticia } from './ImagenNoticia';

interface NoticiaDrawerProps {
  /** `null` = cerrado. El padre lo guarda para abrirlo vacío (nueva) o relleno (editar). */
  form: FormularioNoticia | null;
  onChange: (form: FormularioNoticia | null) => void;
  permisos: PermisosNoticias;
}

const ROLES_DESTINO: RolDestinoNoticia[] = ['DOCENTE', 'ESTUDIANTE', 'ACUDIENTE'];

/**
 * El formulario de una noticia o evento. Solo ofrece lo que quien publica puede usar (su alcance máximo, sus categorías y sus sedes); el servidor lo vuelve a
 * comprobar, así que esto es una ayuda para no equivocarse, no el candado.
 */
export function NoticiaDrawer({ form, onChange, permisos }: NoticiaDrawerProps) {
  const crear = useCrearNoticia();
  const actualizar = useActualizarNoticia();
  const subirImagen = useSubirImagenNoticia();
  const quitarImagen = useQuitarImagenNoticia();
  const [guardando, setGuardando] = useState(false);
  const [errorImagen, setErrorImagen] = useState<string | null>(null);
  const { anio } = useAnioDeTrabajo();
  const institucion = useInstitution();
  const categorias = useCategoriasNoticia(false, form !== null);
  const sedes = useCampuses(institucion.data?._id);
  const grados = useGrades('activo');
  const grupos = useGroups({ academic_year_id: form?.alcance === 'GRUPOS' ? anio?._id : undefined });

  const error = crear.error ?? actualizar.error;

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

  /**
   * Guarda la noticia y, después, su imagen (la imagen necesita que la noticia exista). Si la noticia se guardó pero la imagen falló, el formulario pasa a «editar» esa
   * noticia: reintentar no la duplica.
   */
  const guardar = async (e: FormEvent) => {
    e.preventDefault();
    if (!form) return;
    setErrorImagen(null);
    setGuardando(true);
    try {
      const datos = datosDeFormulario(form);
      const guardada = form.id ? await actualizar.mutateAsync({ id: form.id, ...datos }) : await crear.mutateAsync(datos);
      try {
        if (form.imagen) await subirImagen.mutateAsync({ id: guardada.id, archivo: form.imagen });
        else if (form.quitar_imagen && form.imagen_version !== null) await quitarImagen.mutateAsync(guardada.id);
      } catch (err) {
        setErrorImagen(`La noticia se guardó, pero la imagen no se pudo subir: ${errorMessage(err)}`);
        onChange({ ...form, id: guardada.id, ya_publicada: !guardada.programada });
        return;
      }
      cerrar();
    } catch {
      // El error de la noticia ya queda en `crear` o `actualizar` y se muestra arriba.
    } finally {
      setGuardando(false);
    }
  };

  const sinDestino =
    !form || (form.alcance === 'SEDES' && form.sedes_ids.length === 0) || (form.alcance === 'GRADOS' && form.grados_ids.length === 0) || (form.alcance === 'GRUPOS' && form.grupos_ids.length === 0);

  return (
    <Drawer
      open={form !== null}
      size="lg"
      title={form?.id ? 'Editar noticia' : 'Nueva noticia o evento'}
      onClose={cerrar}
      onSubmit={guardar}
      submitLabel={form?.id ? 'Guardar cambios' : form?.publicar_desde ? 'Programar' : 'Publicar'}
      isSubmitting={guardando}
      submitDisabled={sinDestino || form.titulo.trim().length < 3 || form.descripcion.trim().length < 3 || !form.categoria_id || form.roles_destino.length === 0}
    >
      {form && (
        <div className="space-y-4">
          {error && <Alert tone="error">{errorMessage(error)}</Alert>}
          {errorImagen && <Alert tone="warning">{errorImagen}</Alert>}
          <Input label="Título" value={form.titulo} maxLength={120} onChange={(e) => onChange({ ...form, titulo: e.target.value })} />
          <Select label="Categoría" value={form.categoria_id} onChange={(e) => onChange({ ...form, categoria_id: e.target.value })}>
            <option value="">Elige una categoría</option>
            {categoriasPermitidas.map((c) => (
              <option key={c.id} value={c.id}>
                {c.nombre}
              </option>
            ))}
          </Select>
          <Textarea label="Descripción" value={form.descripcion} maxLength={4000} rows={6} onChange={(e) => onChange({ ...form, descripcion: e.target.value })} />

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

          <div className="space-y-2">
            <p className="text-label text-ink">Imagen (opcional)</p>
            {form.imagen_version !== null && !form.quitar_imagen && !form.imagen && form.id && (
              <div className="space-y-2">
                <ImagenNoticia id={form.id} version={form.imagen_version} titulo={form.titulo} compacta />
                <Button type="button" variant="soft-danger" onClick={() => onChange({ ...form, quitar_imagen: true })}>
                  Quitar la imagen
                </Button>
              </div>
            )}
            {form.quitar_imagen && <Alert tone="info">La imagen se quitará al guardar.</Alert>}
            <Dropzone
              extensiones={['.png', '.jpg', '.jpeg', '.webp']}
              maxBytes={2 * 1024 * 1024}
              file={form.imagen}
              onFile={(imagen) => onChange({ ...form, imagen, quitar_imagen: false })}
              hint="PNG, JPG o WEBP de hasta 2 MB. Solo la ven quienes pueden ver la noticia."
              etiqueta="Imagen de la noticia"
            />
          </div>

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
      )}
    </Drawer>
  );
}
