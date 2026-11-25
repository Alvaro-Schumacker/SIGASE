import { Accordion, Badge, Button, Card, Group, Skeleton, Stack, Text, ThemeIcon } from '@mantine/core';
import { useDisclosure } from '@mantine/hooks';
import { IconBeach, IconPlus, IconSpeakerphone } from '@tabler/icons-react';
import { useState } from 'react';
import { useCurrentUser, useNotices } from '../api';
import { EmptyState } from '../components/EmptyState';
import { NewNoticeModal } from '../components/NewNoticeModal';
import { NewTaskModal } from '../components/NewTaskModal';
import { NoticeCard } from '../components/NoticeCard';
import { PageHeader } from '../components/PageHeader';
import type { Notice } from '../types';

const FOLDERS = [
  { key: 'geral', label: 'Avisos gerais', icon: IconSpeakerphone, empty: 'Avisos gerais enviados ou recebidos aparecerão aqui.' },
  { key: 'ferias', label: 'Férias', icon: IconBeach, empty: 'Avisos automáticos de férias aparecerão aqui.' },
];

export function NoticesPage() {
  const me = useCurrentUser();
  const { data: notices = [], isLoading } = useNotices();
  const [newOpen, newNotice] = useDisclosure();
  const [taskFrom, setTaskFrom] = useState<Notice | null>(null);

  return (
    <>
      <PageHeader
        title="Avisos"
        subtitle="Lembretes da equipe e avisos automáticos de férias"
        actions={
          me.canManageNotices && (
            <Button leftSection={<IconPlus size={18} />} onClick={newNotice.open}>
              Novo aviso
            </Button>
          )
        }
      />

      {isLoading ? (
        <Stack>
          <Skeleton h={64} radius="lg" />
          <Skeleton h={64} radius="lg" />
        </Stack>
      ) : (
        <Accordion multiple defaultValue={['geral']} variant="separated" radius="lg" chevronPosition="right">
          {FOLDERS.map((folder) => {
            const group = notices.filter((n) => (n.category || 'geral') === folder.key).sort((a, b) => b.notice_date.localeCompare(a.notice_date));
            const open = group.filter((n) => !n.all_acknowledged).length;
            return (
              <Accordion.Item key={folder.key} value={folder.key}>
                <Accordion.Control>
                  <Group gap="sm">
                    <ThemeIcon variant="light" radius="md" size="lg" color={folder.key === 'ferias' ? 'brass' : 'sigase'}>
                      <folder.icon size={20} />
                    </ThemeIcon>
                    <div>
                      <Text fw={700}>{folder.label}</Text>
                      <Text size="xs" c="dimmed">
                        {group.length} {group.length === 1 ? 'aviso' : 'avisos'}
                      </Text>
                    </div>
                    {open > 0 && (
                      <Badge color="brass" size="sm" ml="xs">
                        {open} em aberto
                      </Badge>
                    )}
                  </Group>
                </Accordion.Control>
                <Accordion.Panel>
                  {group.length ? (
                    <Stack gap="sm">
                      {group.map((n) => (
                        <NoticeCard key={n.id} notice={n} onCreateTask={me.canEditTasks ? setTaskFrom : undefined} />
                      ))}
                    </Stack>
                  ) : (
                    <Card withBorder={false} p={0}>
                      <EmptyState title="Pasta vazia" description={folder.empty} py={28} />
                    </Card>
                  )}
                </Accordion.Panel>
              </Accordion.Item>
            );
          })}
        </Accordion>
      )}

      <NewNoticeModal opened={newOpen} onClose={newNotice.close} />
      <NewTaskModal opened={!!taskFrom} onClose={() => setTaskFrom(null)} initial={taskFrom ? { title: taskFrom.title, description: taskFrom.subject } : undefined} />
    </>
  );
}
