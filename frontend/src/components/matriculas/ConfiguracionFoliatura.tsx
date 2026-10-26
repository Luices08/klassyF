import { type FormEvent, useState } from 'react';
import { Alert, errorMessage } from '../ui/Alert';
import { Chip } from '../ui/Badge';
import { Button } from '../ui/Button';
import { Card, CardHeader } from '../ui/Card';
import { Input, Textarea } from '../ui/Field';
import { OpcionesTarjeta } from '../ui/OpcionesTarjeta';
import { Spinner } from '../ui/Spinner';
import { useAuth } from '../../context/AuthContext';
import { type EsquemaFoliatura, useActualizarFoliatura, useFoliatura, type VistaFoliatura } from '../../hooks/useFoliatura';
import { renderizarMascara, siguienteDelFormulario } from '../../lib/foliatura';

const ROLES_QUE_CONFIGURAN = ['ADMIN', 'SECRETARIA'];

const entero = (texto: string): number | null => (/^\d+$/.test(texto.trim()) ? Number(texto.trim()) : null);

function Formulario({ vista }: { vista: VistaFoliatura }) {
  const rol = useAuth().user?.rol;
  const puede = Boolean(rol && ROLES_QUE_CONFIGURAN.includes(rol));
  const actualizar = useActualizarFoliatura();

  const [esquema, setEsquema] = useState<EsquemaFoliatura>(vista.esquema);
  const [libro, setLibro] = useState(String(vista.libro_actual ?? vista.anio_de_referencia));
  const [ultimo, setUltimo] = useState(String(vista.ultimo_folio));
  const [capacidad, setCapacidad] = useState(vista.capacidad_por_libro === null ? '' : String(vista.capacidad_por_libro));
  const [mascara, setMascara] = useState(vista.mascara);
  const [motivo, setMotivo] = useState('');

  const libroNum = entero(libro);
  const ultimoNum = entero(ultimo);
  const capacidadNum = esquema === 'CONTINUO' && capacidad.trim() ? entero(capacidad) : null;
  const capacidadValida = esquema === 'ANUAL' || !capacidad.trim() || (capacidadNum !== null && capacidadNum >= 1);
  const valores = libroNum !== null && libroNum >= 1 && ultimoNum !== null && capacidadValida ? { libro: libroNum, ultimo: ultimoNum } : null;
  const falta = vista.hay_folios_emitidos && motivo.trim().length < 10;

  const proximo = valores ? siguienteDelFormulario({ esquema, libro: valores.libro, ultimoFolio: valores.ultimo, capacidad: capacidadNum }) : null;
  const codigoProximo = proximo ? renderizarMascara(mascara, { ...proximo, anio: vista.anio_de_referencia }) : null;

  async function guardar(e: FormEvent) {
    e.preventDefault();
    if (!valores) return;
    actualizar.reset();
    await actualizar.mutateAsync({
      esquema,
      mascara: mascara.trim(),
      capacidad_por_libro: capacidadNum,
      libro_actual: valores.libro,
      ultimo_folio: valores.ultimo,
      motivo: vista.hay_folios_emitidos ? motivo.trim() : undefined,
    });
  }

  return (
    <Card>
      <CardHeader
        title="Libro de matrícula y folios"
        subtitle="Dónde va el colegio en su libro físico y cómo se arma el código de cada folio. Klassy continúa desde aquí: sirve igual para un colegio nuevo que para uno con décadas de archivo."
        action={vista.hay_folios_emitidos ? <Chip tone="blue">{`${vista.total_emitidos} folio${vista.total_emitidos === 1 ? '' : 's'} asentado${vista.total_emitidos === 1 ? '' : 's'}`}</Chip> : undefined}
      />
      <form onSubmit={guardar} className="space-y-4">
        {!vista.confirmada && (
          <Alert tone="warning">
            Esta es la configuración de partida y nadie la ha revisado. Antes de matricular, confirma en qué libro y folio va el colegio y guarda: los folios ya asentados no se pueden renumerar.
          </Alert>
        )}
        {!puede && <Alert tone="info">Solo el administrador y la secretaría académica pueden cambiar esta configuración.</Alert>}
        {actualizar.isError && <Alert tone="error">{errorMessage(actualizar.error)}</Alert>}
        {actualizar.isSuccess && <Alert tone="success">Configuración guardada.</Alert>}

        <OpcionesTarjeta<EsquemaFoliatura>
          label="Esquema de numeración"
          value={esquema}
          onChange={setEsquema}
          disabled={!puede}
          options={[
            { value: 'ANUAL', titulo: 'Anual por vigencia', ejemplo: 'El libro se llama como el año (2026) y el folio arranca en 1 cada vigencia.' },
            { value: 'CONTINUO', titulo: 'Consecutivo histórico continuo', ejemplo: 'Continúa el archivo del colegio: el libro y el folio siguen, sin reiniciar al cambiar de año.' },
          ]}
        />

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <Input
            label={esquema === 'ANUAL' ? 'Vigencia del libro' : 'Número de libro actual'}
            inputMode="numeric"
            required
            disabled={!puede}
            value={libro}
            onChange={(e) => setLibro(e.target.value)}
            hint={esquema === 'ANUAL' ? 'En el esquema anual el libro se llama como el año.' : 'El libro físico en el que se está asentando hoy.'}
          />
          <Input
            label={esquema === 'ANUAL' ? 'Último folio registrado en esa vigencia' : 'Último folio registrado en físico'}
            inputMode="numeric"
            required
            disabled={!puede}
            value={ultimo}
            onChange={(e) => setUltimo(e.target.value)}
            hint="El siguiente será este número más uno. Un libro nuevo empieza en 0."
          />
          {esquema === 'CONTINUO' && (
            <Input
              label="Capacidad máxima por libro (opcional)"
              inputMode="numeric"
              disabled={!puede}
              value={capacidad}
              onChange={(e) => setCapacidad(e.target.value)}
              hint="Al llenarse, se abre el libro siguiente con el folio en 1. Vacío = sin límite."
            />
          )}
        </div>

        <Input
          label="Máscara del código correlativo"
          required
          disabled={!puede}
          value={mascara}
          onChange={(e) => setMascara(e.target.value)}
          hint="Partes: {libro}, {folio:6} (con ceros a la izquierda) y {año}. Debe incluir {libro} y {folio}; no más de 20 caracteres en total."
        />

        {codigoProximo && (
          <p className="rounded-lg bg-soft px-3 py-2 text-sm text-body">
            El próximo folio será <span className="font-semibold text-ink">{codigoProximo}</span> (libro {proximo?.libro}, folio {proximo?.folio}).
          </p>
        )}

        {vista.hay_folios_emitidos && (
          <Textarea
            label="Motivo del cambio"
            required
            rows={2}
            disabled={!puede}
            value={motivo}
            onChange={(e) => setMotivo(e.target.value)}
            hint="Ya hay folios asentados: el cambio queda en la auditoría. Mínimo 10 caracteres. Lo ya asentado no se renumera y el contador nunca baja de lo emitido."
          />
        )}

        {puede && (
          <div className="flex justify-end">
            <Button type="submit" isLoading={actualizar.isPending} disabled={!valores || falta}>
              Guardar configuración
            </Button>
          </div>
        )}
      </form>
    </Card>
  );
}

/** M04: cómo numera el colegio su Libro de Matrícula (una sola configuración por instalación). */
export function ConfiguracionFoliatura() {
  const vista = useFoliatura();
  if (vista.isLoading) return <Spinner />;
  if (vista.isError) return <Alert tone="error">{errorMessage(vista.error)}</Alert>;
  if (!vista.data) return null;
  const v = vista.data;
  // La clave reinicia el formulario cuando el servidor devuelve valores nuevos (al guardar).
  return <Formulario key={[v.esquema, v.libro_actual, v.ultimo_folio, v.capacidad_por_libro, v.mascara, v.confirmada].join('|')} vista={v} />;
}
