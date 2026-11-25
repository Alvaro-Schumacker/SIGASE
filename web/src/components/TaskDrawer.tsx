import { Badge, Button, Divider, Drawer, Group, Stack, Text, ThemeIcon, Timeline, Title } from '@mantine/core';
import { modals } from '@mantine/modals';
import { notifications } from '@mantine/notifications';
import { IconCheck, IconCircleDot, IconPlayerPlay, IconPlus, IconTrash } from '@tabler/icons-react';
import dayjs from 'dayjs';
import { useCurrentUser, useDeleteTask, useUpdateTaskStatus, useUsers } from '../api';
import { isAssignedTo } from '../lib/tasks';
import type { Task } from '../types';
import { AssigneeAvatars, DueText, PriorityBadge, StatusBadge } from './TaskBadges';

const EVENT_ICON: Record<string, React.ReactNode> = {
  Criada: <IconPlus size={12} />,
  Iniciada: <IconPlayerPlay size={12} />,
  Concluída: <IconCheck size={12} />,
};

interface Props {
  task: Task | null;
  onClose: () => void;
}

/** Painel lateral com os detalhes e ações de uma tarefa. */
export function TaskDrawer({ task, onClose }: Props) {
  const me = useCurrentUser();
  const { data: users = [] } = useUsers();
  const update = useUpdateTaskStatus();
  const remove = useDeleteTask();

  const assigned = task ? isAssignedTo(task, me) : false;
  const canAct = !!task && me.canEditTasks && assigned && task.status !== 'Concluída';

  const setStatus = (status: 'Em andamento' | 'Concluída') =>
    task &&
    update.mutate(
      { id: task.id, status },
      {
        onSuccess: () => {
          notifications.show({ color: 'sigase', message: status === 'Concluída' ? 'Tarefa concluída.' : 'Tarefa iniciada.' });
          onClose();
        },
        onError: (e) => notifications.show({ color: 'red', title: 'Não foi possível atualizar', message: e.message }),
      },
    );

  const confirmDelete = () =>
    task &&
    modals.openConfirmModal({
      title: 'Excluir tarefa',
      children: <Text size="sm">A tarefa “{task.title}” será excluída para todos os envolvidos. Essa ação não pode ser desfeita.</Text>,
      labels: { confirm: 'Excluir', cancel: 'Cancelar' },
      confirmProps: { color: 'red' },
      onConfirm: () =>
        remove.mutate(task.id, {
          onSuccess: () => {
            notifications.show({ color: 'sigase', message: 'Tarefa excluída.' });
            onClose();
          },
          onError: (e) => notifications.show({ color: 'red', title: 'Não foi possível excluir', message: e.message }),
        }),
    });

  return (
    <Drawer opened={!!task} onClose={onClose} position="right" size="md" title={<Text fw={700}>Detalhes da tarefa</Text>}>
      {task && (
        <Stack gap="lg">
          <Stack gap={6}>
            {task.classification && (
              <Badge color="brass" variant="light" w="fit-content">
                {task.classification}
              </Badge>
            )}
            <Title order={3}>{task.title}</Title>
            <Group gap="xs">
              <StatusBadge task={task} />
              <PriorityBadge task={task} />
              <DueText task={task} />
            </Group>
          </Stack>

          <Text size="sm" style={{ whiteSpace: 'pre-wrap' }} c={task.description ? undefined : 'dimmed'}>
            {task.description || 'Sem descrição.'}
          </Text>

          <Group grow align="flex-start">
            <Stack gap={4}>
              <Text size="xs" c="dimmed" fw={600} tt="uppercase">
                Solicitante
              </Text>
              <Text size="sm" fw={600}>
                {task.requester}
              </Text>
            </Stack>
            <Stack gap={4}>
              <Text size="xs" c="dimmed" fw={600} tt="uppercase">
                Responsáveis
              </Text>
              <Group gap="xs">
                <AssigneeAvatars task={task} users={users} />
                <Text size="sm" fw={600}>
                  {task.assignee}
                </Text>
              </Group>
            </Stack>
          </Group>

          <Divider label="Histórico" labelPosition="left" />
          <Timeline active={task.events.length - 1} bulletSize={22} lineWidth={2}>
            {task.events.map(([action, author, when], index) => (
              <Timeline.Item
                key={index}
                title={action}
                bullet={
                  <ThemeIcon size={22} radius="xl">
                    {EVENT_ICON[action] ?? <IconCircleDot size={12} />}
                  </ThemeIcon>
                }
              >
                <Text size="xs" c="dimmed">
                  {author} · {dayjs(when).format('DD/MM/YYYY [às] HH:mm')}
                </Text>
              </Timeline.Item>
            ))}
          </Timeline>

          {(canAct || me.canEditTasks) && <Divider />}
          <Group justify="space-between">
            {me.canEditTasks ? (
              <Button variant="subtle" color="red" leftSection={<IconTrash size={16} />} onClick={confirmDelete} loading={remove.isPending}>
                Excluir
              </Button>
            ) : (
              <span />
            )}
            {canAct && (
              <Group gap="xs">
                {task.status === 'Pendente' && (
                  <Button variant="light" leftSection={<IconPlayerPlay size={16} />} onClick={() => setStatus('Em andamento')} loading={update.isPending}>
                    Iniciar
                  </Button>
                )}
                <Button leftSection={<IconCheck size={16} />} onClick={() => setStatus('Concluída')} loading={update.isPending}>
                  Concluir
                </Button>
              </Group>
            )}
          </Group>
        </Stack>
      )}
    </Drawer>
  );
}
