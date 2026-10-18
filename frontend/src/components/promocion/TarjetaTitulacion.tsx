import { Card, CardHeader } from '../ui/Card';
import { Input } from '../ui/Field';
import { Switch } from '../ui/Switch';
import type { PoliticaPromocion } from '../../hooks/usePromocion';

interface Props {
  valor: PoliticaPromocion;
  onChange: (p: PoliticaPromocion) => void;
  bloqueado: boolean;
}

/** Requisitos de grado y título (no son umbrales de promoción). */
export function TarjetaTitulacion({ valor: b, onChange: setB, bloqueado }: Props) {
  return (
    <Card>
      <CardHeader title="Requisitos de titulación" subtitle="La norma fija mínimos (p. ej. 80 horas de servicio social); el colegio puede exigir más. Bloquean solo en el grado de titulación." />
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Input label="Grado en que se otorga el título" type="number" min={1} max={11} value={b.titulacion.grado_titulacion} disabled={bloqueado} onChange={(e) => setB({ ...b, titulacion: { ...b.titulacion, grado_titulacion: Number(e.target.value) } })} />
        <div />
        <Switch label="Servicio social obligatorio" checked={b.titulacion.servicio_social.activo} disabled={bloqueado} onChange={(v) => setB({ ...b, titulacion: { ...b.titulacion, servicio_social: { ...b.titulacion.servicio_social, activo: v } } })} />
        {b.titulacion.servicio_social.activo && (
          <div className="grid grid-cols-2 gap-3">
            <Input label="Horas requeridas" type="number" min={1} value={b.titulacion.servicio_social.horas_requeridas} disabled={bloqueado} onChange={(e) => setB({ ...b, titulacion: { ...b.titulacion, servicio_social: { ...b.titulacion.servicio_social, horas_requeridas: Number(e.target.value) } } })} />
            <Input label="Avisar desde el grado" type="number" min={-2} max={11} value={b.titulacion.servicio_social.alerta_desde_grado} disabled={bloqueado} onChange={(e) => setB({ ...b, titulacion: { ...b.titulacion, servicio_social: { ...b.titulacion.servicio_social, alerta_desde_grado: Number(e.target.value) } } })} />
          </div>
        )}
        <Switch label="Haber presentado Saber 11" checked={b.titulacion.saber_11.activo} disabled={bloqueado} onChange={(v) => setB({ ...b, titulacion: { ...b.titulacion, saber_11: { activo: v } } })} />
        <Switch label="Paz y salvo confirmado" checked={b.titulacion.paz_y_salvo.activo} disabled={bloqueado} onChange={(v) => setB({ ...b, titulacion: { ...b.titulacion, paz_y_salvo: { activo: v } } })} />
        <Switch label="Carpeta académica completa" description="Certificados de los grados anteriores." checked={b.titulacion.carpeta_academica.activo} disabled={bloqueado} onChange={(v) => setB({ ...b, titulacion: { ...b.titulacion, carpeta_academica: { ...b.titulacion.carpeta_academica, activo: v } } })} />
        {b.titulacion.carpeta_academica.activo && (
          <Input label="Desde el grado" type="number" min={-2} max={10} value={b.titulacion.carpeta_academica.desde_grado} disabled={bloqueado} onChange={(e) => setB({ ...b, titulacion: { ...b.titulacion, carpeta_academica: { ...b.titulacion.carpeta_academica, desde_grado: Number(e.target.value) } } })} />
        )}
      </div>
    </Card>
  );
}
