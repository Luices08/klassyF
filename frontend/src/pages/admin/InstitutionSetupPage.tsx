import { type ChangeEvent, type FormEvent, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Alert, errorMessage } from '../../components/ui/Alert';
import { Chip, EstadoUsuarioBadge } from '../../components/ui/Badge';
import { Button } from '../../components/ui/Button';
import { Card, CardHeader } from '../../components/ui/Card';
import { Drawer } from '../../components/ui/Drawer';
import { Input, Select } from '../../components/ui/Field';
import { IconButton } from '../../components/ui/IconButton';
import { PageHeader } from '../../components/ui/PageHeader';
import { Spinner } from '../../components/ui/Spinner';
import { Table, TableBody, TableHead, Td, Th } from '../../components/ui/Table';
import { BuildingIcon, PlusIcon, TrashIcon } from '../../components/ui/icons';
import { PlantillaFranjasDrawer } from '../../components/jornadas/PlantillaFranjasDrawer';
import { avisosCalendario } from '../../lib/calendarioColombia';
import { useInstitution, useSetupInstitution, useUpdateInstitution } from '../../hooks/useInstitution';
import {
  MODALIDADES_INSTITUCION,
  NOMBRES_MODALIDAD,
  type Calendario,
  type EstadoActivo,
  type Institution,
  type ModalidadInstitucion,
  type Periodo,
  type PoliticaAforoAula,
} from '../../types/domain';

const LOGO_MAX_BYTES = 500 * 1024;

const MIN_PERIODOS = 2;
const MAX_PERIODOS = 4;

interface PeriodoForm extends Periodo {
  _key: string;
}

function nuevoPeriodo(numero: number): PeriodoForm {
  return { _key: crypto.randomUUID(), numero, nombre: `Periodo ${numero}`, porcentaje: 0, fecha_inicio: '', fecha_fin: '' };
}

function defaultPeriodos(): PeriodoForm[] {
  return [1, 2, 3, 4].map((numero) => ({ ...nuevoPeriodo(numero), porcentaje: 25 }));
}

export function InstitutionSetupPage() {
  const institutionQuery = useInstitution();

  return (
    <div className="space-y-4">
      <PageHeader
        title="Configuración institucional"
        subtitle="Klassy se despliega por institución: un solo colegio por instalación. Sus sedes se administran en Sedes y jornadas."
      />

      {institutionQuery.isLoading && <Spinner label="Cargando institución..." />}
      {institutionQuery.isError && <Alert tone="error">{errorMessage(institutionQuery.error)}</Alert>}

      {!institutionQuery.isLoading && !institutionQuery.isError && (
        institutionQuery.data ? (
          <InstitutionOverview institution={institutionQuery.data} />
        ) : (
          <InstitutionWizard />
        )
      )}
    </div>
  );
}

interface StaticFieldProps {
  label: string;
  value: string;
}

function StaticField({ label, value }: StaticFieldProps) {
  return (
    <div>
      <p className="text-label uppercase tracking-wide text-muted">{label}</p>
      <p className="mt-0.5 text-sm font-medium text-ink">{value}</p>
    </div>
  );
}

