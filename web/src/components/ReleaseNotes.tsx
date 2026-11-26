import { ActionIcon, Button, Indicator, List, Popover, Stack, Text, ThemeIcon, Title, Tooltip } from '@mantine/core';
import { IconSparkles } from '@tabler/icons-react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { api } from '../api';

/** Notas da versão: aparecem uma vez por usuário (ciência registrada no banco, como na versão atual). */
export const RELEASE = {
  version: '2.2.0',
  title: 'Plano de férias renovado',
  entries: [
    'Calendário em linha do tempo: uma linha por militar, com parcela, dias e referência.',
    'Desconto em férias, que sai automaticamente da última parcela.',
    'Divisões 30, 15+15, 20+10 e 10+10+10, e qualquer ano de referência.',
    'Deslocamento liberado uma vez por referência, com aviso quando já foi usado.',
    'Nova aba “Saldo por militar”. A versão clássica agora fica em /classico/.',
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
