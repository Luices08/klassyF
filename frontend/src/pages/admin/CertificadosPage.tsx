import { useSearchParams } from 'react-router-dom';
import { useState } from 'react';
import { ConfiguracionCertificadosPanel } from '../../components/certificados/ConfiguracionCertificadosPanel';
import { ExpedirCertificado } from '../../components/certificados/ExpedirCertificado';
import { HistorialCertificados } from '../../components/certificados/HistorialCertificados';
import { PlantillasCertificadosPanel } from '../../components/certificados/PlantillasCertificadosPanel';
import { PageHeader } from '../../components/ui/PageHeader';
import { TabPanel, Tabs } from '../../components/ui/Tabs';
import { useAuth } from '../../context/AuthContext';

/** Secretaría académica (M26): expedir constancias y certificados, ver lo expedido y configurar firmas y sellos (cada rol, según lo que el servidor le permita). */
export function CertificadosPage() {
  const { user } = useAuth();
  const [params] = useSearchParams();
  const [tab, setTab] = useState('expedir');
  const tabs = [
    { key: 'expedir', label: 'Expedir' },
    { key: 'historial', label: 'Historial' },
    { key: 'firmas', label: 'Firmas y sellos' },
    // El texto de los documentos lo define el administrador.
    ...(user?.rol === 'ADMIN' ? [{ key: 'plantillas', label: 'Plantillas' }] : []),
  ];

  return (
    <div className="space-y-4">
      <PageHeader title="Certificados y constancias" subtitle="Cada documento sale con los datos que el sistema ya conoce, un código único, QR y huella de integridad verificables." />
      <Tabs items={tabs} active={tab} onChange={setTab} />
      <TabPanel active={tab} tabKey="expedir">
        <ExpedirCertificado estudianteInicial={params.get('estudiante') ?? undefined} />
      </TabPanel>
      <TabPanel active={tab} tabKey="historial">
        <HistorialCertificados />
      </TabPanel>
      <TabPanel active={tab} tabKey="firmas">
        <ConfiguracionCertificadosPanel />
      </TabPanel>
      <TabPanel active={tab} tabKey="plantillas">
        <PlantillasCertificadosPanel />
      </TabPanel>
    </div>
  );
}
