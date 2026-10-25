import { useState } from 'react';
import { Alert, errorMessage } from '../../components/ui/Alert';
import { Button } from '../../components/ui/Button';
import { Card, CardHeader } from '../../components/ui/Card';
import { Dropzone } from '../../components/ui/Dropzone';
import { Select } from '../../components/ui/Field';
import { IconButton } from '../../components/ui/IconButton';
import { OpcionesTarjeta } from '../../components/ui/OpcionesTarjeta';
import { PageHeader } from '../../components/ui/PageHeader';
import { Spinner } from '../../components/ui/Spinner';
import { Switch } from '../../components/ui/Switch';
import { ChevronDownIcon, TrashIcon } from '../../components/ui/icons';
import { SitioRenderizado } from '../../components/sitioPublico/SitioRenderizado';
import {
  urlImagenSitio,
  useAgregarImagenSitio,
  useGuardarSitio,
  useQuitarImagenSitio,
  useSitioParaAdministrar,
} from '../../hooks/useSitioPublico';
import { usePublicInstitutionInfo } from '../../hooks/usePublicInfo';
import { ETIQUETA_LOGO, ETIQUETA_MENU, ETIQUETA_SECCION, type ConfiguracionSitio } from '../../types/sitioPublico';

const MAX_BYTES_IMAGEN = 2 * 1024 * 1024;
const NADA = () => undefined;

type Tipografia = ConfiguracionSitio['tipografia'];

function CampoColor({ label, value, onChange }: { label: string; value: string; onChange: (valor: string) => void }) {
  return (
    <label className="flex flex-col gap-1.5 text-label text-ink">
      {label}
      <span className="flex items-center gap-2">
        <input
          type="color"
          value={value}
          onChange={(e) => onChange(e.target.value.toUpperCase())}
          className="h-10 w-14 cursor-pointer rounded-lg border border-border bg-surface p-1"
        />
        <span className="text-sm text-muted">{value}</span>
      </span>
    </label>
  );
}

