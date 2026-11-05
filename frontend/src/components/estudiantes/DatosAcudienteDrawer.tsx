import { type FormEvent, useState } from 'react';
import { Link } from 'react-router-dom';
import { Alert, errorMessage } from '../ui/Alert';
import { Chip } from '../ui/Badge';
import { Button } from '../ui/Button';
import { Drawer } from '../ui/Drawer';
import { Input, Select } from '../ui/Field';
import { useAuth } from '../../context/AuthContext';
import { useActualizarAcudiente, useEstudiantesDeAcudiente } from '../../hooks/useGuardians';
import { TIPOS_DOCUMENTO, type StudentGuardianRelation, type TipoDocumento } from '../../types/domain';

function Dato({ etiqueta, valor }: { etiqueta: string; valor?: string | null }) {
  return (
    <div>
      <dt className="text-label text-muted">{etiqueta}</dt>
      <dd className="text-sm text-ink">{valor || '—'}</dd>
    </div>
  );
}

function formularioDe(rel: StudentGuardianRelation) {
  const g = rel.guardian_id;
  return {
    tipo_documento: g.tipo_documento as TipoDocumento,
    numero_documento: g.numero_documento,
    nombre: g.nombre,
    apellido: g.apellido,
    telefono_principal: g.telefono_principal,
    telefono_secundario: g.telefono_secundario ?? '',
    email: g.email ?? '',
    ocupacion: g.ocupacion ?? '',
    direccion: g.direccion ?? '',
  };
}

