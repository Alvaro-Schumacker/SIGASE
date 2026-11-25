import { Badge, Card, Grid, Group, Indicator, Skeleton, Stack, Text, Timeline, Title } from '@mantine/core';
import { IconHistory } from '@tabler/icons-react';
import { Navigate } from 'react-router-dom';
import { useCurrentUser } from '../api';
import { EmptyState } from '../components/EmptyState';
import { PageHeader } from '../components/PageHeader';
import { UserAvatar } from '../components/UserAvatar';
import { useHistory } from '../data/notices';
import type { HistoryEntry } from '../types';

const TZ = 'America/Sao_Paulo';
const dayKey = (iso: string) => new Intl.DateTimeFormat('pt-BR', { timeZone: TZ, day: '2-digit', month: 'long', year: 'numeric' }).format(new Date(iso));
const timeOf = (iso: string) => new Intl.DateTimeFormat('pt-BR', { timeZone: TZ, hour: '2-digit', minute: '2-digit' }).format(new Date(iso));

/** Registro de alterações (auditoria) e usuários online — somente administradores. */
export function HistoryPage() {
  const me = useCurrentUser();
  const { data, isLoading, error } = useHistory(me.canManageUsers);
  if (!me.canManageUsers) return <Navigate to="/" replace />;

  const groups = new Map<string, HistoryEntry[]>();
  for (const entry of data?.entries ?? []) {
    const key = dayKey(entry.created_at);
    groups.set(key, [...(groups.get(key) ?? []), entry]);
  }
  const online = data?.online ?? [];

  return (
    <>
      <PageHeader title="Histórico" subtitle="Alterações registradas no sistema (últimas 250)" eyebrow="Administração" />
      <Grid gap="lg">
        <Grid.Col span={{ base: 12, md: 8 }}>
          <Card>
            {isLoading && <Skeleton h={300} />}
            {error && <EmptyState title="Histórico indisponível" description={error.message} />}
            {!isLoading && !error && !groups.size && (
              <EmptyState title="Sem alterações registradas" description="As ações aparecerão aqui conforme forem realizadas." icon={<IconHistory size={26} />} />
            )}
            <Stack gap="xl">
              {[...groups.entries()].map(([day, items]) => (
                <div key={day}>
                  <Text fw={800} ff="heading" mb="sm">
                    {day}
                  </Text>
                  <Timeline bulletSize={10} lineWidth={2} color="sigase">
                    {items.map((item) => (
                      <Timeline.Item key={item.id}>
                        <Group gap="xs" wrap="nowrap" align="flex-start">
                          <Text size="xs" c="dimmed" w={40} style={{ flexShrink: 0 }}>
                            {timeOf(item.created_at)}
                          </Text>
                          <Text size="sm">
                            <b>{item.actor_name}</b> {item.action} {item.entity}
                            {item.entity_label && <b> {item.entity_label}</b>}
                          </Text>
                        </Group>
                      </Timeline.Item>
                    ))}
                  </Timeline>
                </div>
              ))}
            </Stack>
          </Card>
        </Grid.Col>
        <Grid.Col span={{ base: 12, md: 4 }}>
          <Card style={{ position: 'sticky', top: 80 }}>
            <Group justify="space-between" mb="md">
              <Title order={4}>Online agora</Title>
              <Badge color="sigase" variant="filled" circle={online.length < 10}>
                {online.length}
              </Badge>
            </Group>
            {!online.length && (
              <Text size="sm" c="dimmed">
                Nenhum usuário online no momento.
              </Text>
            )}
            <Stack gap="sm">
              {online.map((u) => (
                <Group key={u.id} gap="sm">
                  <Indicator color="green" size={10} offset={4} position="bottom-end" withBorder processing>
                    <UserAvatar name={u.display_name} icon={u.avatar_icon} size={34} />
                  </Indicator>
                  <Text size="sm" fw={600}>
                    {u.display_name}
                  </Text>
                </Group>
              ))}
            </Stack>
          </Card>
        </Grid.Col>
      </Grid>
    </>
  );
}
