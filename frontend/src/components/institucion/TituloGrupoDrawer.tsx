import { type FormEvent, useState } from 'react';
import { useCambiarTituloGrupo } from '../../hooks/useGroups';
import type { Group } from '../../types/domain';
import { Alert, errorMessage } from '../ui/Alert';
import { Button } from '../ui/Button';
import { Drawer } from '../ui/Drawer';
import { Input } from '../ui/Field';

/** Título de bachiller de un grupo del último grado. Sin título propio, el grupo hereda el de la institución (Configuración institucional). */
export function TituloGrupoDrawer({ grupo, tituloInstitucion, onClose }: { grupo: Group; tituloInstitucion: string; onClose: () => void }) {
  const cambiar = useCambiarTituloGrupo();
  const [titulo, setTitulo] = useState(grupo.titulo_bachiller ?? '');
  const [error, setError] = useState<string | null>(null);

  async function guardar(valor: string | null) {
    setError(null);
    try {
      await cambiar.mutateAsync({ groupId: grupo._id, titulo_bachiller: valor });
      onClose();
    } catch (err) {
      setError(errorMessage(err));
    }
  }

  return (
    <Drawer open title={`Título de bachiller de ${grupo.nomenclatura}`} onClose={onClose} onSubmit={(e: FormEvent) => { e.preventDefault(); void guardar(titulo.trim()); }} submitLabel="Guardar" isSubmitting={cambiar.isPending} submitDisabled={titulo.trim().length < 3}>
      <Alert tone="info">
        {grupo.titulo_bachiller ? `Este grupo otorga «${grupo.titulo_bachiller}».` : `Este grupo hereda el título de la institución: «${tituloInstitucion}».`} Aplica a quienes se gradúen de este grupo desde ahora.
      </Alert>
      <Input label="Título propio del grupo" value={titulo} maxLength={80} onChange={(e) => setTitulo(e.target.value)} hint="Por ejemplo «Bachiller Técnico con énfasis en Sistemas»." />
      {grupo.titulo_bachiller && (
        <Button type="button" variant="secondary" onClick={() => void guardar(null)} isLoading={cambiar.isPending}>
          Volver a heredar el de la institución
        </Button>
      )}
      {error && <Alert tone="error">{error}</Alert>}
    </Drawer>
  );
}
