import { ActionIcon, Button, Indicator, List, Popover, Stack, Text, ThemeIcon, Title, Tooltip } from '@mantine/core';
import { IconSparkles } from '@tabler/icons-react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { api } from '../api';

/** Notas da versão: aparecem uma vez por usuário (ciência registrada no banco, como na versão atual). */
export const RELEASE = {
  version: '2.1.0',
  title: 'Negrito do nome de guerra',
  entries: [
    'Selecione parte do nome na folha e aperte Ctrl+B para marcar o negrito.',
    'Iniciais abreviadas no nome de guerra (ex.: “M. Fonseca”) deixam só a letra em negrito.',
    'O nome inteiro não fica mais em negrito quando o nome de guerra não é encontrado.',
    'Prorrogação: punições e situação na OM já vêm preenchidas em novos requerimentos.',
  ],
};

export function ReleaseNotes() {
  const qc = useQueryClient();
  const [opened, setOpened] = useState(false);
  const { data } = useQuery({
    queryKey: ['release-note', RELEASE.version],
    queryFn: () => api<{ acknowledged: boolean }>(`/api/release-note?version=${encodeURIComponent(RELEASE.version)}`),
    staleTime: Infinity,
  });
  const ack = useMutation({
    mutationFn: () => api('/api/release-note/ack', { method: 'POST', body: { version: RELEASE.version } }),
    onSettled: () => {
      qc.setQueryData(['release-note', RELEASE.version], { acknowledged: true });
      setOpened(false);
    },
  });
  const unread = data ? !data.acknowledged : false;

  return (
    <Popover opened={opened} onChange={setOpened} width={320} position="bottom-end" shadow="lg" radius="lg" withArrow>
      <Popover.Target>
        <Tooltip label="Novidades" disabled={opened}>
          <Indicator disabled={!unread} color="brass" size={9} offset={6} processing>
            <ActionIcon variant="default" size="lg" aria-label="Novidades da versão" onClick={() => setOpened((o) => !o)}>
              <IconSparkles size={18} />
            </ActionIcon>
          </Indicator>
        </Tooltip>
      </Popover.Target>
      <Popover.Dropdown p="lg">
        <Stack gap="sm">
          <ThemeIcon variant="light" color="brass" radius="md" size="lg">
            <IconSparkles size={20} />
          </ThemeIcon>
          <div>
            <Text size="xs" fw={700} c="dimmed" tt="uppercase" style={{ letterSpacing: 1.2 }}>
              Versão {RELEASE.version}
            </Text>
            <Title order={4}>{RELEASE.title}</Title>
          </div>
          <List size="sm" spacing={6}>
            {RELEASE.entries.map((entry) => (
              <List.Item key={entry}>{entry}</List.Item>
            ))}
          </List>
          {unread && (
            <Button onClick={() => ack.mutate()} loading={ack.isPending} mt="xs">
              Entendi
            </Button>
          )}
        </Stack>
      </Popover.Dropdown>
    </Popover>
  );
}
