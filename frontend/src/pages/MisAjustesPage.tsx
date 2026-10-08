import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ReportarEstudianteDrawer } from '../components/inclusion/ReportarEstudianteDrawer';
import { Alert, errorMessage } from '../components/ui/Alert';
import { Chip, EstadoExpedienteBadge, EstadoSolicitudApoyoBadge } from '../components/ui/Badge';
import { Button } from '../components/ui/Button';
import { Card, CardHeader } from '../components/ui/Card';
import { PageHeader } from '../components/ui/PageHeader';
import { Spinner } from '../components/ui/Spinner';
import { EmptyRow, Table, TableBody, TableHead, Td, Th } from '../components/ui/Table';
import { useMisEstudiantesConApoyo, useMisSolicitudes } from '../hooks/useInclusion';
import { formatoFechaLocal } from '../lib/fechas';

/**
 * El docente ve los estudiantes de sus grupos con ajustes razonables y las asignaturas suyas por diligenciar. Nunca ve la
 * condición ni lo clínico: solo la ficha pedagógica y su propio ajuste. También reporta a orientación y sigue sus reportes.
 */
export function MisAjustesPage() {
  const navigate = useNavigate();
  const [reportar, setReportar] = useState(false);
  const estudiantes = useMisEstudiantesConApoyo();
  const solicitudes = useMisSolicitudes();

  return (
    <div className="space-y-4">
      <PageHeader
        title="Estudiantes con ajustes"
        subtitle="Ajustes razonables que debes diligenciar y aplicar en tus asignaturas. Es información reservada: úsala solo para planear tu clase."
        action={<Button onClick={() => setReportar(true)}>Reportar estudiante</Button>}
      />
      <Card>
        <CardHeader title="Mis estudiantes" subtitle="Solo aparecen con el expediente ya en construcción." />
        {estudiantes.isLoading && <Spinner />}
        {estudiantes.isError && <Alert tone="error">{errorMessage(estudiantes.error)}</Alert>}
        {estudiantes.data && (
          <Table>
            <TableHead>
              <tr>
                <Th>Estudiante</Th>
                <Th>Grupo</Th>
                <Th>Estado</Th>
                <Th>Mis asignaturas</Th>
                <Th className="text-right">Acciones</Th>
              </tr>
            </TableHead>
            <TableBody>
              {estudiantes.data.map((e) => (
                <tr key={e.expediente_id}>
                  <Td>
                    {e.estudiante.apellido} {e.estudiante.nombre}
                  </Td>
                  <Td>
                    {e.grupo}
                    {e.es_director && <span className="block text-xs text-muted">Soy el director de grupo</span>}
                  </Td>
                  <Td>
                    <EstadoExpedienteBadge value={e.estado} />
                  </Td>
                  <Td>
                    <span className="flex flex-wrap gap-1">
                      {e.mis_asignaturas.map((a) => (
                        <Chip key={a.subject_id} tone={a.completo ? 'green' : 'orange'}>
                          {a.nombre}: {a.completo ? 'completo' : 'pendiente'}
                        </Chip>
                      ))}
                      {e.mis_asignaturas.length === 0 && <span className="text-xs text-muted">—</span>}
                    </span>
                  </Td>
                  <Td className="text-right">
                    <Button variant="soft-edit" className="px-3 py-1 text-xs" onClick={() => navigate(`/inclusion/expedientes/${e.expediente_id}`)}>
                      Abrir
                    </Button>
                  </Td>
                </tr>
              ))}
              {estudiantes.data.length === 0 && <EmptyRow colSpan={5}>No tienes estudiantes con ajustes por diligenciar.</EmptyRow>}
            </TableBody>
          </Table>
        )}
      </Card>
      <Card>
        <CardHeader title="Mis reportes a orientación" subtitle="Solo ves que tu reporte existe y en qué va." />
        {solicitudes.isError && <Alert tone="error">{errorMessage(solicitudes.error)}</Alert>}
        <Table>
          <TableHead>
            <tr>
              <Th>Fecha</Th>
              <Th>Estudiante</Th>
              <Th>Estado</Th>
            </tr>
          </TableHead>
          <TableBody>
            {(solicitudes.data ?? []).map((s) => (
              <tr key={s._id}>
                <Td>{formatoFechaLocal(s.createdAt)}</Td>
                <Td>{s.estudiante}</Td>
                <Td>
                  <EstadoSolicitudApoyoBadge value={s.estado} />
                </Td>
              </tr>
            ))}
            {(solicitudes.data ?? []).length === 0 && <EmptyRow colSpan={3}>No has enviado reportes.</EmptyRow>}
          </TableBody>
        </Table>
      </Card>
      <ReportarEstudianteDrawer open={reportar} onClose={() => setReportar(false)} />
    </div>
  );
}
