import { type FormEvent, useState } from 'react';
import { type InstanciaSesion, NOMBRES_TIPO_CASO, type TipoCaso, useAgregarCaso } from '../../hooks/useComision';
import { NOMBRES_TIPO_ANTICIPADA, useTramitesAnticipada } from '../../hooks/usePromocionAnticipada';
import { Alert, errorMessage } from '../ui/Alert';
import { Drawer } from '../ui/Drawer';
import { Select } from '../ui/Field';
import { type EstudianteElegido, SelectorEstudianteDeGrupo } from './SelectorEstudianteDeGrupo';

/** Agrega un estudiante al orden del día de la sesión. El servidor valida el resto (cierre de M19, trámite abierto, alcance de grados). */
export function AgregarCasoDrawer({ sesionId, anioId, instancia, onClose }: { sesionId: string; anioId: string; instancia: InstanciaSesion; onClose: () => void }) {
  const agregar = useAgregarCaso();
  const [estudiante, setEstudiante] = useState<EstudianteElegido | null>(null);
  const [tipo, setTipo] = useState<TipoCaso>('PROMOCION');
  const [tramiteId, setTramiteId] = useState('');
  const [error, setError] = useState<string | null>(null);
  const tipos = (Object.keys(NOMBRES_TIPO_CASO) as TipoCaso[]).filter((t) => t !== 'PROMOCION_ANTICIPADA' || instancia !== 'CONSEJO_ACADEMICO');
  const tramites = useTramitesAnticipada({ academic_year_id: anioId }, tipo === 'PROMOCION_ANTICIPADA');
  const delEstudiante = (tramites.data ?? []).filter((t) => (typeof t.student_id === 'object' ? t.student_id._id : t.student_id) === estudiante?.student_id && ['SOLICITADA', 'LISTA_PARA_RESOLUCION'].includes(t.estado));

  async function enviar(e: FormEvent) {
    e.preventDefault();
    if (!estudiante) return;
    setError(null);
    try {
      await agregar.mutateAsync({ sesionId, student_id: estudiante.student_id, tipo, promocion_anticipada_id: tipo === 'PROMOCION_ANTICIPADA' ? tramiteId : undefined });
      onClose();
    } catch (err) {
      setError(errorMessage(err));
    }
  }

  return (
    <Drawer open title="Agregar un caso" onClose={onClose} onSubmit={(e) => void enviar(e)} submitLabel="Agregar" isSubmitting={agregar.isPending} submitDisabled={!estudiante || (tipo === 'PROMOCION_ANTICIPADA' && !tramiteId)}>
      <SelectorEstudianteDeGrupo anioId={anioId} onChange={setEstudiante} />
      <Select label="Tipo de caso" value={tipo} onChange={(e) => { setTipo(e.target.value as TipoCaso); setTramiteId(''); }}>
        {tipos.map((t) => (
          <option key={t} value={t}>
            {NOMBRES_TIPO_CASO[t]}
          </option>
        ))}
      </Select>
      {tipo === 'PROMOCION' && <Alert tone="info">El estudiante debe tener ya el cierre de promoción de su grupo (M19).</Alert>}
      {tipo === 'SEGUIMIENTO' && <Alert tone="info">Alerta temprana: se resuelve con compromisos, no lleva decisión.</Alert>}
      {tipo === 'PROMOCION_ANTICIPADA' && (
        <Select label="Trámite" value={tramiteId} onChange={(e) => setTramiteId(e.target.value)} disabled={!estudiante} hint={estudiante && delEstudiante.length === 0 ? 'Este estudiante no tiene un trámite abierto: ábrelo en «Promoción anticipada».' : undefined}>
          <option value="">Elige el trámite</option>
          {delEstudiante.map((t) => (
            <option key={t._id} value={t._id}>
              {NOMBRES_TIPO_ANTICIPADA[t.tipo]} · {t.estado === 'SOLICITADA' ? 'solicitada' : 'lista para resolución'}
            </option>
          ))}
        </Select>
      )}
      {error && <Alert tone="error">{error}</Alert>}
    </Drawer>
  );
}