/** Todos los datos del acudiente de un estudiante, con la opción de corregirlos (el documento solo lo corrigen ADMIN y secretaría). */
export function DatosAcudienteDrawer({ relacion, onClose }: { relacion: StudentGuardianRelation; onClose: () => void }) {
  const { user } = useAuth();
  const puedeCorregirDocumento = user?.rol === 'ADMIN' || user?.rol === 'SECRETARIA';
  const g = relacion.guardian_id;
  const [editando, setEditando] = useState(false);
  const [form, setForm] = useState(() => formularioDe(relacion));
  const actualizar = useActualizarAcudiente();
  const hijos = useEstudiantesDeAcudiente(g._id);

  const cambiaDocumento = form.numero_documento.trim().toUpperCase() !== g.numero_documento || form.tipo_documento !== g.tipo_documento;

  function guardar(e: FormEvent) {
    e.preventDefault();
    if (cambiaDocumento) {
      const aviso = g.user_id
        ? 'Vas a corregir el documento de este acudiente. Como tiene acceso al portal, también cambia el número con el que inicia sesión. ¿Continuar?'
        : 'Vas a corregir el documento de este acudiente. ¿Continuar?';
      if (!window.confirm(aviso)) return;
    }
    actualizar.mutate(
      {
        id: g._id,
        ...(cambiaDocumento ? { tipo_documento: form.tipo_documento, numero_documento: form.numero_documento.trim() } : {}),
        nombre: form.nombre.trim(),
        apellido: form.apellido.trim(),
        telefono_principal: form.telefono_principal.trim(),
        telefono_secundario: form.telefono_secundario.trim(),
        email: form.email.trim(),
        ocupacion: form.ocupacion.trim(),
        direccion: form.direccion.trim(),
      },
      { onSuccess: onClose }
    );
  }

  const campo = (clave: keyof typeof form) => ({ value: form[clave], onChange: (e: { target: { value: string } }) => setForm((f) => ({ ...f, [clave]: e.target.value })) });

  return (
    <Drawer
      open
      title={editando ? 'Editar acudiente' : 'Datos del acudiente'}
      subtitle={`${g.nombre} ${g.apellido}`}
      onClose={onClose}
      onSubmit={editando ? guardar : undefined}
      submitLabel="Guardar cambios"
      isSubmitting={actualizar.isPending}
      size="lg"
    >
      {editando ? (
        <>
          {actualizar.isError && <Alert tone="error">{errorMessage(actualizar.error)}</Alert>}
          <div className="grid gap-4 sm:grid-cols-2">
            <Select label="Tipo de documento" value={form.tipo_documento} disabled={!puedeCorregirDocumento} onChange={(e) => setForm((f) => ({ ...f, tipo_documento: e.target.value as TipoDocumento }))}>
              {TIPOS_DOCUMENTO.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </Select>
            <Input label="Número de documento" required disabled={!puedeCorregirDocumento} {...campo('numero_documento')} />
          </div>
          {!puedeCorregirDocumento && <p className="text-xs text-muted">El documento solo lo corrige el administrador o la secretaría.</p>}
          {puedeCorregirDocumento && cambiaDocumento && (
            <Alert tone="warning">
              Estás cambiando el documento. Úsalo solo para corregir un error de digitación: si es otra persona, vincula a ese acudiente en lugar de modificar este.
              {g.user_id && ' Como tiene acceso al portal, también cambia el número con el que inicia sesión.'}
            </Alert>
          )}
          <div className="grid gap-4 sm:grid-cols-2">
            <Input label="Nombres" required {...campo('nombre')} />
            <Input label="Apellidos" required {...campo('apellido')} />
            <Input label="Teléfono principal" required {...campo('telefono_principal')} />
            <Input label="Teléfono secundario" {...campo('telefono_secundario')} />
            <Input label="Correo" type="email" {...campo('email')} />
            <Input label="Ocupación" {...campo('ocupacion')} />
          </div>
          <Input label="Dirección" {...campo('direccion')} />
          <div className="flex justify-start">
            <Button
              type="button"
              variant="secondary"
              onClick={() => {
                setEditando(false);
                setForm(formularioDe(relacion));
                actualizar.reset();
              }}
            >
              Volver sin guardar
            </Button>
          </div>
        </>
      ) : (
        <>
          <dl className="grid gap-4 sm:grid-cols-2">
            <Dato etiqueta="Documento" valor={`${g.tipo_documento} ${g.numero_documento}`} />
            <Dato etiqueta="Parentesco con este estudiante" valor={relacion.parentesco} />
            <Dato etiqueta="Teléfono principal" valor={g.telefono_principal} />
            <Dato etiqueta="Teléfono secundario" valor={g.telefono_secundario} />
            <Dato etiqueta="Correo" valor={g.email} />
            <Dato etiqueta="Ocupación" valor={g.ocupacion} />
            <div className="sm:col-span-2">
              <Dato etiqueta="Dirección" valor={g.direccion} />
            </div>
          </dl>
          <div className="flex flex-wrap gap-2">
            {relacion.es_principal && <Chip tone="blue">Acudiente principal</Chip>}
            <Chip tone={relacion.autorizado_retiro ? 'green' : 'neutral'}>{relacion.autorizado_retiro ? 'Autorizado para retirar' : 'Sin autorización de retiro'}</Chip>
            <Chip tone={g.user_id ? 'green' : 'neutral'}>{g.user_id ? 'Con acceso al portal' : 'Sin acceso al portal'}</Chip>
            {g.estado === 'inactivo' && <Chip tone="red">Inactivo</Chip>}
          </div>

          <div className="space-y-2 border-t border-border pt-4">
            <h3 className="text-label font-semibold text-ink">Estudiantes a su cargo</h3>
            {hijos.isLoading && <p className="text-sm text-muted">Cargando…</p>}
            {hijos.isError && <Alert tone="error">{errorMessage(hijos.error)}</Alert>}
            {hijos.data && (
              <ul className="space-y-1 text-sm">
                {hijos.data.map((h) => (
                  <li key={h.vinculo_id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-soft px-3 py-2">
                    <span>
                      <Link to={`/admin/students/${h.estudiante_id}`} className="font-medium text-primary hover:underline">
                        {h.nombre}
                      </Link>
                      <span className="text-muted"> · {h.documento}</span>
                    </span>
                    <span className="text-muted">{h.parentesco}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="flex justify-end">
            <Button onClick={() => setEditando(true)}>Editar datos</Button>
          </div>
        </>
      )}
    </Drawer>
  );
}
