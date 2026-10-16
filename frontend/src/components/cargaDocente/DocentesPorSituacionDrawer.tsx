import type { DocenteCargaResumen } from '../../types/domain';
import { Drawer } from '../ui/Drawer';
import { ListaDocentesCarga } from './ListaDocentesCarga';

export type SituacionCarga = 'SOBRE_CARGA' | 'SUB_CARGA';

const TEXTOS: Record<SituacionCarga, { titulo: string; subtitulo: string; vacio: string }> = {
  SOBRE_CARGA: {
    titulo: 'Docentes con sobrecarga',
    subtitulo: 'Exceden el tope de horas lectivas semanales de su nivel.',
    vacio: 'Ningún docente excede su tope.',
  },
  SUB_CARGA: {
    titulo: 'Docentes con subcarga',
    subtitulo: 'Tienen horas asignadas pero por debajo de su tope: aún hay disponibilidad.',
    vacio: 'Ningún docente está por debajo de su tope.',
  },
};

interface DocentesPorSituacionDrawerProps {
  situacion: SituacionCarga | null;
  docentes: DocenteCargaResumen[];
  onGestionar: (docenteId: string) => void;
  onClose: () => void;
}

/** Los docentes que están en una situación de carga (los mismos que cuenta la tarjeta), con acceso a su ficha. */
export function DocentesPorSituacionDrawer({ situacion, docentes, onGestionar, onClose }: DocentesPorSituacionDrawerProps) {
  const textos = situacion ? TEXTOS[situacion] : TEXTOS.SOBRE_CARGA;
  const delGrupo = situacion
    ? docentes.filter((d) => d.estado_carga === situacion && (situacion === 'SOBRE_CARGA' || d.horas_totales > 0))
    : [];

  return (
    <Drawer open={situacion !== null} title={textos.titulo} subtitle={`${textos.subtitulo} (${delGrupo.length})`} onClose={onClose} size="xl">
      <ListaDocentesCarga
        key={situacion ?? 'cerrado'}
        items={delGrupo}
        vacio={textos.vacio}
        onGestionar={(id) => {
          onGestionar(id);
          onClose();
        }}
      />
    </Drawer>
  );
}
