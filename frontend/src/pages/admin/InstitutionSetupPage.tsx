import { type FormEvent, useState } from 'react';
import { Link } from 'react-router-dom';
import { Alert, errorMessage } from '../../components/ui/Alert';
import { Button } from '../../components/ui/Button';
import { Card, CardHeader } from '../../components/ui/Card';
import { Input, Select } from '../../components/ui/Field';
import { useInstitutionConfig } from '../../context/InstitutionConfigContext';
import { useSetupInstitution } from '../../hooks/useInstitution';
import type { Periodo } from '../../types/domain';

function defaultPeriodos(): Periodo[] {
  return [1, 2, 3, 4].map((numero) => ({
    numero,
    nombre: `Periodo ${numero}`,
    porcentaje: 25,
    fecha_inicio: '',
    fecha_fin: '',
  }));
}

export function InstitutionSetupPage() {
  const setup = useSetupInstitution();
  const { setConfig } = useInstitutionConfig();

  const [institucion, setInstitucion] = useState({ nombre: '', codigo_dane: '', nit: '', resolucion_aprobacion: '' });
  const [sede, setSede] = useState({ nombre: 'Sede Principal', codigo_dane_sede: '', direccion: '' });
  const [year, setYear] = useState(new Date().getFullYear());
  const [calendario, setCalendario] = useState<'A' | 'B'>('A');
  const [periodos, setPeriodos] = useState<Periodo[]>(defaultPeriodos());

  const totalPorcentaje = periodos.reduce((sum, p) => sum + (Number(p.porcentaje) || 0), 0);
  const porcentajeOk = totalPorcentaje === 100;

  function updatePeriodo(index: number, patch: Partial<Periodo>) {
    setPeriodos((prev) => prev.map((p, i) => (i === index ? { ...p, ...patch } : p)));
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setup.reset();

    const result = await setup.mutateAsync({
      institucion,
      sede_principal: sede,
      anio_lectivo: { year, calendario, periodos },
    });

    setConfig({
      institutionId: result.institution._id,
      institutionName: result.institution.nombre,
      sedeId: result.sede_principal._id,
      sedeName: result.sede_principal.nombre,
      academicYearId: result.academic_year._id,
      academicYearYear: result.academic_year.year,
    });
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-bold text-slate-900">Configuración institucional</h1>
        <p className="text-sm text-slate-500">
          Crea el colegio, su sede principal y el año lectivo inicial con sus 4 periodos.
        </p>
      </div>

      {setup.isError && <Alert tone="error">{errorMessage(setup.error)}</Alert>}
      {setup.isSuccess && (
        <Alert tone="success">
          Institución creada correctamente. Año lectivo {setup.data.academic_year.year}, sede{' '}
          {setup.data.sede_principal.nombre}. Continúa en{' '}
          <Link to="/admin/sedes" className="font-semibold underline">
            Sedes y jornadas
          </Link>{' '}
          para agregar sedes adicionales y habilitar jornadas antes de crear grupos.
        </Alert>
      )}

      <form onSubmit={handleSubmit} className="space-y-6">
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

        <Card>
          <CardHeader
            title="Año lectivo"
            subtitle="La suma de los porcentajes de los 4 periodos debe dar exactamente 100."
          />
          <div className="mb-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Input
              label="Año"
              type="number"
              required
              value={year}
              onChange={(e) => setYear(Number(e.target.value))}
            />
            <Select label="Calendario" value={calendario} onChange={(e) => setCalendario(e.target.value as 'A' | 'B')}>
              <option value="A">A</option>
              <option value="B">B</option>
            </Select>
          </div>

          <div className="space-y-3">
            {periodos.map((p, i) => (
              <div key={p.numero} className="grid grid-cols-2 gap-2 sm:grid-cols-5 sm:items-end">
                <div className="col-span-2 sm:col-span-1">
                  <p className="mb-1 text-sm font-medium text-slate-700">Periodo {p.numero}</p>
                  <Input label="Nombre" value={p.nombre} onChange={(e) => updatePeriodo(i, { nombre: e.target.value })} />
                </div>
                <Input
                  label="%"
                  type="number"
                  min={0}
                  max={100}
                  value={p.porcentaje}
                  onChange={(e) => updatePeriodo(i, { porcentaje: Number(e.target.value) })}
                />
                <Input
                  label="Inicio"
                  type="date"
                  required
                  value={p.fecha_inicio}
                  onChange={(e) => updatePeriodo(i, { fecha_inicio: e.target.value })}
                />
                <Input
                  label="Fin"
                  type="date"
                  required
                  value={p.fecha_fin}
                  onChange={(e) => updatePeriodo(i, { fecha_fin: e.target.value })}
                />
              </div>
            ))}
          </div>

          <p className={`mt-3 text-sm font-semibold ${porcentajeOk ? 'text-emerald-600' : 'text-red-600'}`}>
            Suma actual: {totalPorcentaje}% {porcentajeOk ? '✓' : '(debe ser 100%)'}
          </p>
        </Card>

        <Button type="submit" isLoading={setup.isPending} disabled={!porcentajeOk}>
          Crear institución
        </Button>
      </form>
    </div>
  );
}
