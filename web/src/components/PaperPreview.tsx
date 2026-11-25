import { Box } from '@mantine/core';
import { type Paper, paperDocument } from '../lib/print';

interface Props {
  paper: Paper;
  height?: string | number;
}

/** Prévia do documento A4, isolada da interface (mesmo HTML usado na impressão). */
export function PaperPreview({ paper, height = '72vh' }: Props) {
  return (
    <Box style={{ borderRadius: 'var(--mantine-radius-md)', overflow: 'hidden', border: '1px solid var(--mantine-color-default-border)' }}>
      <iframe title="Prévia do documento" srcDoc={paperDocument(paper, true)} style={{ width: '100%', height, border: 0, display: 'block', background: '#e9ece7' }} />
    </Box>
  );
}