function InstitutionOverview({ institution }: { institution: Institution }) {
  const navigate = useNavigate();
  const updateInstitution = useUpdateInstitution();

  const [drawerOpen, setDrawerOpen] = useState(false);
  const [plantillaAbierta, setPlantillaAbierta] = useState(false);
  const [logoError, setLogoError] = useState<string | null>(null);
  const [form, setForm] = useState({
    nombre: institution.nombre,
    codigo_dane: institution.codigo_dane,
    nit: institution.nit,
    resolucion_aprobacion: institution.resolucion_aprobacion,
    estado: institution.estado,
    logo_url: institution.logo_url,
    correo_secretaria: institution.correo_secretaria ?? '',
    horario_atencion: institution.horario_atencion ?? '',
    modalidad: institution.modalidad ?? 'PRESENCIAL',
    politica_aforo_aula: institution.politica_aforo_aula ?? 'BLOQUEAR',
    confirm_password: '',
  });

  function abrirModificar() {
    updateInstitution.reset();
    setLogoError(null);
    setForm({
      nombre: institution.nombre,
      codigo_dane: institution.codigo_dane,
      nit: institution.nit,
      resolucion_aprobacion: institution.resolucion_aprobacion,
      estado: institution.estado,
      logo_url: institution.logo_url,
      correo_secretaria: institution.correo_secretaria ?? '',
      horario_atencion: institution.horario_atencion ?? '',
      modalidad: institution.modalidad ?? 'PRESENCIAL',
      politica_aforo_aula: institution.politica_aforo_aula ?? 'BLOQUEAR',
      confirm_password: '',
    });
    setDrawerOpen(true);
  }

  function handleLogoChange(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setLogoError(null);

    if (file.size > LOGO_MAX_BYTES) {
      setLogoError('El logo no puede pesar más de 500KB.');
      e.target.value = '';
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') setForm((f) => ({ ...f, logo_url: reader.result as string }));
    };
    reader.readAsDataURL(file);
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    updateInstitution.reset();
    await updateInstitution.mutateAsync(form);
    setDrawerOpen(false);
  }

  return (
    <div className="space-y-4">
      {updateInstitution.isSuccess && <Alert tone="success">Institución actualizada correctamente.</Alert>}

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader
            title="Datos de la institución"
            action={
              <Button type="button" variant="outline" onClick={abrirModificar}>
                Modificar
              </Button>
            }
          />
          <div className="mb-4 flex items-center gap-4">
            {institution.logo_url ? (
              <img
                src={institution.logo_url}
                alt={`Logo de ${institution.nombre}`}
                className="h-16 w-16 rounded-lg border border-border object-contain"
              />
            ) : (
              <div className="flex h-16 w-16 items-center justify-center rounded-lg border border-dashed border-border text-muted">
                <BuildingIcon className="h-6 w-6" />
              </div>
            )}
            <EstadoUsuarioBadge value={institution.estado} />
          </div>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <StaticField label="Nombre" value={institution.nombre} />
            <StaticField label="Código DANE" value={institution.codigo_dane} />
            <StaticField label="NIT" value={institution.nit} />
            <StaticField label="Resolución de aprobación" value={institution.resolucion_aprobacion} />
            <StaticField label="Correo de secretaría" value={institution.correo_secretaria || '—'} />
            <StaticField label="Horario de atención" value={institution.horario_atencion || '—'} />
            <StaticField label="Modalidad" value={institution.modalidad === 'VIRTUAL' ? 'Virtual' : 'Presencial'} />
            {institution.modalidad !== 'VIRTUAL' && (
              <StaticField
                label="Si el cupo de un grupo excede el aforo de su aula"
                value={institution.politica_aforo_aula === 'ADVERTIR' ? 'Solo advertir' : 'Bloquear la creación'}
              />
            )}
          </div>
        </Card>

        <Card>
          <CardHeader title="Sedes de la institución" subtitle="Agregar, editar o eliminar sedes y sus jornadas." />
          <p className="text-sm text-muted">
            Esta institución puede tener varias sedes; cada una con sus propias jornadas operativas. Esa gestión
            vive en su propio módulo.
          </p>
          <Button type="button" variant="outline" className="mt-4" onClick={() => navigate('/admin/sedes')}>
            <BuildingIcon className="h-4 w-4" />
            Ir a sedes y jornadas
          </Button>
        </Card>
      </div>

      <Card>
        <CardHeader
          title="Plantilla de franjas horarias"
          subtitle="Clases y descansos base que se cargan en cada jornada; el módulo de horarios (M09) usa esa misma estructura."
          action={
            <Button type="button" variant="outline" onClick={() => setPlantillaAbierta(true)}>
              {institution.plantilla_franjas.length > 0 ? 'Editar plantilla' : 'Definir plantilla'}
            </Button>
          }
        />
        {institution.plantilla_franjas.length === 0 ? (
          <p className="text-sm text-muted">
            Aún no hay plantilla: cada jornada se configura a mano en Sedes y jornadas. Con una plantilla podrás cargar
            la estructura completa en todas las jornadas con un clic.
          </p>
        ) : (
          <div className="flex flex-wrap gap-2">
            {institution.plantilla_franjas.map((b, i) => (
              <Chip key={`${b.nombre}-${i}`} tone={b.tipo === 'CLASE' ? 'blue' : 'neutral'}>
                {b.nombre} · {b.duracion_min} min
              </Chip>
            ))}
          </div>
        )}
      </Card>

      <Card>
        <CardHeader title="Institución registrada" />
        <Table>
          <TableHead>
            <Th>Nombre</Th>
            <Th>Código DANE</Th>
            <Th>NIT</Th>
            <Th />
          </TableHead>
          <TableBody>
            <tr>
              <Td className="font-medium text-ink">{institution.nombre}</Td>
              <Td>{institution.codigo_dane}</Td>
              <Td>{institution.nit}</Td>
              <Td>
                <div className="flex justify-end">
                  <IconButton
                    tone="edit"
                    label="Ir a sedes y jornadas"
                    icon={<BuildingIcon />}
                    onClick={() => navigate('/admin/sedes')}
                  />
                </div>
              </Td>
            </tr>
          </TableBody>
        </Table>
      </Card>

      <PlantillaFranjasDrawer
        open={plantillaAbierta}
        plantilla={institution.plantilla_franjas}
        onClose={() => setPlantillaAbierta(false)}
      />

      <Drawer
        open={drawerOpen}
        title="Modificar institución"
        subtitle="Requiere tu contraseña de administrador para confirmar el cambio."
        onClose={() => setDrawerOpen(false)}
        onSubmit={handleSubmit}
        submitLabel="Guardar cambios"
        isSubmitting={updateInstitution.isPending}
      >
        {updateInstitution.isError && <Alert tone="error">{errorMessage(updateInstitution.error)}</Alert>}
        <Input label="Nombre" required value={form.nombre} onChange={(e) => setForm((f) => ({ ...f, nombre: e.target.value }))} />
        <Input
          label="Código DANE (12 dígitos)"
          required
          pattern="\d{12}"
          value={form.codigo_dane}
          onChange={(e) => setForm((f) => ({ ...f, codigo_dane: e.target.value }))}
        />
        <Input label="NIT" required value={form.nit} onChange={(e) => setForm((f) => ({ ...f, nit: e.target.value }))} />
        <Input
          label="Resolución de aprobación"
          required
          value={form.resolucion_aprobacion}
          onChange={(e) => setForm((f) => ({ ...f, resolucion_aprobacion: e.target.value }))}
        />
        <Select
          label="Estado"
          value={form.estado}
          onChange={(e) => setForm((f) => ({ ...f, estado: e.target.value as EstadoActivo }))}
        >
          <option value="activo">Activa</option>
          <option value="inactivo">Inactiva</option>
        </Select>

        <Input
          label="Correo de secretaría académica (opcional)"
          type="email"
          value={form.correo_secretaria}
          onChange={(e) => setForm((f) => ({ ...f, correo_secretaria: e.target.value }))}
          hint="Se muestra en el pie de página del sitio público."
        />
        <Input
          label="Horario de atención en ventanilla (opcional)"
          value={form.horario_atencion}
          onChange={(e) => setForm((f) => ({ ...f, horario_atencion: e.target.value }))}
          hint='Ej. "Lunes a viernes, 7:00 a.m. – 3:00 p.m."'
        />
        <Select
          label="Modalidad"
          value={form.modalidad}
          onChange={(e) => setForm((f) => ({ ...f, modalidad: e.target.value as ModalidadInstitucion }))}
          hint="Una institución virtual no usa aulas: se oculta el módulo Espacios y aulas y los grupos no llevan aula. Los espacios ya registrados se conservan."
        >
          {MODALIDADES_INSTITUCION.map((m) => (
            <option key={m} value={m}>
              {NOMBRES_MODALIDAD[m]}
            </option>
          ))}
        </Select>
        {form.modalidad === 'PRESENCIAL' && (
          <Select
            label="Si el cupo de un grupo excede el aforo de su aula"
            value={form.politica_aforo_aula}
            onChange={(e) => setForm((f) => ({ ...f, politica_aforo_aula: e.target.value as PoliticaAforoAula }))}
            hint="Aplica solo a grupos con aula asignada (Espacios y aulas)."
          >
            <option value="BLOQUEAR">Bloquear la creación del grupo</option>
            <option value="ADVERTIR">Solo advertir (queda en auditoría)</option>
          </Select>
        )}

        <div>
          {form.logo_url && (
            <div className="mb-2 flex items-center gap-3">
              <img src={form.logo_url} alt="Logo actual" className="h-12 w-12 rounded-lg border border-border object-contain" />
              <button
                type="button"
                onClick={() => setForm((f) => ({ ...f, logo_url: null }))}
                className="text-xs font-semibold text-danger hover:underline"
              >
                Quitar logo
              </button>
            </div>
          )}
          <Input
            label="Logo institucional (opcional, máx. 500KB)"
            type="file"
            accept="image/*"
            onChange={handleLogoChange}
            error={logoError ?? undefined}
            hint="Se usa en boletines y certificados."
          />
        </div>

        <Input
          label="Tu contraseña de administrador"
          type="password"
          required
          hint="Confirma tu contraseña para autorizar el cambio."
          value={form.confirm_password}
          onChange={(e) => setForm((f) => ({ ...f, confirm_password: e.target.value }))}
        />
      </Drawer>
    </div>
  );
}

