import { Button, Checkbox, Group, Modal, ScrollArea, SimpleGrid, Stack, Switch, Text, TextInput, Textarea } from '@mantine/core';
import { DateInput } from '@mantine/dates';
import { useForm } from '@mantine/form';
import { notifications } from '@mantine/notifications';
import { IconCalendar, IconSend } from '@tabler/icons-react';
import dayjs from 'dayjs';
import { useUsers } from '../api';
import { useCreateNotice } from '../data/notices';
import { ROLE_LABEL } from '../lib/format';

interface Props {
  opened: boolean;
  onClose: () => void;
}

export function NewNoticeModal({ opened, onClose }: Props) {
  const { data: users = [] } = useUsers();
  const create = useCreateNotice();
  const form = useForm({
    initialValues: { title: '', subject: '', notice_date: dayjs().format('YYYY-MM-DD') as string | null, all_users: false, recipient_ids: [] as string[] },
    validate: {
      title: (v) => (v.trim() ? null : 'Informe o título'),
      subject: (v) => (v.trim() ? null : 'Informe o assunto'),
      notice_date: (v) => (v ? null : 'Informe a data'),
      recipient_ids: (v, values) => (values.all_users || v.length ? null : 'Selecione destinatários ou marque “Avisar todos”'),
    },
  });
  const close = () => {
    form.reset();
    onClose();
  };

  return (
    <Modal
      opened={opened}
      onClose={close}
      size="lg"
      title={
        <div>
          <Text fw={800} size="lg">
            Novo aviso
          </Text>
          <Text size="sm" c="dimmed">
            Escolha quem receberá este lembrete.
          </Text>
        </div>
      }
    >
      <form
        onSubmit={form.onSubmit((v) =>
          create.mutate(
            { title: v.title.trim(), subject: v.subject.trim(), notice_date: dayjs(v.notice_date).format('YYYY-MM-DD'), all_users: v.all_users, recipient_ids: v.recipient_ids.map(Number) },
            {
              onSuccess: () => {
                notifications.show({ color: 'sigase', message: 'Aviso enviado.' });
                close();
              },
              onError: (e) => notifications.show({ color: 'red', title: 'Não foi possível enviar', message: e.message }),
            },
          ),
        )}
      >
        <Stack gap="md">
          <TextInput label="Título" withAsterisk maxLength={120} placeholder="Ex.: Consulta do Fulano" {...form.getInputProps('title')} />
          <Textarea label="Assunto" withAsterisk autosize minRows={3} maxLength={2000} placeholder="Inclua os detalhes do aviso" {...form.getInputProps('subject')} />
          <DateInput
            label="Data do aviso"
            withAsterisk
            valueFormat="DD/MM/YYYY"
            leftSection={<IconCalendar size={16} />}
            description="Aparece na Página Inicial a partir de dois dias antes da data."
            {...form.getInputProps('notice_date')}
          />
          <Stack gap="xs">
            <Group justify="space-between">
              <Text size="sm" fw={600}>
                Destinatários <Text span c="red">*</Text>
              </Text>
              <Switch label="Avisar todos" {...form.getInputProps('all_users', { type: 'checkbox' })} />
            </Group>
            <ScrollArea.Autosize mah={220} type="auto" style={{ opacity: form.values.all_users ? 0.45 : 1, transition: 'opacity 150ms' }}>
              <Checkbox.Group {...form.getInputProps('recipient_ids')}>
                <SimpleGrid cols={{ base: 1, sm: 2 }} spacing={6}>
                  {users.map((u) => (
                    <Checkbox.Card key={u.id} value={String(u.id)} disabled={form.values.all_users} radius="md" p="xs">
                      <Group wrap="nowrap" gap="xs">
                        <Checkbox.Indicator />
                        <div>
                          <Text size="sm" fw={600}>
                            {u.display_name}
                          </Text>
                          <Text size="xs" c="dimmed">
                            {ROLE_LABEL[u.role]}
                          </Text>
                        </div>
                      </Group>
                    </Checkbox.Card>
                  ))}
                </SimpleGrid>
              </Checkbox.Group>
            </ScrollArea.Autosize>
            {form.errors.recipient_ids && (
              <Text size="xs" c="red">
                {form.errors.recipient_ids}
              </Text>
            )}
          </Stack>
          <Group justify="flex-end" mt="sm">
            <Button variant="default" onClick={close}>
              Cancelar
            </Button>
            <Button type="submit" loading={create.isPending} leftSection={<IconSend size={16} />}>
              Enviar aviso
            </Button>
          </Group>
        </Stack>
      </form>
    </Modal>
  );
}
