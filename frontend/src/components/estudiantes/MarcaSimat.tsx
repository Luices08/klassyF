import { Chip } from '../ui/Badge';
import type { StudentProfile } from '../../types/domain';

/**
 * Distingue a quien llegó por la importación desde SIMAT: «Importado de SIMAT» mientras su información está pendiente de revisión y
 * «SIMAT · revisado» cuando alguien ya confirmó sus datos y su acudiente. Quien no vino de SIMAT no muestra nada.
 */
export function MarcaSimat({ origen }: { origen: StudentProfile['origen_simat'] | undefined }) {
  if (!origen) return null;
  return origen.revision === 'PENDIENTE' ? (
    <span title="Llegó por la importación desde SIMAT: falta revisar su información y registrar su acudiente.">
      <Chip tone="orange">Importado de SIMAT · por revisar</Chip>
    </span>
  ) : (
    <span title="Llegó por la importación desde SIMAT y ya fue revisado.">
      <Chip tone="green">Importado de SIMAT · revisado</Chip>
    </span>
  );
}

/** La matrícula creada o formalizada por la importación desde SIMAT. */
export function MarcaMatriculaSimat({ origen }: { origen: 'IMPORTACION_SIMAT' | null | undefined }) {
  return origen === 'IMPORTACION_SIMAT' ? (
    <span title="Esta matrícula la creó o formalizó la importación desde SIMAT.">
      <Chip tone="blue">SIMAT</Chip>
    </span>
  ) : null;
}
