import { Badge, Button, Group, Portal, Stack, Text } from '@mantine/core';
import { modals } from '@mantine/modals';
import { IconArrowLeft, IconDeviceFloppy } from '@tabler/icons-react';
import { type ReactNode, useEffect, useRef } from 'react';
import './paper.css';

interface Props {
  opened: boolean;
  eyebrow: string;
  title: string;
  dirty: boolean;
  saving?: boolean;
  submitLabel: string;
  onCancel: () => void;
  onSave: () => void;
  sidebar: ReactNode;
  children: ReactNode;
}

/** Editor em tela cheia: a folha A4 no centro e as ferramentas de automação ao lado. */
export function DocEditorShell({ opened, eyebrow, title, dirty, saving, submitLabel, onCancel, onSave, sidebar, children }: Props) {
  const canvas = useRef<HTMLDivElement>(null);

  // Trava a rolagem da página de fundo e permite salvar com Ctrl+S.
  useEffect(() => {
    if (!opened) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {
        e.preventDefault();
        save();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener('keydown', onKey);
    };
  });

  const save = () => {
    onSave();
    // Leva até o primeiro campo com problema.
    window.setTimeout(() => {
      const invalid = canvas.current?.querySelector<HTMLElement>('[aria-invalid="true"]');
      if (invalid) {
        invalid.scrollIntoView({ behavior: 'smooth', block: 'center' });
        if (invalid.tagName !== 'SPAN') invalid.focus({ preventScroll: true });
      }
    }, 80);
  };

  const cancel = () =>
    dirty
      ? modals.openConfirmModal({
          title: 'Descartar alterações?',
          children: <Text size="sm">As alterações feitas neste documento ainda não foram salvas.</Text>,
          labels: { confirm: 'Descartar', cancel: 'Continuar editando' },
          confirmProps: { color: 'red' },
          onConfirm: onCancel,
        })
      : onCancel();

  if (!opened) return null;
  return (
    <Portal>
      <div className="doc-editor page-enter" role="dialog" aria-modal="true" aria-label={title}>
        <div className="doc-editor-bar">
          <Button variant="subtle" color="gray" leftSection={<IconArrowLeft size={18} />} onClick={cancel}>
            Voltar
          </Button>
          <Stack gap={0} style={{ flex: 1, minWidth: 0 }}>
            <Text size="xs" fw={700} c="sigase" tt="uppercase" style={{ letterSpacing: 1.2 }} truncate>
              {eyebrow}
            </Text>
            <Group gap="xs" wrap="nowrap">
              <Text fw={800} truncate>
                {title}
              </Text>
              {dirty && (
                <Badge size="xs" color="brass" variant="light">
                  Não salvo
                </Badge>
              )}
            </Group>
          </Stack>
          <Text size="xs" c="dimmed" visibleFrom="md">
            Ctrl+S para salvar
          </Text>
          <Button leftSection={<IconDeviceFloppy size={18} />} loading={saving} onClick={save}>
            {submitLabel}
          </Button>
        </div>
        <div className="doc-editor-main">
          <div className="doc-editor-canvas" ref={canvas}>
            {children}
          </div>
          <aside className="doc-editor-side">{sidebar}</aside>
        </div>
      </div>
    </Portal>
  );
}

/** Bloco do painel lateral. */
export function SideCard({ title, icon, children }: { title: string; icon?: ReactNode; children: ReactNode }) {
  return (
    <Stack gap="xs" mb="lg">
      <Group gap={6}>
        {icon}
        <Text fw={700} size="sm">
          {title}
        </Text>
      </Group>
      {children}
    </Stack>
  );
}
