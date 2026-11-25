import { Avatar, Badge, Group, Text, Tooltip } from '@mantine/core';
import { IconCalendarDue } from '@tabler/icons-react';
import type { AppUser, Task } from '../types';
import { dueLabel, isOverdue, priorityColor, statusInfo } from '../lib/tasks';
import { UserAvatar } from './UserAvatar';

export function StatusBadge({ task }: { task: Task }) {
  const info = statusInfo(task);
  return (
    <Badge color={info.color} variant={info.label === 'Atrasada' ? 'filled' : 'light'} style={{ flexShrink: 0, overflow: 'visible' }}>
      {info.label}
    </Badge>
  );
}

export function PriorityBadge({ task }: { task: Task }) {
  return (
    <Badge color={priorityColor[task.priority]} variant="dot">
      {task.priority}
    </Badge>
  );
}

export function DueText({ task }: { task: Task }) {
  const late = isOverdue(task);
  return (
    <Group gap={4} wrap="nowrap">
      <IconCalendarDue size={14} color={late ? 'var(--mantine-color-red-6)' : 'var(--mantine-color-dimmed)'} />
      <Text size="xs" c={late ? 'red' : 'dimmed'} fw={late ? 700 : 500}>
        {dueLabel(task)}
      </Text>
    </Group>
  );
}

export function AssigneeAvatars({ task, users }: { task: Task; users: AppUser[] }) {
  const people = task.assignees?.length ? task.assignees : [{ id: 0, display_name: task.assignee }];
  return (
    <Tooltip label={people.map((p) => p.display_name).join(', ')} withArrow>
      <Avatar.Group spacing="sm">
        {people.slice(0, 3).map((p) => (
          <UserAvatar key={p.id || p.display_name} name={p.display_name} icon={users.find((u) => u.id === p.id)?.avatar_icon} size={28} />
        ))}
        {people.length > 3 && (
          <Avatar size={28} radius="xl">
            +{people.length - 3}
          </Avatar>
        )}
      </Avatar.Group>
    </Tooltip>
  );
}
