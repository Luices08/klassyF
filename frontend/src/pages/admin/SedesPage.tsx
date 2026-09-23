import { type FormEvent, useState } from 'react';
import { Alert, errorMessage } from '../../components/ui/Alert';
import { Badge } from '../../components/ui/Badge';
import { Button } from '../../components/ui/Button';
import { Card, CardHeader } from '../../components/ui/Card';
import { Input, Select } from '../../components/ui/Field';
import { Spinner } from '../../components/ui/Spinner';
import { useInstitutionConfig } from '../../context/InstitutionConfigContext';
import { useCampuses, useCrearJornada, useCrearSede, useJornadas } from '../../hooks/useCatalogs';
import { JORNADAS, type Jornada } from '../../types/domain';

export function SedesPage() {
  const { config } = useInstitutionConfig();
  const institucionId = config?.institutionId ?? '';

  const sedesQuery = useCampuses(institucionId || undefined);
  const crearSede = useCrearSede();

  const [nombreSede, setNombreSede] = useState('');
  const [codigoDaneSede, setCodigoDaneSede] = useState('');
  const [direccion, setDireccion] = useState('');

  async function handleCrearSede(e: FormEvent) {
    e.preventDefault();
    crearSede.reset();
    await crearSede.mutateAsync({
      institucion_id: institucionId,
      nombre: nombreSede,
      codigo_dane_sede: codigoDaneSede,
      direccion,
    });
    setNombreSede('');
    setCodigoDaneSede('');
    setDireccion('');
  }

  const [sedeSeleccionada, setSedeSeleccionada] = useState('');
  const jornadasQuery = useJornadas(sedeSeleccionada || undefined);
  const crearJornada = useCrearJornada();
  const [nombreJornada, setNombreJornada] = useState<Jornada>('MANANA');

  async function handleCrearJornada(e: FormEvent) {
    e.preventDefault();
    crearJornada.reset();
    await crearJornada.mutateAsync({ sede_id: sedeSeleccionada, nombre: nombreJornada });
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-bold text-slate-900">Sedes y jornadas</h1>
        <p className="text-sm text-slate-500">
          Crea sedes adicionales a la principal y habilita sus jornadas operativas (Mañana, Tarde, Única,
          Nocturna). Cada jornada pertenece a una sola sede.
        </p>
      </div>

      {!institucionId && (
        <Alert tone="info">
          Aún no hay una institución configurada en esta sesión. Completa primero "Configuración institucional".
        </Alert>
      )}

      <Card>
        <CardHeader title="Nueva sede" />
        {crearSede.isError && <Alert tone="error">{errorMessage(crearSede.error)}</Alert>}
        <form onSubmit={handleCrearSede} className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-3">
          <Input label="Nombre" required value={nombreSede} onChange={(e) => setNombreSede(e.target.value)} />
          <Input
            label="Código DANE de la sede (12 dígitos)"
            required
            pattern="\d{12}"
            value={codigoDaneSede}
            onChange={(e) => setCodigoDaneSede(e.target.value)}
          />
          <Input label="Dirección" required value={direccion} onChange={(e) => setDireccion(e.target.value)} />

          <div className="sm:col-span-3">
            <Button type="submit" isLoading={crearSede.isPending} disabled={!institucionId}>
              Crear sede
            </Button>
          </div>
        </form>
      </Card>

      <Card>
        <CardHeader title="Sedes de la institución" />
        {sedesQuery.isLoading && <Spinner />}
        {sedesQuery.isError && <Alert tone="error">{errorMessage(sedesQuery.error)}</Alert>}
        {sedesQuery.data && (
          <ul className="divide-y divide-slate-100 text-sm">
            {sedesQuery.data.map((c) => (
              <li key={c._id} className="flex items-center justify-between py-2">
                <span className="font-medium text-slate-900">{c.nombre}</span>
                {c.es_principal && <Badge tone="green">Principal</Badge>}
              </li>
            ))}
            {sedesQuery.data.length === 0 && (
              <li className="py-4 text-center text-slate-400">Sin sedes registradas.</li>
            )}
          </ul>
        )}
      </Card>

      <Card>
        <CardHeader title="Jornadas por sede" subtitle="Cada jornada pertenece a una sede específica." />
        <Select
          label="Sede"
          value={sedeSeleccionada}
          onChange={(e) => setSedeSeleccionada(e.target.value)}
          className="mb-4 max-w-xs"
        >
          <option value="">Selecciona una sede...</option>
          {sedesQuery.data?.map((c) => (
            <option key={c._id} value={c._id}>
              {c.nombre}
            </option>
          ))}
        </Select>

        {sedeSeleccionada && (
          <>
            {crearJornada.isError && <Alert tone="error">{errorMessage(crearJornada.error)}</Alert>}
            <form onSubmit={handleCrearJornada} className="mb-4 flex flex-wrap items-end gap-3">
              <Select
                label="Nueva jornada"
                value={nombreJornada}
                onChange={(e) => setNombreJornada(e.target.value as Jornada)}
                className="w-40"
              >
                {JORNADAS.map((j) => (
                  <option key={j} value={j}>
                    {j}
                  </option>
                ))}
              </Select>
              <Button type="submit" isLoading={crearJornada.isPending}>
                Habilitar jornada
              </Button>
            </form>

            {jornadasQuery.isLoading && <Spinner />}
            {jornadasQuery.isError && <Alert tone="error">{errorMessage(jornadasQuery.error)}</Alert>}
            <div className="flex flex-wrap gap-2">
              {jornadasQuery.data?.map((j) => (
                <Badge key={j._id}>{j.nombre}</Badge>
              ))}
              {jornadasQuery.data?.length === 0 && (
                <p className="text-sm text-slate-400">Sin jornadas para esta sede.</p>
              )}
            </div>
          </>
        )}
      </Card>
    </div>
  );
}
