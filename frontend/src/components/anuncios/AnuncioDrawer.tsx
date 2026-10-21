import type { FormEvent } from 'react';
import { Alert, errorMessage } from '../ui/Alert';
import { ROL_LABELS } from '../ui/Badge';
import { Drawer } from '../ui/Drawer';
import { Input, Textarea } from '../ui/Field';
import { MultiSelect } from '../ui/MultiSelect';
import { Switch } from '../ui/Switch';
import type { FormularioAnuncio } from '../../lib/anuncios';
import { useActualizarAnuncio, useCrearAnuncio } from '../../hooks/useNotificaciones';
import { ROLES } from '../../types/api';

interface AnuncioDrawerProps {
  /** `null` = cerrado. El padre guarda el formulario para poder abrirlo ya relleno (editar) o vacío (nuevo). */
  form: FormularioAnuncio | null;
  onChange: (form: FormularioAnuncio | null) => void;
}

/** El formulario de un anuncio (M28): lo usan la página de Anuncios y el botón «Redactar comunicado» de los dashboards de rectoría y coordinación. */
export function AnuncioDrawer({ form, onChange }: AnuncioDrawerProps) {
  const crear = useCrearAnuncio();
  const actualizar = useActualizarAnuncio();
  const guardando = crear.isPending || actualizar.isPending;
  const error = crear.error ?? actualizar.error;

  const cerrar = () => {
    crear.reset();
    actualizar.reset();
    onChange(null);
  };

  const guardar = (e: FormEvent) => {
    e.preventDefault();
    if (!form) return;
    const datos = {
      titulo: form.titulo,
      cuerpo: form.cuerpo,
      roles_destino: form.roles_destino,
      fijado: form.fijado,
      vence_el: form.vence_el ? `${form.vence_el}T23:59:59-05:00` : null,
    };
    const opciones = { onSuccess: cerrar };
    if (form.id) actualizar.mutate({ id: form.id, ...datos }, opciones);
    else crear.mutate(datos, opciones);
  };

  return (
    <Drawer
      open={form !== null}
      title={form?.id ? 'Editar anuncio' : 'Nuevo anuncio'}
      onClose={cerrar}
      onSubmit={guardar}
      submitLabel="Publicar"
      isSubmitting={guardando}
      submitDisabled={!form || form.titulo.trim().length < 3 || form.cuerpo.trim().length < 3 || form.roles_destino.length === 0}
    >
      {form && (
        <div className="space-y-4">
          {error && <Alert tone="error">{errorMessage(error)}</Alert>}
          <Input label="Título" value={form.titulo} maxLength={120} onChange={(e) => onChange({ ...form, titulo: e.target.value })} />
          <Textarea label="Mensaje" value={form.cuerpo} maxLength={2000} rows={6} onChange={(e) => onChange({ ...form, cuerpo: e.target.value })} />
          <MultiSelect
            label="Dirigido a"
            options={ROLES.map((r) => ({ value: r, label: ROL_LABELS[r] }))}
            selected={form.roles_destino}
            onChange={(roles_destino) => onChange({ ...form, roles_destino })}
            emptyLabel="Elige al menos un perfil"
          />
          <Input label="Vence el (opcional)" type="date" value={form.vence_el} onChange={(e) => onChange({ ...form, vence_el: e.target.value })} />
          <Switch checked={form.fijado} onChange={(fijado) => onChange({ ...form, fijado })} label="Fijar arriba del tablero" />
        </div>
      )}
    </Drawer>
  );
}
