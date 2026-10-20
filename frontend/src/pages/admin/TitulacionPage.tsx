import { useState } from 'react';
import { type EstudianteElegido, SelectorEstudianteDeGrupo } from '../../components/comision/SelectorEstudianteDeGrupo';
import { RequisitosDrawer } from '../../components/titulacion/RequisitosDrawer';
import { TONO_ESTADO_TITULACION } from '../../components/titulacion/tonosTitulacion';
import { Alert, errorMessage } from '../../components/ui/Alert';
import { Chip } from '../../components/ui/Badge';
import { Button } from '../../components/ui/Button';
import { Card, CardHeader } from '../../components/ui/Card';
import { Select } from '../../components/ui/Field';
import { PageHeader } from '../../components/ui/PageHeader';
import { Spinner } from '../../components/ui/Spinner';
import { EmptyRow, Table, TableBody, TableHead, Td, Th } from '../../components/ui/Table';
import { useAuth } from '../../context/AuthContext';
import { useAnioDeTrabajo } from '../../hooks/useAniosLectivos';
import { type EstadoTitulacion, NOMBRES_ESTADO_TITULACION, NOMBRES_REQUISITO, useTitulaciones } from '../../hooks/useTitulacion';

/**
 * Titulación de bachiller (M19/M26): quién se gradúa y qué le falta a quien aprobó pero no cumple todos los requisitos que el colegio exige
 * (servicio social, Saber 11, paz y salvo, carpeta académica). Registra Secretaría; el acta de grado y el diploma se expiden en Certificados.
 */
export function TitulacionPage() {
  const { user } = useAuth();
  const { anio } = useAnioDeTrabajo();
  const puedeRegistrar = user?.rol === 'ADMIN' || user?.rol === 'SECRETARIA';
  const [estado, setEstado] = useState<EstadoTitulacion | ''>('');
  const [abierto, setAbierto] = useState<{ id: string; nombre: string } | null>(null);
  const [consulta, setConsulta] = useState<EstudianteElegido | null>(null);
  const lista = useTitulaciones(anio?._id, estado || undefined);

  return (
    <div className="space-y-4">
      <PageHeader title="Titulación de bachiller" subtitle={anio ? `Año lectivo ${anio.year}. Los requisitos son los de la política de promoción del colegio.` : undefined} />

      {anio && (
        <Card>
          <CardHeader title="Consultar a un estudiante" subtitle="La titulación es solo del grado 11. Desde 10° se registran las horas de servicio social y solo se avisa; en 11° los requisitos bloquean el título." />
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <SelectorEstudianteDeGrupo anioId={anio._id} onChange={setConsulta} soloGrados={[10, 11]} />
          </div>
          <div className="mt-3 flex justify-end">
            <Button variant="outline" disabled={!consulta} onClick={() => consulta && setAbierto({ id: consulta.student_id, nombre: consulta.nombre })}>
              Ver requisitos
            </Button>
          </div>
        </Card>
      )}

      <Card>
        <Select label="Situación" value={estado} onChange={(e) => setEstado(e.target.value as EstadoTitulacion | '')}>
          <option value="">Todas</option>
          {(Object.keys(NOMBRES_ESTADO_TITULACION) as EstadoTitulacion[]).map((e) => (
            <option key={e} value={e}>
              {NOMBRES_ESTADO_TITULACION[e]}
            </option>
          ))}
        </Select>
      </Card>

      {lista.isLoading && <Spinner />}
      {lista.isError && <Alert tone="error">{errorMessage(lista.error)}</Alert>}
      <Table>
        <TableHead>
          <Th>Estudiante</Th>
          <Th>Título</Th>
          <Th>Situación</Th>
          <Th>Lo que falta</Th>
          <Th>Acta</Th>
          <Th>{''}</Th>
        </TableHead>
        <TableBody>
          {(lista.data ?? []).length === 0 && !lista.isLoading && <EmptyRow colSpan={6}>Aún no hay estudiantes evaluados para titulación en este año: aparecen al cerrar la promoción del último grado.</EmptyRow>}
          {(lista.data ?? []).map((t) => (
            <tr key={t._id}>
              <Td>
                {t.student_id.apellido} {t.student_id.nombre}
                <span className="block text-xs text-muted">{t.student_id.numero_documento}</span>
              </Td>
              <Td>{t.titulo}</Td>
              <Td>
                <Chip tone={TONO_ESTADO_TITULACION[t.estado]}>{NOMBRES_ESTADO_TITULACION[t.estado]}</Chip>
              </Td>
              <Td>
                {t.pendientes.length === 0 ? (
                  '—'
                ) : (
                  <ul className="space-y-0.5 text-xs">
                    {t.pendientes.map((p) => (
                      <li key={p.requisito} title={NOMBRES_REQUISITO[p.requisito]}>
                        {p.detalle}
                      </li>
                    ))}
                  </ul>
                )}
              </Td>
              <Td>{t.acta?.codigo ?? '—'}</Td>
              <Td>
                <Button variant="soft-edit" onClick={() => setAbierto({ id: t.student_id._id, nombre: `${t.student_id.apellido} ${t.student_id.nombre}` })}>
                  Requisitos
                </Button>
              </Td>
            </tr>
          ))}
        </TableBody>
      </Table>

      {abierto && anio && <RequisitosDrawer studentId={abierto.id} anioId={anio._id} nombre={abierto.nombre} puedeRegistrar={puedeRegistrar} onClose={() => setAbierto(null)} />}
    </div>
  );
}
