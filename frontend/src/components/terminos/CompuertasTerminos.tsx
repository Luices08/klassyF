import { useEffect, useRef, useState, type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { useAceptarTerminos, useDocumentosTerminos, useTerminosPendientes } from '../../hooks/useTerminos';
import { generalesAceptadosEnEstaPestana, generalesAceptadosEnNavegador, guardarGeneralesEnNavegador } from '../../lib/terminos';
import { PantallaTerminos, PantallaTerminosEspera } from './PantallaTerminos';

/** La primera vez que se abre la plataforma en un navegador, nada se muestra hasta aceptar los términos generales. */
export function CompuertaTerminosGenerales({ children }: { children: ReactNode }) {
  const documentos = useDocumentosTerminos();
  const [aceptadoAhora, setAceptadoAhora] = useState(false);
  const general = documentos.data?.find((d) => d.tipo === 'GENERAL');

  if (!general) return <PantallaTerminosEspera error={documentos.error} onReintentar={() => void documentos.refetch()} />;
  if (aceptadoAhora || generalesAceptadosEnNavegador(general.version)) return <>{children}</>;
  return (
    <PantallaTerminos
      documento={general}
      onAceptar={() => {
        guardarGeneralesEnNavegador(general.version);
        setAceptadoAhora(true);
      }}
    />
  );
}

/** Ya con sesión, la persona deja constancia en el servidor de los términos generales y los de su perfil antes de entrar. */
export function CompuertaTerminosPerfil({ children }: { children: ReactNode }) {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const documentos = useDocumentosTerminos();
  const pendientes = useTerminosPendientes(user?.id, user?.rol);
  const aceptar = useAceptarTerminos();

  // Quien acaba de aceptar los generales en esta pestaña antes de iniciar sesión no los vuelve a leer: se registran a su nombre.
  const generalPendiente = pendientes.data?.find((p) => p.tipo === 'GENERAL');
  const generalYaLeido = Boolean(generalPendiente && generalesAceptadosEnEstaPestana(generalPendiente.version));
  const { mutate, isPending } = aceptar;
  const enviadoSolo = useRef<string | null>(null);
  useEffect(() => {
    const clave = generalPendiente && `${user?.id}.${generalPendiente.version}`;
    if (!generalYaLeido || !generalPendiente || enviadoSolo.current === clave) return;
    enviadoSolo.current = clave ?? null;
    mutate([generalPendiente]);
  }, [generalYaLeido, generalPendiente, user?.id, mutate]);

  if (!user) return <>{children}</>;
  if (pendientes.data?.length === 0) return <>{children}</>;

  const siguiente = pendientes.data?.find((p) => !(p.tipo === 'GENERAL' && generalYaLeido));
  const documento = siguiente && documentos.data?.find((d) => d.tipo === siguiente.tipo);
  if (!siguiente || !documento) {
    return (
      <PantallaTerminosEspera
        error={pendientes.error ?? documentos.error ?? aceptar.error}
        onReintentar={() => {
          aceptar.reset();
          enviadoSolo.current = null;
          void pendientes.refetch();
          void documentos.refetch();
        }}
      />
    );
  }

  return (
    <PantallaTerminos
      key={`${documento.tipo}.${user.id}.${user.rol}`}
      documento={documento}
      guardando={isPending}
      error={aceptar.error}
      onAceptar={() => mutate([siguiente])}
      accionRechazo={{
        etiqueta: 'Cerrar sesión',
        onClick: () => {
          logout();
          navigate('/login', { replace: true });
        },
      }}
    />
  );
}
