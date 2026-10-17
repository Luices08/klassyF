import { type FormEvent, useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import { type EntradaMiembro, type InstanciaSesion, NOMBRES_INSTANCIA, useCrearSesion } from '../../hooks/useComision';
import { aInputFecha } from '../../lib/fechas';
import { Alert, errorMessage } from '../ui/Alert';
import { Drawer } from '../ui/Drawer';
import { Input, Select, Textarea } from '../ui/Field';
import { MiembrosEditor } from './MiembrosEditor';

/** Crea el borrador de una sesión de la comisión o de uno de los consejos. El Consejo Directivo solo lo gestiona el rector. */
export function NuevaSesionDrawer({
  anioId,
  periodos,
  onClose,
  onCreada,
}: {
  anioId: string;
  periodos: Array<{ numero: number; nombre: string }>;
  onClose: () => void;
  onCreada: (id: string) => void;
}) {
  const { user } = useAuth();
  const crear = useCrearSesion();
  const [instancia, setInstancia] = useState<InstanciaSesion>('COMISION_EVALUACION');
  const [periodo, setPeriodo] = useState('');
  const [fecha, setFecha] = useState(aInputFecha(new Date().toISOString()));
  const [hora, setHora] = useState('');
  const [lugar, setLugar] = useState('');
  const [orden, setOrden] = useState('');
  const [miembros, setMiembros] = useState<EntradaMiembro[]>([]);
  const [error, setError] = useState<string | null>(null);
  const instancias = (Object.keys(NOMBRES_INSTANCIA) as InstanciaSesion[]).filter((i) => i !== 'CONSEJO_DIRECTIVO' || user?.rol === 'ADMIN');

  async function enviar(e: FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      const s = await crear.mutateAsync({
        instancia,
        academic_year_id: anioId,
        periodo_numero: periodo ? Number(periodo) : null,
        fecha,
        hora: hora || undefined,
        lugar: lugar || undefined,
        orden_del_dia: orden || undefined,
        miembros: miembros.map((m) => ({ ...m, user_id: m.user_id ?? null, nombre: m.user_id ? undefined : m.nombre })),
      });
      onCreada(s._id);
    } catch (err) {
      setError(errorMessage(err));
    }
  }

  const completos = miembros.length > 0 && miembros.every((m) => m.cargo.trim() && (m.user_id || m.nombre?.trim()));

  return (
    <Drawer open title="Nueva sesión" onClose={onClose} onSubmit={(e) => void enviar(e)} submitLabel="Crear borrador" isSubmitting={crear.isPending} submitDisabled={!completos || !fecha} size="lg">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Select label="Instancia" value={instancia} onChange={(e) => setInstancia(e.target.value as InstanciaSesion)}>
          {instancias.map((i) => (
            <option key={i} value={i}>
              {NOMBRES_INSTANCIA[i]}
            </option>
          ))}
        </Select>
        <Select label="Alcance" value={periodo} onChange={(e) => setPeriodo(e.target.value)}>
          <option value="">Cierre anual</option>
          {periodos.map((p) => (
            <option key={p.numero} value={p.numero}>
              Seguimiento del {p.nombre}
            </option>
          ))}
        </Select>
        <Input label="Fecha" type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} />
        <Input label="Hora" value={hora} maxLength={20} placeholder="2:00 p. m." onChange={(e) => setHora(e.target.value)} />
        <div className="sm:col-span-2">
          <Input label="Lugar" value={lugar} maxLength={160} onChange={(e) => setLugar(e.target.value)} />
        </div>
      </div>
      <Textarea label="Orden del día" rows={4} maxLength={8000} value={orden} onChange={(e) => setOrden(e.target.value)} hint="Se exige para poder convocar." />
      <div>
        <p className="mb-2 text-label text-body">Integrantes</p>
        <MiembrosEditor value={miembros} onChange={setMiembros} />
      </div>
      {error && <Alert tone="error">{error}</Alert>}
    </Drawer>
  );
}