function InstitutionWizard() {
  const setup = useSetupInstitution();

  const [institucion, setInstitucion] = useState({
    nombre: '',
    codigo_dane: '',
    nit: '',
    resolucion_aprobacion: '',
    modalidad: 'PRESENCIAL' as ModalidadInstitucion,
  });
  const [sede, setSede] = useState({ nombre: 'Sede Principal', codigo_dane_sede: '', direccion: '' });
  const [year, setYear] = useState(new Date().getFullYear());
  const [calendario, setCalendario] = useState<Calendario>('A');
  const [periodos, setPeriodos] = useState<PeriodoForm[]>(defaultPeriodos());

  const totalPorcentaje = periodos.reduce((sum, p) => sum + (Number(p.porcentaje) || 0), 0);
  const porcentajeOk = totalPorcentaje === 100;
  const avisos = avisosCalendario(calendario, year, periodos);

  function updatePeriodo(index: number, patch: Partial<Periodo>) {
    setPeriodos((prev) => prev.map((p, i) => (i === index ? { ...p, ...patch } : p)));
  }

  function addPeriodo() {
    setPeriodos((prev) => (prev.length >= MAX_PERIODOS ? prev : [...prev, nuevoPeriodo(prev.length + 1)]));
  }

  function removePeriodo(index: number) {
    setPeriodos((prev) =>
      prev.length <= MIN_PERIODOS ? prev : prev.filter((_, i) => i !== index).map((p, i) => ({ ...p, numero: i + 1 }))
    );
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setup.reset();

    await setup.mutateAsync({
      institucion,
      sede_principal: sede,
      anio_lectivo: { year, calendario, periodos: periodos.map(({ _key, ...p }) => p) },
    });
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {setup.isError && <Alert tone="error">{errorMessage(setup.error)}</Alert>}

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader title="Institución" />
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Input
              label="Nombre"
              required
              value={institucion.nombre}
              onChange={(e) => setInstitucion((s) => ({ ...s, nombre: e.target.value }))}
            />
            <Input
              label="Código DANE (12 dígitos)"
              required
              pattern="\d{12}"
              value={institucion.codigo_dane}
              onChange={(e) => setInstitucion((s) => ({ ...s, codigo_dane: e.target.value }))}
            />
            <Input
              label="NIT"
              required
              value={institucion.nit}
              onChange={(e) => setInstitucion((s) => ({ ...s, nit: e.target.value }))}
            />
            <Input
              label="Resolución de aprobación"
              required
              value={institucion.resolucion_aprobacion}
              onChange={(e) => setInstitucion((s) => ({ ...s, resolucion_aprobacion: e.target.value }))}
            />
            <Select
              label="Modalidad"
              value={institucion.modalidad}
              onChange={(e) => setInstitucion((s) => ({ ...s, modalidad: e.target.value as ModalidadInstitucion }))}
              hint="Una institución virtual no usa aulas ni espacios físicos. Se puede cambiar después."
            >
              {MODALIDADES_INSTITUCION.map((m) => (
                <option key={m} value={m}>
                  {NOMBRES_MODALIDAD[m]}
                </option>
              ))}
            </Select>
          </div>
        </Card>

        <Card>
          <CardHeader title="Sede principal" />
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Input
              label="Nombre"
              required
              value={sede.nombre}
              onChange={(e) => setSede((s) => ({ ...s, nombre: e.target.value }))}
            />
            <Input
              label="Código DANE de la sede (12 dígitos)"
              required
              pattern="\d{12}"
              value={sede.codigo_dane_sede}
              onChange={(e) => setSede((s) => ({ ...s, codigo_dane_sede: e.target.value }))}
            />
            <Input
              label="Dirección"
              required
              className="sm:col-span-2"
              value={sede.direccion}
              onChange={(e) => setSede((s) => ({ ...s, direccion: e.target.value }))}
            />
          </div>
        </Card>
      </div>

      <Card>
        <CardHeader
          title="Año lectivo"
          subtitle="De 2 a 4 periodos, cuyos porcentajes deben sumar exactamente 100."
          action={
            <Button type="button" variant="outline" onClick={addPeriodo} disabled={periodos.length >= MAX_PERIODOS}>
              <PlusIcon className="h-4 w-4" />
              Agregar periodo
            </Button>
          }
        />
        <div className="mb-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Input label="Año" type="number" required value={year} onChange={(e) => setYear(Number(e.target.value))} />
          <Select label="Calendario" value={calendario} onChange={(e) => setCalendario(e.target.value as Calendario)}>
            <option value="A">A</option>
            <option value="B">B</option>
          </Select>
        </div>

        <div className="space-y-3">
          {periodos.map((p, i) => (
            <div key={p._key} className="grid grid-cols-2 gap-2 sm:grid-cols-12 sm:items-end">
              <div className="col-span-2 sm:col-span-3">
                <p className="mb-1 text-sm font-medium text-body">Periodo {p.numero}</p>
                <Input label="Nombre" value={p.nombre} onChange={(e) => updatePeriodo(i, { nombre: e.target.value })} />
              </div>
              <Input
                label="%"
                type="number"
                min={0}
                max={100}
                className="sm:col-span-2"
                value={p.porcentaje}
                onChange={(e) => updatePeriodo(i, { porcentaje: Number(e.target.value) })}
              />
              <Input
                label="Inicio"
                type="date"
                required
                className="sm:col-span-3"
                value={p.fecha_inicio}
                onChange={(e) => updatePeriodo(i, { fecha_inicio: e.target.value })}
              />
              <Input
                label="Fin"
                type="date"
                required
                className="sm:col-span-3"
                value={p.fecha_fin}
                onChange={(e) => updatePeriodo(i, { fecha_fin: e.target.value })}
              />
              <div className="flex justify-end sm:col-span-1">
                <IconButton
                  tone="danger"
                  label="Quitar periodo"
                  icon={<TrashIcon />}
                  disabled={periodos.length <= MIN_PERIODOS}
                  onClick={() => removePeriodo(i)}
                />
              </div>
            </div>
          ))}
        </div>

        <p className={`mt-3 text-sm font-semibold ${porcentajeOk ? 'text-success' : 'text-danger'}`}>
          Suma actual: {totalPorcentaje}% {porcentajeOk ? '✓' : '(debe ser 100%)'}
        </p>

        {avisos.length > 0 && (
          <Alert tone="warning">
            <ul className="list-disc space-y-0.5 pl-4">
              {avisos.map((aviso) => (
                <li key={aviso}>{aviso}</li>
              ))}
            </ul>
          </Alert>
        )}
      </Card>

      <Button type="submit" isLoading={setup.isPending} disabled={!porcentajeOk}>
        Crear institución
      </Button>
    </form>
  );
}
