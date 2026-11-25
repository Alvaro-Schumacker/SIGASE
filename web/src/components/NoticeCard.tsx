import { Badge, Button, Card, Collapse, Group, Stack, Text, UnstyledButton } from '@mantine/core';
import { useDisclosure } from '@mantine/hooks';
import { modals } from '@mantine/modals';
import { notifications } from '@mantine/notifications';
import { IconCheck, IconChevronDown, IconClipboardPlus } from '@tabler/icons-react';
import dayjs from 'dayjs';
import { noticeUrgency, useAckNotice } from '../data/notices';
import { fmtDate } from '../lib/format';
import type { Notice } from '../types';

interface Props {
  notice: Notice;
  compact?: boolean;
  onCreateTask?: (notice: Notice) => void;
}

export function NoticeCard({ notice, compact, onCreateTask }: Props) {
  const ack = useAckNotice();
  const [recipientsOpen, recipients] = useDisclosure(false);
  const urgency = noticeUrgency(notice);

  const confirmAck = () => {
    const future = notice.notice_date > dayjs().format('YYYY-MM-DD');
    modals.openConfirmModal({
      title: 'Registrar ciência',
      children: (
        <Text size="sm">
          {future
            ? `Este aviso está previsto para ${fmtDate(notice.notice_date)}. Ao dar o ciente agora, ele sai da Página Inicial e não aparece novamente.`
            : 'Confirma que está ciente deste aviso?'}
        </Text>
      ),
      labels: { confirm: 'Ciente', cancel: 'Cancelar' },
      onConfirm: () =>
        ack.mutate(notice.id, {
          onSuccess: () => notifications.show({ color: 'sigase', message: 'Ciente registrado.' }),
          onError: (e) => notifications.show({ color: 'red', message: e.message }),
        }),
    });
  };

  return (
    <Card padding={compact ? 'sm' : 'md'} radius="md" className="lift-card">
      <Group justify="space-between" align="flex-start" wrap="nowrap" gap="sm">
        <Stack gap={4} style={{ minWidth: 0, flex: 1 }}>
          <Group gap={6} wrap="wrap">
            <Text fw={700} size="sm">
              {notice.title}
            </Text>
            {compact && (
              <Badge size="xs" color={urgency.color} variant="light">
                {urgency.label}
              </Badge>
            )}
            {!compact &&
              (notice.all_acknowledged ? (
                <Badge size="xs" color="sigase">
                  Todos cientes
                </Badge>
              ) : (
                <Badge size="xs" color="brass">
                  Aguardando ciência · {notice.acknowledged_count}/{notice.recipient_count}
                </Badge>
              ))}
          </Group>
          {notice.subject && (
            <Text size="sm" c="dimmed" lineClamp={compact ? 2 : undefined} style={{ whiteSpace: compact ? undefined : 'pre-wrap' }}>
              {notice.subject}
            </Text>
          )}
          <Group gap="md">
            <Text size="xs" c="dimmed">
              Data: {fmtDate(notice.notice_date)}
            </Text>
            <Text size="xs" c="dimmed">
              Enviado por {notice.created_by}
            </Text>
          </Group>
          {!compact && notice.can_manage && notice.recipients?.length > 0 && (
            <>
              <UnstyledButton onClick={recipients.toggle} w="fit-content">
                <Group gap={4}>
                  <Text size="xs" fw={600} c="sigase">
                    Ver destinatários ({notice.recipient_count})
                  </Text>
                  <IconChevronDown size={14} style={{ transform: recipientsOpen ? 'rotate(180deg)' : undefined, transition: 'transform 150ms' }} />
                </Group>
              </UnstyledButton>
              <Collapse expanded={recipientsOpen}>
                <Group gap={6} mt={4}>
                  {notice.recipients.map((r) => (
                    <Badge key={r.id} variant={r.acknowledged_at ? 'light' : 'outline'} color={r.acknowledged_at ? 'sigase' : 'gray'} size="sm" tt="none">
                      {r.display_name} · {r.acknowledged_at ? 'Ciente' : 'Pendente'}
                    </Badge>
                  ))}
                </Group>
              </Collapse>
            </>
          )}
        </Stack>
        <Stack gap={6} align="flex-end" style={{ flexShrink: 0 }}>
          {notice.is_recipient &&
            (notice.acknowledged ? (
              <Badge color="sigase" variant="light" leftSection={<IconCheck size={12} />}>
                Ciente
              </Badge>
            ) : (
              <Button size="xs" onClick={confirmAck} loading={ack.isPending}>
                Ciente
              </Button>
            ))}
          {onCreateTask && (
            <Button size="xs" variant="default" leftSection={<IconClipboardPlus size={14} />} onClick={() => onCreateTask(notice)}>
              Tarefa
            </Button>
          )}
        </Stack>
      </Group>
    </Card>
  );
}
