import { useCurrentUser } from '../api';
import { DocumentArchive } from '../components/docs/DocumentArchive';

export function DocumentsPage() {
  const me = useCurrentUser();
  return (
    <DocumentArchive
      kinds={['aditamento', 'pernoite', 'fatd']}
      title="Aditamentos e pernoites"
      eyebrow="Documentos de serviço"
      subtitle="Preencha, arquive, revise e imprima os documentos diários."
      canEdit={me.canEditDocuments}
    />
  );
}

export function RequirementsPage() {
  const me = useCurrentUser();
  return (
    <DocumentArchive
      kinds={['prorrogacao', 'adiantamento13']}
      title="Requerimentos"
      eyebrow="Documentos de pessoal"
      subtitle="Crie, arquive e imprima requerimentos da unidade."
      canEdit={me.canEditRequirements}
    />
  );
}
