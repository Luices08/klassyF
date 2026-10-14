import { type FormEvent, useState } from 'react';
import { useCrearLiderArea, useActualizarLiderArea } from '../../hooks/useLideresArea';
import { useCampuses } from '../../hooks/useCatalogs';
import { useInstitution } from '../../hooks/useInstitution';
import { useUsers } from '../../hooks/useUsers';
import {
  ALCANCES_JORNADA,
  NIVELES_EDUCATIVOS,
  NOMBRES_NIVEL_EDUCATIVO,
  type AlcanceJornada,
  type Area,
  type LiderArea,
  type NivelEducativo,
} from '../../types/domain';
import { Alert, errorMessage } from '../ui/Alert';
import { Drawer } from '../ui/Drawer';
import { Select } from '../ui/Field';
import { MultiSelect } from '../ui/MultiSelect';

interface LiderAreaFormDrawerProps {
  area: Area;
  /** null = designar un líder nuevo; con líder se editan su docente y lo que cubre. */
  lider: LiderArea | null;
  onClose: () => void;
}

const OPCIONES_JORNADA: Record<AlcanceJornada, string> = {
  TODAS: 'Todas las jornadas',
  DIURNA: 'Diurna (mañana, tarde y jornada única)',
  NOCTURNA: 'Nocturna (nocturna y sabatina)',
};

/**
 * Designa o edita un líder de área: el docente y qué cubre. Un colegio pequeño deja todo en «todos» (un jefe por área); uno grande separa por
 * nivel educativo y por diurna / nocturna. La sede es opcional: por defecto «todas las sedes», para no obligar a nombrar un líder por sede.
 */
export function LiderAreaFormDrawer({ area, lider, onClose }: LiderAreaFormDrawerProps) {
  const institucion = useInstitution();
  const sedes = useCampuses(institucion.data?._id);
  const docentes = useUsers({ rol: 'DOCENTE', estado: 'activo' });
  const crear = useCrearLiderArea();
  const actualizar = useActualizarLiderArea();
  const guardando = crear.isPending || actualizar.isPending;
  const error = crear.error ?? actualizar.error;

  const [docenteId, setDocenteId] = useState(lider?.docente?._id ?? '');
  const [niveles, setNiveles] = useState<NivelEducativo[]>(lider?.niveles ?? []);
  const [jornada, setJornada] = useState<AlcanceJornada>(lider?.jornada ?? 'TODAS');
  const [sedesIds, setSedesIds] = useState<string[]>(lider?.sedes.map((s) => s._id) ?? []);

  const opcionesSedes = (sedes.data ?? []).map((s) => ({ value: s._id, label: s.nombre }));

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    crear.reset();
    actualizar.reset();
    // Elegirlo todo es lo mismo que no acotar: se guarda vacío, que es lo que significa «todos».
    const datos = {
      docente_id: docenteId,
      niveles: niveles.length === NIVELES_EDUCATIVOS.length ? [] : niveles,
      jornada,
      sedes_ids: sedesIds.length === opcionesSedes.length ? [] : sedesIds,
    };
    try {
      if (lider) await actualizar.mutateAsync({ id: lider._id, ...datos });
      else await crear.mutateAsync({ area_id: area._id, ...datos });
      onClose();
    } catch {
      // El error queda en la mutación y se muestra arriba.
    }
  }

  return (
    <Drawer
      open
      title={lider ? 'Editar líder del área' : 'Designar líder del área'}
      subtitle={area.nombre}
      onClose={onClose}
      onSubmit={handleSubmit}
      submitLabel={lider ? 'Guardar cambios' : 'Designar líder'}
      isSubmitting={guardando}
      submitDisabled={docenteId === ''}
    >
      {error && <Alert tone="error">{errorMessage(error)}</Alert>}
      <Alert tone="info">
        El líder es el único docente que carga el plan de área de lo que cubre, y sin ese plan aprobado los docentes de esa parte del área no pueden cargar su plan de
        aula. Si en tu colegio un solo jefe lleva el área completa, deja todo en «todos».
      </Alert>
      <Select label="Docente líder" required value={docenteId} onChange={(e) => setDocenteId(e.target.value)}>
        <option value="">Selecciona un docente…</option>
        {(docentes.data ?? []).map((d) => (
          <option key={d._id} value={d._id}>
            {d.nombre} {d.apellido}
          </option>
        ))}
      </Select>
      <MultiSelect
        label="Niveles educativos que cubre"
        options={NIVELES_EDUCATIVOS.map((n) => ({ value: n, label: NOMBRES_NIVEL_EDUCATIVO[n] }))}
        selected={niveles}
        onChange={setNiveles}
        allLabel="Todos los niveles"
      />
      <Select label="Jornada" value={jornada} onChange={(e) => setJornada(e.target.value as AlcanceJornada)}>
        {ALCANCES_JORNADA.map((j) => (
          <option key={j} value={j}>
            {OPCIONES_JORNADA[j]}
          </option>
        ))}
      </Select>
      <MultiSelect label="Sedes" options={opcionesSedes} selected={sedesIds} onChange={setSedesIds} allLabel="Todas las sedes" />
      <p className="-mt-2 text-xs text-muted">Déjalo en «Todas las sedes» salvo que cada sede tenga su propio líder de esta área.</p>
    </Drawer>
  );
}
