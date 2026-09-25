import { type FormEvent, useState } from 'react';
import { Alert, errorMessage } from '../../components/ui/Alert';
import { Chip } from '../../components/ui/Badge';
import { Button } from '../../components/ui/Button';
import { Card, CardHeader } from '../../components/ui/Card';
import { Drawer } from '../../components/ui/Drawer';
import { Input, Select } from '../../components/ui/Field';
import { PageHeader } from '../../components/ui/PageHeader';
import { Spinner } from '../../components/ui/Spinner';
import { EmptyRow, Table, TableBody, TableHead, Td, Th } from '../../components/ui/Table';
import { PlusIcon } from '../../components/ui/icons';
import { useInstitutionConfig } from '../../context/InstitutionConfigContext';
import { useCampuses, useCrearJornada, useCrearSede, useJornadas } from '../../hooks/useCatalogs';
import { JORNADAS, type Jornada } from '../../types/domain';

export function SedesPage() {
  const { config } = useInstitutionConfig();
  const institucionId = config?.institutionId ?? '';

  const sedesQuery = useCampuses(institucionId || undefined);
  const crearSede = useCrearSede();

  const [drawerSedeOpen, setDrawerSedeOpen] = useState(false);
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
    setDrawerSedeOpen(false);
  }

  const [sedeSeleccionada, setSedeSeleccionada] = useState('');
  const jornadasQuery = useJornadas(sedeSeleccionada || undefined);
  const crearJornada = useCrearJornada();
  const [drawerJornadaOpen, setDrawerJornadaOpen] = useState(false);
  const [nombreJornada, setNombreJornada] = useState<Jornada>('MANANA');

  async function handleCrearJornada(e: FormEvent) {
    e.preventDefault();
    crearJornada.reset();
    await crearJornada.mutateAsync({ sede_id: sedeSeleccionada, nombre: nombreJornada });
    setDrawerJornadaOpen(false);
  }

  const sedeSeleccionadaNombre = sedesQuery.data?.find((c) => c._id === sedeSeleccionada)?.nombre ?? '';

  return (
    <div className="space-y-6">
      <PageHeader
        title="Sedes y jornadas"
        subtitle='Crea sedes adicionales a la principal y habilita sus jornadas operativas (Mañana, Tarde, Única, Nocturna). Cada jornada pertenece a una sola sede.'
        action={
          <Button onClick={() => setDrawerSedeOpen(true)} disabled={!institucionId}>
            <PlusIcon className="h-4 w-4" />
            Nueva sede
          </Button>
        }
      />

      {!institucionId && (
        <Alert tone="info">
          Aún no hay una institución configurada en esta sesión. Completa primero "Configuración institucional".
        </Alert>
      )}

      <Card>
        <CardHeader title="Sedes de la institución" />
        {sedesQuery.isLoading && <Spinner />}
        {sedesQuery.isError && <Alert tone="error">{errorMessage(sedesQuery.error)}</Alert>}
        {sedesQuery.data && (
          <Table>
            <TableHead>
              <Th>Nombre</Th>
              <Th>Estado</Th>
            </TableHead>
            <TableBody>
              {sedesQuery.data.map((c) => (
                <tr key={c._id}>
                  <Td className="font-medium text-ink">{c.nombre}</Td>
                  <Td>{c.es_principal && <Chip tone="blue">Principal</Chip>}</Td>
                </tr>
              ))}
              {sedesQuery.data.length === 0 && <EmptyRow colSpan={2}>Sin sedes registradas.</EmptyRow>}
            </TableBody>
          </Table>
        )}
      </Card>

      <Card>
        <CardHeader
          title="Jornadas por sede"
          subtitle="Cada jornada pertenece a una sede específica."
          action={
            <Button
              type="button"
              variant="outline"
              onClick={() => setDrawerJornadaOpen(true)}
              disabled={!sedeSeleccionada}
            >
              <PlusIcon className="h-4 w-4" />
              Habilitar jornada
            </Button>
          }
        />
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
            {jornadasQuery.isLoading && <Spinner />}
            {jornadasQuery.isError && <Alert tone="error">{errorMessage(jornadasQuery.error)}</Alert>}
            <div className="flex flex-wrap gap-2">
              {jornadasQuery.data?.map((j) => (
                <Chip key={j._id} tone="blue">
                  {j.nombre}
                </Chip>
              ))}
              {jornadasQuery.data?.length === 0 && (
                <p className="text-sm text-muted">Sin jornadas para esta sede.</p>
              )}
            </div>
          </>
        )}
      </Card>

      <Drawer
        open={drawerSedeOpen}
        title="Nueva sede"
        onClose={() => setDrawerSedeOpen(false)}
        onSubmit={handleCrearSede}
        submitLabel="Crear sede"
        isSubmitting={crearSede.isPending}
      >
        {crearSede.isError && <Alert tone="error">{errorMessage(crearSede.error)}</Alert>}
        <Input label="Nombre" required value={nombreSede} onChange={(e) => setNombreSede(e.target.value)} />
        <Input
          label="Código DANE de la sede (12 dígitos)"
          required
          pattern="\d{12}"
          value={codigoDaneSede}
          onChange={(e) => setCodigoDaneSede(e.target.value)}
        />
        <Input label="Dirección" required value={direccion} onChange={(e) => setDireccion(e.target.value)} />
      </Drawer>

      <Drawer
        open={drawerJornadaOpen}
        title="Habilitar jornada"
        subtitle={sedeSeleccionadaNombre}
        onClose={() => setDrawerJornadaOpen(false)}
        onSubmit={handleCrearJornada}
        submitLabel="Habilitar jornada"
        isSubmitting={crearJornada.isPending}
      >
        <Select label="Jornada" value={nombreJornada} onChange={(e) => setNombreJornada(e.target.value as Jornada)}>
          {JORNADAS.map((j) => (
            <option key={j} value={j}>
              {j}
            </option>
          ))}
        </Select>
      </Drawer>
    </div>
  );
}
