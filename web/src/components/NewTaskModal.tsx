import { Button, Group, Modal, MultiSelect, SegmentedControl, Select, Stack, Text, TextInput, Textarea } from '@mantine/core';
import { DateInput } from '@mantine/dates';
import { useForm } from '@mantine/form';
import { notifications } from '@mantine/notifications';
import { IconCalendar, IconSend } from '@tabler/icons-react';
import dayjs from 'dayjs';
import { useEffect } from 'react';
import { useCreateTask, useTaskCategories, useUsers } from '../api';
import type { TaskPriority } from '../types';

interface Props {
  opened: boolean;
  onClose: () => void;
  /** Valores iniciais (ex.: tarefa criada a partir de um aviso). */
  initial?: { title?: string; description?: string };
}

export function NewTaskModal({ opened, onClose, initial }: Props) {
  const { data: users = [] } = useUsers();
  const { data: categories = [] } = useTaskCategories();
  const create = useCreateTask();
  const form = useForm({
    initialValues: {
      title: '',
      description: '',
      classification: null as string | null,
      assignee_ids: [] as string[],
      priority: 'Média' as TaskPriority,
      due: dayjs().add(3, 'day').format('YYYY-MM-DD') as string | null,
    },
    validate: {
      title: (v) => (!v.trim() ? 'Informe um título' : v.trim().length > 120 ? 'Até 120 caracteres' : null),
      description: (v) => (v.length > 2000 ? 'Até 2.000 caracteres' : null),
      assignee_ids: (v) => (v.length ? null : 'Selecione ao menos um responsável'),
      due: (v) => (v ? null : 'Informe o prazo'),
    },
  });

  useEffect(() => {
    if (opened && initial) form.setValues({ title: initial.title ?? '', description: initial.description ?? '' });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [opened]);

  const close = () => {
    form.reset();
    onClose();
  };

  return (
    <Modal opened={opened} onClose={close} size="lg" title={
        <div>
          <Text fw={800} size="lg">
            Nova tarefa
          </Text>
          <Text size="sm" c="dimmed">
            Encaminhe uma demanda para a equipe.
          </Text>
        </div>
      }
    >
      <form
        onSubmit={form.onSubmit((v) =>
          create.mutate(
            {
              title: v.title.trim(),
              description: v.description.trim(),
              classification: v.classification ?? '',
              assignee_ids: v.assignee_ids.map(Number),
              priority: v.priority,
              due: dayjs(v.due).format('YYYY-MM-DD'),
            },
            {
              onSuccess: () => {
                notifications.show({ color: 'sigase', title: 'Tarefa enviada', message: v.title.trim() });
                close();
              },
              onError: (e) => notifications.show({ color: 'red', title: 'Não foi possível criar', message: e.message }),
            },
          ),
        )}
      >
        <Stack gap="md">
          <TextInput label="Título" placeholder="Ex.: Conferir aditamento de férias" withAsterisk maxLength={120} {...form.getInputProps('title')} />
          <Textarea label="Descrição" placeholder="Detalhes, documentos envolvidos, observações…" autosize minRows={3} maxRows={8} {...form.getInputProps('description')} />
          <Group grow align="flex-start">
            <Select
              label="Classificação"
              placeholder="Opcional"
              clearable
              data={categories.map((c) => c.name)}
              {...form.getInputProps('classification')}
            />
            <DateInput
              label="Prazo"
              withAsterisk
              valueFormat="DD/MM/YYYY"
              minDate={dayjs().format('YYYY-MM-DD')}
              leftSection={<IconCalendar size={16} />}
              {...form.getInputProps('due')}
            />
          </Group>
          <MultiSelect
            label="Responsáveis"
            placeholder="Selecione um ou mais"
            withAsterisk
            searchable
            data={users.map((u) => ({ value: String(u.id), label: u.display_name }))}
            {...form.getInputProps('assignee_ids')}
          />
          <Stack gap={4}>
            <Text size="sm" fw={500}>
              Prioridade
            </Text>
            <SegmentedControl
              fullWidth
              data={['Baixa', 'Média', 'Alta']}
              color={form.values.priority === 'Alta' ? 'red' : form.values.priority === 'Média' ? 'brass' : 'gray'}
              {...form.getInputProps('priority')}
            />
          </Stack>
          <Group justify="flex-end" mt="sm">
            <Button variant="default" onClick={close}>
              Cancelar
            </Button>
            <Button type="submit" loading={create.isPending} leftSection={<IconSend size={16} />}>
              Enviar tarefa
            </Button>
          </Group>
        </Stack>
      </form>
    </Modal>
  );
}