export function SitioPublicoPage() {
  const sitio = useSitioParaAdministrar();
  const info = usePublicInstitutionInfo();
  const guardar = useGuardarSitio();
  const agregarImagen = useAgregarImagenSitio();
  const quitarImagen = useQuitarImagenSitio();

  // Lo que se edita aquí es un borrador: la página pública no cambia hasta guardar.
  const [borrador, setBorrador] = useState<ConfiguracionSitio | null>(null);
  const [archivo, setArchivo] = useState<File | null>(null);

  if (sitio.isLoading) return <Spinner label="Cargando..." />;
  if (sitio.isError || !sitio.data) return <Alert tone="error">{errorMessage(sitio.error)}</Alert>;

  const { configuracion: guardada, imagenes, plantillas, fuentes, max_imagenes: maxImagenes } = sitio.data;
  const config = borrador ?? guardada;
  const plantilla = plantillas.find((p) => p.id === config.plantilla) ?? plantillas[0];
  const plantillaGuardada = plantillas.find((p) => p.id === guardada.plantilla);
  const cambiar = (parcial: Partial<ConfiguracionSitio>) => setBorrador({ ...config, ...parcial });
  const cambiarTipografia = (parcial: Partial<Tipografia>) => cambiar({ tipografia: { ...config.tipografia, ...parcial } });

  function elegirPlantilla(id: string) {
    const nueva = plantillas.find((p) => p.id === id);
    if (!nueva) return;
    // Cada plantilla admite sus propias ubicaciones: si la actual no sirve, se usa la primera que admite.
    cambiar({
      plantilla: id,
      logo_posicion: nueva.logo.includes(config.logo_posicion) ? config.logo_posicion : nueva.logo[0],
      menu_posicion: nueva.menu.includes(config.menu_posicion) ? config.menu_posicion : nueva.menu[0],
    });
  }

  function mover(indice: number, delta: -1 | 1) {
    const secciones = [...config.secciones];
    const destino = indice + delta;
    if (destino < 0 || destino >= secciones.length) return;
    [secciones[indice], secciones[destino]] = [secciones[destino], secciones[indice]];
    cambiar({ secciones });
  }

  async function guardarCambios() {
    await guardar.mutateAsync(config);
    setBorrador(null);
  }

  async function subirImagen() {
    if (!archivo) return;
    await agregarImagen.mutateAsync(archivo);
    setArchivo(null);
  }

  const imagenesVisibles = imagenes.map(urlImagenSitio);

  return (
    <div className="space-y-4">
      <PageHeader
        title="Sitio público del colegio"
        subtitle="Elige la plantilla de la página de inicio y ajusta su tipografía, colores y secciones. Solo cambia la página pública, no el sistema."
        action={
          <div className="flex gap-2">
            {borrador && (
              <Button variant="secondary" onClick={() => setBorrador(null)} disabled={guardar.isPending}>
                Descartar cambios
              </Button>
            )}
            <Button onClick={() => void guardarCambios()} isLoading={guardar.isPending} disabled={!borrador}>
              Guardar cambios
            </Button>
          </div>
        }
      />
      {guardar.isError && <Alert tone="error">{errorMessage(guardar.error)}</Alert>}
      {guardar.isSuccess && !borrador && <Alert tone="success">Los cambios ya se ven en la página pública.</Alert>}

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,5fr)_minmax(0,6fr)]">
        <div className="space-y-4">
          <Card>
            <CardHeader title="Plantilla" subtitle="Define la estructura de la página: dónde van el logo y el menú, y si hay carrusel." />
            <OpcionesTarjeta
              label="Plantilla"
              value={config.plantilla}
              onChange={elegirPlantilla}
              options={plantillas.map((p) => ({ value: p.id, titulo: p.nombre, ejemplo: p.descripcion }))}
            />
            {(plantilla.logo.length > 1 || plantilla.menu.length > 1) && (
              <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
                {plantilla.logo.length > 1 && (
                  <Select label="Ubicación del logo" value={config.logo_posicion} onChange={(e) => cambiar({ logo_posicion: e.target.value as ConfiguracionSitio['logo_posicion'] })}>
                    {plantilla.logo.map((p) => (
                      <option key={p} value={p}>
                        {ETIQUETA_LOGO[p]}
                      </option>
                    ))}
                  </Select>
                )}
                {plantilla.menu.length > 1 && (
                  <Select label="Ubicación del menú" value={config.menu_posicion} onChange={(e) => cambiar({ menu_posicion: e.target.value as ConfiguracionSitio['menu_posicion'] })}>
                    {plantilla.menu.map((p) => (
                      <option key={p} value={p}>
                        {ETIQUETA_MENU[p]}
                      </option>
                    ))}
                  </Select>
                )}
              </div>
            )}
          </Card>

          <Card>
            <CardHeader title="Tipografía y colores" subtitle="Los títulos y el texto se configuran por separado y valen para cualquier plantilla." />
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Select label="Letra de los títulos" value={config.tipografia.fuente_titulo} onChange={(e) => cambiarTipografia({ fuente_titulo: e.target.value })}>
                {fuentes.map((f) => (
                  <option key={f}>{f}</option>
                ))}
              </Select>
              <CampoColor label="Color de los títulos" value={config.tipografia.color_titulo} onChange={(v) => cambiarTipografia({ color_titulo: v })} />
              <Select label="Letra del texto" value={config.tipografia.fuente_texto} onChange={(e) => cambiarTipografia({ fuente_texto: e.target.value })}>
                {fuentes.map((f) => (
                  <option key={f}>{f}</option>
                ))}
              </Select>
              <CampoColor label="Color del texto" value={config.tipografia.color_texto} onChange={(v) => cambiarTipografia({ color_texto: v })} />
            </div>
          </Card>

          <Card>
            <CardHeader title="Secciones" subtitle="Muestra, oculta y ordena los bloques de la página. El inicio siempre aparece primero." />
            <ul className="divide-y divide-border">
              {config.secciones.map((s, i) => (
                <li key={s.clave} className="flex items-center justify-between gap-3 py-2">
                  <Switch
                    label={ETIQUETA_SECCION[s.clave]}
                    checked={s.visible}
                    onChange={(visible) => cambiar({ secciones: config.secciones.map((x) => (x.clave === s.clave ? { ...x, visible } : x)) })}
                  />
                  <div className="flex gap-1">
                    <IconButton label="Subir" icon={<ChevronDownIcon className="rotate-180" />} disabled={i === 0} onClick={() => mover(i, -1)} />
                    <IconButton label="Bajar" icon={<ChevronDownIcon />} disabled={i === config.secciones.length - 1} onClick={() => mover(i, 1)} />
                  </div>
                </li>
              ))}
            </ul>
          </Card>

          {plantilla.slider && (
            <Card>
              <CardHeader
                title="Imágenes del carrusel"
                subtitle={`Hasta ${maxImagenes} imágenes (PNG, JPG o WEBP, 2 MB). Se agregan o quitan al instante, sin esperar a guardar.`}
              />
              <div className="space-y-3">
                {(agregarImagen.isError || quitarImagen.isError) && <Alert tone="error">{errorMessage(agregarImagen.error ?? quitarImagen.error)}</Alert>}
                {!plantillaGuardada?.slider && (
                  <Alert tone="info">Guarda los cambios para que la página pública muestre el carrusel con estas imágenes.</Alert>
                )}
                {imagenes.length > 0 && (
                  <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                    {imagenes.map((imagen, i) => (
                      <li key={imagen.id} className="relative overflow-hidden rounded-lg border border-border bg-soft">
                        <img src={urlImagenSitio(imagen)} alt={`Imagen ${i + 1} del carrusel`} className="aspect-video w-full object-cover" />
                        <IconButton
                          tone="danger"
                          label={`Quitar imagen ${i + 1}`}
                          icon={<TrashIcon />}
                          className="absolute right-1.5 top-1.5"
                          disabled={quitarImagen.isPending}
                          onClick={() => quitarImagen.mutate(imagen.id)}
                        />
                      </li>
                    ))}
                  </ul>
                )}
                {imagenes.length < maxImagenes ? (
                  <>
                    <Dropzone
                      extensiones={['.png', '.jpg', '.jpeg', '.webp']}
                      maxBytes={MAX_BYTES_IMAGEN}
                      file={archivo}
                      onFile={setArchivo}
                      hint="Se recomienda una foto horizontal, de al menos 1600 px de ancho."
                      etiqueta="Imagen para el carrusel"
                      disabled={agregarImagen.isPending}
                    />
                    <Button type="button" onClick={() => void subirImagen()} isLoading={agregarImagen.isPending} disabled={!archivo}>
                      Agregar imagen
                    </Button>
                  </>
                ) : (
                  <p className="text-sm text-muted">Llegaste al máximo de imágenes. Quita una para agregar otra.</p>
                )}
              </div>
            </Card>
          )}
        </div>

        <Card className="xl:sticky xl:top-4 xl:self-start">
          <CardHeader title="Vista previa" subtitle={borrador ? 'Así se verá con tus cambios sin guardar.' : 'Así se ve hoy la página pública.'} />
          {info.data ? (
            <div className="h-[640px] overflow-auto rounded-xl border border-border">
              <div style={{ zoom: 0.5, width: '1200px' }}>
                <SitioRenderizado
                  info={info.data}
                  config={config}
                  imagenes={imagenesVisibles}
                  acciones={{ iniciarSesion: NADA, solicitar: NADA, consultar: NADA, irA: NADA }}
                  vistaPrevia
                />
              </div>
            </div>
          ) : (
            <Alert tone="info">Configura primero la institución para ver la vista previa.</Alert>
          )}
        </Card>
      </div>
    </div>
  );
}
