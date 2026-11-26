import { Alert, Avatar, Badge, Button, Group, Portal, Stack, Text, Tooltip } from '@mantine/core';
import { modals } from '@mantine/modals';
import { IconArrowLeft, IconDeviceFloppy, IconRefresh, IconTrashX, IconUsers } from '@tabler/icons-react';
import { type ReactNode, useEffect, useRef } from 'react';
import { useCurrentUser } from '../../api';
import { UserAvatar } from '../UserAvatar';
import { joinNames, stampLabel, useDocumentPresence, useEditSession } from '../docs/editSession';
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
  const session = useEditSession();
  const me = useCurrentUser();
  const loaded = session?.doc;
  const { editors, saved, missing } = useDocumentPresence(loaded?.id, opened);
  // Alguém salvou uma versão diferente da que está aberta aqui.
  const newer = !!saved && !!loaded?.updated_at && saved.updated_at !== loaded.updated_at;
  const savedBy = !saved ? '' : saved.user_id === me.id ? 'Você (em outra janela)' : saved.name || 'Outra pessoa';

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

  const reload = () =>
    dirty
      ? modals.openConfirmModal({
          title: 'Carregar a versão salva?',
          children: <Text size="sm">As alterações que você fez aqui e ainda não salvou serão descartadas.</Text>,
          labels: { confirm: 'Descartar e carregar', cancel: 'Continuar editando' },
          confirmProps: { color: 'red' },
          onConfirm: () => session?.reload(),
        })
      : session?.reload();

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
        {(missing || newer || editors.length > 0) && (
          <div className="doc-editor-alerts">
            {missing && (
              <Alert variant="light" color="red" p="xs" icon={<IconTrashX size={18} />}>
                <Text size="sm">Este documento foi excluído por outra pessoa. Se salvar, o SIGASE vai avisar que ele não existe mais.</Text>
              </Alert>
            )}
            {!missing && newer && (
              <Alert variant="light" color="orange" p="xs" icon={<IconRefresh size={18} />}>
                <Group justify="space-between" gap="xs" wrap="nowrap">
                  <Text size="sm">
                    <b>{savedBy}</b> salvou uma versão nova{stampLabel(saved!.updated_at) ? ` às ${stampLabel(saved!.updated_at)}` : ''} enquanto você edita. Se você salvar agora, o SIGASE vai perguntar o que fazer.
                  </Text>
                  <Button size="compact-sm" variant="light" color="orange" onClick={reload} style={{ flexShrink: 0 }}>
                    Carregar a versão nova
                  </Button>
                </Group>
              </Alert>
            )}
            {!missing && editors.length > 0 && (
              <Alert variant="light" color="blue" p="xs" icon={<IconUsers size={18} />}>
                <Group gap="sm" wrap="nowrap">
                  <Avatar.Group spacing="xs">
                    {editors.map((e) => (
                      <Tooltip key={e.user_id} label={`${e.name} · aberto ${stampLabel(e.since) ? `às ${stampLabel(e.since)}` : 'agora'}`} withArrow>
                        <UserAvatar name={e.name} icon={e.avatar_icon} size={26} />
                      </Tooltip>
                    ))}
                  </Avatar.Group>
                  <Text size="sm">
                    <b>{joinNames(editors.map((e) => e.name))}</b> {editors.length > 1 ? 'também estão' : 'também está'} com este documento aberto agora. Combinem antes de salvar: quem salvar depois será avisado e poderá escolher o que fazer.
                  </Text>
                </Group>
              </Alert>
            )}
          </div>
        )}
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
