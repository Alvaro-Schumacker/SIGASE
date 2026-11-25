import { Text } from '@mantine/core';
import { modals } from '@mantine/modals';
import { notifications } from '@mantine/notifications';
import type { QueryClient } from '@tanstack/react-query';
import { api } from '../api';

interface DeleteOptions {
  /** Nome no singular, ex.: "usuário", "período de férias". */
  label: string;
  path: string;
  qc: QueryClient;
  invalidate: string[][];
  message?: string;
  feminine?: boolean;
  onDone?: () => void;
}

/** Confirmação + exclusão + aviso, no mesmo padrão em todas as telas. */
export function confirmDelete({ label, path, qc, invalidate, message, feminine, onDone }: DeleteOptions) {
  modals.openConfirmModal({
    title: `Excluir ${label}`,
    children: <Text size="sm">{message ?? `Excluir ${feminine ? 'esta' : 'este'} ${label}? Esta ação não pode ser desfeita.`}</Text>,
    labels: { confirm: 'Excluir', cancel: 'Cancelar' },
    confirmProps: { color: 'red' },
    onConfirm: async () => {
      try {
        await api(path, { method: 'DELETE' });
        await Promise.all(invalidate.map((queryKey) => qc.invalidateQueries({ queryKey })));
        notifications.show({ color: 'sigase', message: `${label.charAt(0).toUpperCase() + label.slice(1)} ${feminine ? 'excluída' : 'excluído'}.` });
        onDone?.();
      } catch (error) {
        notifications.show({ color: 'red', title: `Não foi possível excluir`, message: (error as Error).message });
      }
    },
  });
}

export const notifyError = (error: unknown, title = 'Não foi possível salvar') =>
  notifications.show({ color: 'red', title, message: (error as Error).message });

export const notifyOk = (message: string) => notifications.show({ color: 'sigase', message });
