import { ActionIcon, Button, Card, Grid, Group, Skeleton, Stack, Text, ThemeIcon, Tooltip, UnstyledButton } from '@mantine/core';
import { useDisclosure } from '@mantine/hooks';
import { IconCalendarStats, IconChevronRight, IconPlus, IconTrash } from '@tabler/icons-react';
import { useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { useCurrentUser } from '../api';
import { EmptyState } from '../components/EmptyState';
import { PageHeader } from '../components/PageHeader';
import { ScaleBoard } from '../components/scales/ScaleBoard';
import { ScaleFormModal } from '../components/scales/ScaleFormModal';
import { type DutyScale, MODE_LABEL, useScales } from '../data/scales';
import { confirmDelete } from '../lib/confirm';

export function ScalesPage() {
  const me = useCurrentUser();
  const qc = useQueryClient();
  const { data: scales = [], isLoading } = useScales();
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [editing, setEditing] = useState<DutyScale | null>(null);
  const [formOpen, form] = useDisclosure();

  useEffect(() => {
    if (selectedId == null && scales.length) setSelectedId(scales[0].id);
  }, [scales, selectedId]);
  const selected = scales.find((s) => s.id === selectedId) ?? null;

  const openForm = (s: DutyScale | null) => {
    setEditing(s);
    form.open();
  };
  const remove = (s: DutyScale) =>
    confirmDelete({ label: 'escala de serviço', feminine: true, path: `/api/service-scales/${s.id}`, qc, invalidate: [['service-scales']], onDone: () => selectedId === s.id && setSelectedId(null) });

  return (
    <>
      <PageHeader
        title="Escalas de serviço"
        subtitle="Escalas mensais com ordem dos participantes, contagem de folgas e próximos serviços"
        actions={
          me.canEditScales && (
            <Button leftSection={<IconPlus size={18} />} onClick={() => openForm(null)}>
              Nova escala
            </Button>
          )
        }
      />

      <Grid gap="lg">
        <Grid.Col span={{ base: 12, lg: 3 }}>
          <Stack gap="xs" className="stagger">
            {isLoading && Array.from({ length: 3 }, (_, i) => <Skeleton key={i} h={72} radius="lg" />)}
            {!isLoading && !scales.length && (
              <Card>
                <EmptyState title="Nenhuma escala criada" description="Crie uma escala para começar." icon={<IconCalendarStats size={26} />} py={20} />
              </Card>
            )}
            {scales.map((s) => {
              const active = s.id === selectedId;
              return (
                <Card
                  key={s.id}
                  padding="sm"
                  className="lift-card"
                  style={{ borderColor: active ? 'var(--mantine-color-sigase-6)' : undefined, background: active ? 'var(--mantine-color-sigase-light)' : undefined }}
                >
                  <Group wrap="nowrap" gap="sm">
                    <UnstyledButton style={{ flex: 1, minWidth: 0 }} onClick={() => setSelectedId(s.id)}>
                      <Group wrap="nowrap" gap="sm">
                        <ThemeIcon variant={active ? 'filled' : 'light'} radius="md" size="lg">
                          <IconCalendarStats size={20} />
                        </ThemeIcon>
                        <div style={{ minWidth: 0 }}>
                          <Text fw={700} size="sm" truncate>
                            {s.name}
                          </Text>
                          <Text size="xs" c="dimmed" truncate>
                            {MODE_LABEL[s.mode]} · {s.participants.length} militares
                          </Text>
                        </div>
                      </Group>
                    </UnstyledButton>
                    {me.canEditScales ? (
                      <Tooltip label="Excluir">
                        <ActionIcon variant="subtle" color="red" aria-label="Excluir escala" onClick={() => remove(s)}>
                          <IconTrash size={16} />
                        </ActionIcon>
                      </Tooltip>
                    ) : (
                      <IconChevronRight size={16} color="var(--mantine-color-dimmed)" />
                    )}
                  </Group>
                </Card>
              );
            })}
          </Stack>
        </Grid.Col>
        <Grid.Col span={{ base: 12, lg: 9 }}>
          {selected ? (
            <div key={selected.id} className="page-enter">
              <ScaleBoard scale={selected} canEdit={me.canEditScales} onEdit={() => openForm(selected)} />
            </div>
          ) : (
            !isLoading && (
              <Card>
                <EmptyState title="Selecione uma escala" description="Escolha uma escala na lista para ver o quadro do mês." />
              </Card>
            )
          )}
        </Grid.Col>
      </Grid>

      <ScaleFormModal opened={formOpen} onClose={form.close} scale={editing} onSaved={(s) => setSelectedId(s.id)} />
    </>
  );
}
