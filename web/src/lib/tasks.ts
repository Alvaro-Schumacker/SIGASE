import dayjs from 'dayjs';
import type { Me, Task } from '../types';

// Mesmas regras da versão atual (app.js), para os números baterem entre as duas.

export const isOverdue = (task: Task) =>
  task.status !== 'Concluída' && dayjs(task.due).isBefore(dayjs().startOf('day'));

export const isAssignedTo = (task: Task, me: Me) =>
  (task.assignee_ids ?? []).includes(me.id) || task.assignee === me.user;

/** Esconde de cada responsável as tarefas que outro responsável já concluiu. */
export const visibleTasks = (tasks: Task[], me: Me) =>
  tasks.filter(
    (t) =>
      me.canManageUsers ||
      t.status !== 'Concluída' ||
      !(t.assignee_ids ?? []).includes(me.id) ||
      t.completed_by === me.user ||
      t.requester === me.user,
  );

export const TASK_TABS = ['Recebidas', 'Enviadas', 'Em andamento', 'Atrasadas', 'Concluídas'] as const;
export type TaskTab = (typeof TASK_TABS)[number];

export function tasksForTab(tasks: Task[], tab: TaskTab, me: Me) {
  return tasks.filter((t) => {
    switch (tab) {
      case 'Recebidas':
        return isAssignedTo(t, me) && t.status !== 'Concluída';
      case 'Enviadas':
        return t.requester === me.user;
      case 'Em andamento':
        return t.status === 'Em andamento';
      case 'Atrasadas':
        return isOverdue(t);
      case 'Concluídas':
        return t.status === 'Concluída';
    }
  });
}

export const priorityColor = { Alta: 'red', Média: 'brass', Baixa: 'gray' } as const;

export function statusInfo(task: Task): { label: string; color: string } {
  if (isOverdue(task)) return { label: 'Atrasada', color: 'red' };
  if (task.status === 'Concluída') return { label: 'Concluída', color: 'sigase' };
  if (task.status === 'Em andamento') return { label: 'Em andamento', color: 'blue' };
  return { label: 'Pendente', color: 'gray' };
}

export function dueLabel(task: Task) {
  const days = dayjs(task.due).startOf('day').diff(dayjs().startOf('day'), 'day');
  if (task.status === 'Concluída') return dayjs(task.due).format('DD/MM/YYYY');
  if (days < 0) return `Venceu há ${-days} dia${days === -1 ? '' : 's'}`;
  if (days === 0) return 'Vence hoje';
  if (days === 1) return 'Vence amanhã';
  if (days <= 7) return `Vence em ${days} dias`;
  return dayjs(task.due).format('DD/MM/YYYY');
}

export const initials = (name: string) =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join('') || '?';

export const profileIconSrc = (icon?: string) => (icon ? `/assets/icons/profiles/${icon}` : undefined);
