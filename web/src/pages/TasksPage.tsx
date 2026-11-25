import { Badge, Button, Card, Center, Group, Select, Skeleton, Stack, Table, Tabs, Text, TextInput, ThemeIcon, Title, UnstyledButton } from '@mantine/core';
import { useDebouncedValue, useDisclosure, useMediaQuery } from '@mantine/hooks';
import { IconInbox, IconPlus, IconSearch } from '@tabler/icons-react';
import { useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useCurrentUser, useTasks, useUsers } from '../api';
import { TASK_TABS, type TaskTab, tasksForTab, visibleTasks } from '../lib/tasks';
import type { Task } from '../types';
import { AssigneeAvatars, DueText, PriorityBadge, StatusBadge } from '../components/TaskBadges';
import { TaskDrawer } from '../components/TaskDrawer';
import { NewTaskModal } from '../components/NewTaskModal';

export function TasksPage() {
  const me = useCurrentUser();
  const { data: rawTasks, isLoading } = useTasks();
  const { data: users = [] } = useUsers();
  const [params, setParams] = useSearchParams();
  const [search, setSearch] = useState('');
  const [debounced] = useDebouncedValue(search, 200);
  const [priority, setPriority] = useState<string | null>(null);
  const [selected, setSelected] = useState<Task | null>(null);
  const [newOpen, newTask] = useDisclosure();
  const mobile = useMediaQuery('(max-width: 48em)');

  const tab = (TASK_TABS as readonly string[]).includes(params.get('aba') ?? '') ? (params.get('aba') as TaskTab) : 'Recebidas';
  const tasks = useMemo(() => visibleTasks(rawTasks ?? [], me), [rawTasks, me]);

  const list = useMemo(() => {
    const term = debounced.trim().toLocaleLowerCase('pt-BR');
    return tasksForTab(tasks, tab, me)
      .filter((t) => !priority || t.priority === priority)
      .filter((t) => !term || `${t.title} ${t.description} ${t.assignee} ${t.requester} ${t.classification ?? ''}`.toLocaleLowerCase('pt-BR').includes(term))
      .sort((a, b) => (tab === 'Concluídas' ? b.created.localeCompare(a.created) : a.due.localeCompare(b.due)));
  }, [tasks, tab, me, priority, debounced]);

  // Mantém o painel atualizado quando os dados recarregam.
  const selectedFresh = selected ? (rawTasks ?? []).find((t) => t.id === selected.id) ?? null : null;

  return (
    <Stack gap="lg">
      <Group justify="space-between" align="flex-end">
        <div>
          <Title order={2}>Caixa de entrada</Title>
          <Text c="dimmed">Tarefas recebidas e enviadas pela equipe</Text>
        </div>
        {me.canEditTasks && (
          <Button leftSection={<IconPlus size={18} />} onClick={newTask.open}>
            Nova tarefa
          </Button>
        )}
      </Group>

      <Card p={0}>
        <Tabs value={tab} onChange={(value) => value && setParams({ aba: value })} variant="default">
          <Tabs.List px="md" pt="xs" style={{ flexWrap: 'nowrap', overflowX: 'auto' }}>
            {TASK_TABS.map((name) => {
              const count = tasksForTab(tasks, name, me).length;
              return (
                <Tabs.Tab
                  key={name}
                  value={name}
                  rightSection={
                    count ? (
                      <Badge size="xs" variant={name === tab ? 'filled' : 'light'} color={name === 'Atrasadas' ? 'red' : 'sigase'} circle={count < 10}>
                        {count}
                      </Badge>
                    ) : null
                  }
                >
                  {name}
                </Tabs.Tab>
              );
            })}
          </Tabs.List>
        </Tabs>

        <Group p="md" gap="sm" wrap="wrap">
          <TextInput
            placeholder="Buscar por título, pessoa ou classificação…"
            leftSection={<IconSearch size={16} />}
            value={search}
            onChange={(e) => setSearch(e.currentTarget.value)}
            style={{ flex: '1 1 260px' }}
          />
          <Select
            placeholder="Todas as prioridades"
            clearable
            data={['Alta', 'Média', 'Baixa']}
            value={priority}
            onChange={setPriority}
            style={{ flex: mobile ? '1 1 100%' : '0 0 200px' }}
          />
        </Group>

        {isLoading && (
          <Stack p="md" pt={0} gap="xs">
            {Array.from({ length: 5 }, (_, i) => (
              <Skeleton key={i} h={48} />
            ))}
          </Stack>
        )}

        {!isLoading && !list.length && (
          <Center py={60}>
            <Stack align="center" gap="xs">
              <ThemeIcon size={56} radius="xl" variant="light" color="gray">
                <IconInbox size={28} />
              </ThemeIcon>
              <Text fw={600}>Nada por aqui</Text>
              <Text size="sm" c="dimmed">
                {search || priority ? 'Nenhuma tarefa corresponde aos filtros.' : `Nenhuma tarefa em “${tab}”.`}
              </Text>
            </Stack>
          </Center>
        )}

        {!isLoading && !!list.length && mobile && (
          <Stack p="md" pt={0} gap="xs">
            {list.map((t) => (
              <UnstyledButton key={t.id} onClick={() => setSelected(t)}>
                <Card padding="sm" radius="md">
                  <Group justify="space-between" wrap="nowrap" align="flex-start">
                    <Text fw={600} size="sm" lineClamp={2}>
                      {t.title}
                    </Text>
                    <StatusBadge task={t} />
                  </Group>
                  <Text size="xs" c="dimmed" mt={4}>
                    {t.requester} → {t.assignee}
                  </Text>
                  <Group justify="space-between" mt="xs">
                    <PriorityBadge task={t} />
                    <DueText task={t} />
                  </Group>
                </Card>
              </UnstyledButton>
            ))}
          </Stack>
        )}

        {!isLoading && !!list.length && !mobile && (
          <Table.ScrollContainer minWidth={760}>
            <Table highlightOnHover verticalSpacing="sm" horizontalSpacing="md">
              <Table.Thead>
                <Table.Tr>
                  <Table.Th>Tarefa</Table.Th>
                  <Table.Th>Solicitante</Table.Th>
                  <Table.Th>Responsáveis</Table.Th>
                  <Table.Th>Prioridade</Table.Th>
                  <Table.Th>Prazo</Table.Th>
                  <Table.Th>Status</Table.Th>
                </Table.Tr>
              </Table.Thead>
              <Table.Tbody>
                {list.map((t) => (
                  <Table.Tr key={t.id} className="task-row" onClick={() => setSelected(t)}>
                    <Table.Td maw={340}>
                      <Text fw={600} size="sm" truncate>
                        {t.title}
                      </Text>
                      {t.classification && (
                        <Text size="xs" c="brass.7" fw={600}>
                          {t.classification}
                        </Text>
                      )}
                    </Table.Td>
                    <Table.Td>
                      <Text size="sm">{t.requester}</Text>
                    </Table.Td>
                    <Table.Td>
                      <AssigneeAvatars task={t} users={users} />
                    </Table.Td>
                    <Table.Td>
                      <PriorityBadge task={t} />
                    </Table.Td>
                    <Table.Td>
                      <DueText task={t} />
                    </Table.Td>
                    <Table.Td>
                      <StatusBadge task={t} />
                    </Table.Td>
                  </Table.Tr>
                ))}
              </Table.Tbody>
            </Table>
          </Table.ScrollContainer>
        )}
      </Card>

      <TaskDrawer task={selectedFresh} onClose={() => setSelected(null)} />
      <NewTaskModal opened={newOpen} onClose={newTask.close} />
    </Stack>
  );
}
