import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ConfiguracionComisionCard } from '../../components/comision/ConfiguracionComisionCard';
import { NuevaSesionDrawer } from '../../components/comision/NuevaSesionDrawer';
import { TableroRiesgoPanel } from '../../components/comision/TableroRiesgoPanel';
import { TONO_ESTADO_SESION } from '../../components/comision/tonosSesion';
import { Alert, errorMessage } from '../../components/ui/Alert';
import { Chip } from '../../components/ui/Badge';
import { Button } from '../../components/ui/Button';
import { Card } from '../../components/ui/Card';
import { Select } from '../../components/ui/Field';
import { PageHeader } from '../../components/ui/PageHeader';
import { Spinner } from '../../components/ui/Spinner';
import { EmptyRow, Table, TableBody, TableHead, Td, Th } from '../../components/ui/Table';
import { Tabs } from '../../components/ui/Tabs';
import { useAuth } from '../../context/AuthContext';
import { useAnioDeTrabajo } from '../../hooks/useAniosLectivos';
import { type EstadoSesion, type InstanciaSesion, NOMBRES_ESTADO_SESION, NOMBRES_INSTANCIA, useSesiones } from '../../hooks/useComision';
import { formatoFechaCalendario } from '../../lib/fechas';

/**
 * M20: Comisión de Evaluación y Promoción. El tablero de riesgo y la configuración son de rectoría y coordinación; cualquier integrante de una
 * sesión entra a ver y firmar las suyas.
 */
export function ComisionPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const { anio } = useAnioDeTrabajo();
  const gestiona = user?.rol === 'ADMIN' || user?.rol === 'COORDINADOR';
  const [pestana, setPestana] = useState(gestiona ? 'tablero' : 'sesiones');
  const [instancia, setInstancia] = useState<InstanciaSesion | ''>('');
  const [estado, setEstado] = useState<EstadoSesion | ''>('');
  const [nueva, setNueva] = useState(false);
  const sesiones = useSesiones({ academic_year_id: anio?._id, instancia: instancia || undefined, estado: estado || undefined });

  return (
    <div className="space-y-4">
      <PageHeader
        title="Comisión de evaluación y promoción"
        subtitle="Seguimiento del riesgo académico y sesiones de la comisión y los consejos, con actas firmadas e inalterables."
        action={pestana === 'sesiones' && gestiona ? <Button onClick={() => setNueva(true)}>Nueva sesión</Button> : undefined}
      />
      {gestiona ? (
        <Tabs
          items={[
            { key: 'tablero', label: 'Tablero de riesgo' },
            { key: 'sesiones', label: 'Sesiones y actas' },
            { key: 'configuracion', label: 'Configuración' },
          ]}
          value={pestana}
          onChange={setPestana}
        />
      ) : (
        <Alert tone="info">Aquí ves las sesiones de las que haces parte. Si te toca firmar un acta, ábrela y confirma con tu contraseña.</Alert>
      )}

      {pestana === 'tablero' && gestiona && <TableroRiesgoPanel anioId={anio?._id} periodos={anio?.periodos ?? []} />}
      {pestana === 'configuracion' && gestiona && <ConfiguracionComisionCard puedeEditar={user?.rol === 'ADMIN'} />}

      {pestana === 'sesiones' && (
        <div className="space-y-4">
          <Card>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Select label="Instancia" value={instancia} onChange={(e) => setInstancia(e.target.value as InstanciaSesion | '')}>
                <option value="">Todas</option>
                {(Object.keys(NOMBRES_INSTANCIA) as InstanciaSesion[]).map((i) => (
                  <option key={i} value={i}>
                    {NOMBRES_INSTANCIA[i]}
                  </option>
                ))}
              </Select>
              <Select label="Estado" value={estado} onChange={(e) => setEstado(e.target.value as EstadoSesion | '')}>
                <option value="">Todos</option>
                {(Object.keys(NOMBRES_ESTADO_SESION) as EstadoSesion[]).map((s) => (
                  <option key={s} value={s}>
                    {NOMBRES_ESTADO_SESION[s]}
                  </option>
                ))}
              </Select>
            </div>
          </Card>
          {sesiones.isLoading && <Spinner />}
          {sesiones.isError && <Alert tone="error">{errorMessage(sesiones.error)}</Alert>}
          <Table>
            <TableHead>
              <Th>Fecha</Th>
              <Th>Instancia</Th>
              <Th>Alcance</Th>
              <Th>Estado</Th>
              <Th>Acta</Th>
              <Th>Integrantes</Th>
              <Th>{''}</Th>
            </TableHead>
            <TableBody>
              {(sesiones.data ?? []).length === 0 && !sesiones.isLoading && <EmptyRow colSpan={7}>No hay sesiones con ese filtro.</EmptyRow>}
              {(sesiones.data ?? []).map((s) => (
                <tr key={s._id}>
                  <Td>{formatoFechaCalendario(s.fecha)}</Td>
                  <Td>{NOMBRES_INSTANCIA[s.instancia]}</Td>
                  <Td>{s.alcance.periodo_numero ? `Seguimiento del periodo ${s.alcance.periodo_numero}` : 'Cierre anual'}</Td>
                  <Td>
                    <Chip tone={TONO_ESTADO_SESION[s.estado]}>{NOMBRES_ESTADO_SESION[s.estado]}</Chip>
                  </Td>
                  <Td>{s.codigo ?? '—'}</Td>
                  <Td>{s.miembros.length}</Td>
                  <Td>
                    <Button variant="soft-edit" onClick={() => navigate(`/comision/sesiones/${s._id}`)}>
                      Abrir
                    </Button>
                  </Td>
                </tr>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      {nueva && anio && <NuevaSesionDrawer anioId={anio._id} periodos={anio.periodos} onClose={() => setNueva(false)} onCreada={(id) => navigate(`/comision/sesiones/${id}`)} />}
    </div>
  );
}
