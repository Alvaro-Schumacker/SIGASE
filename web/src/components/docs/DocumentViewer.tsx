import { Alert, Button, Group, Modal, Stack, Text } from '@mantine/core';
import { IconEdit, IconPrinter, IconTrash } from '@tabler/icons-react';
import { useMemo } from 'react';
import { type DocumentRecord, documentPaper } from '../../data/documents';
import { printPaper } from '../../lib/print';
import { PaperPreview } from '../PaperPreview';

interface Props {
  doc: DocumentRecord | null;
  onClose: () => void;
  canEdit: boolean;
  onEdit: (doc: DocumentRecord) => void;
  onDelete: (doc: DocumentRecord) => void;
}

const EYEBROW = { fatd: 'FATD · Processo', prorrogacao: 'Requerimento · Informação nº', adiantamento13: 'Requerimento · Adiantamento de 13º', aditamento: 'Documento · Boletim Nr', pernoite: 'Documento · Boletim Nr' } as const;

export function DocumentViewer({ doc, onClose, canEdit, onEdit, onDelete }: Props) {
  const paper = useMemo(() => {
    if (!doc) return null;
    try {
      return documentPaper(doc);
    } catch (error) {
      console.error('Falha ao montar prévia do documento:', error);
      return null;
    }
  }, [doc]);

  return (
    <Modal
      opened={!!doc}
      onClose={onClose}
      size="auto"
      title={
        <div>
          <Text size="xs" fw={700} c="sigase" tt="uppercase" style={{ letterSpacing: 1.2 }}>
            {doc ? `${EYEBROW[doc.kind]} ${doc.bulletin_number}` : ''}
          </Text>
          <Text fw={800} size="lg">
            Documento arquivado
          </Text>
        </div>
      }
    >
      {doc && (
        <Stack w={{ base: '92vw', md: 880 }} maw="100%">
          {paper ? <PaperPreview paper={paper} height="calc(100vh - 230px)" /> : <Alert color="red">Não foi possível abrir a prévia deste documento. Verifique os dados salvos.</Alert>}
          <Group justify="space-between">
            {canEdit ? (
              <Button variant="subtle" color="red" leftSection={<IconTrash size={16} />} onClick={() => onDelete(doc)}>
                Excluir
              </Button>
            ) : (
              <span />
            )}
            <Group gap="xs">
              {canEdit && (
                <Button variant="default" leftSection={<IconEdit size={16} />} onClick={() => onEdit(doc)}>
                  Editar
                </Button>
              )}
              <Button leftSection={<IconPrinter size={16} />} disabled={!paper} onClick={() => paper && printPaper(paper)}>
                Imprimir / PDF
              </Button>
            </Group>
          </Group>
        </Stack>
      )}
    </Modal>
  );
}
