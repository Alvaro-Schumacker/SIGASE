import { Accordion, ActionIcon, Badge, Button, Card, Group, Skeleton, Stack, Tabs, Text, TextInput, ThemeIcon, Tooltip } from '@mantine/core';
import { useDisclosure } from '@mantine/hooks';
import { IconCalendarMonth, IconEdit, IconList, IconPlus, IconSearch, IconTrash } from '@tabler/icons-react';
import { useQueryClient } from '@tanstack/react-query';
import dayjs from 'dayjs';
import { useState } from 'react';
import { useCurrentUser } from '../api';
import { EmptyState } from '../components/EmptyState';
import { PageHeader } from '../components/PageHeader';
import { VacationCalendar } from '../components/VacationCalendar';
import { VacationFormModal } from '../components/VacationFormModal';
import { useUnitPersonnel } from '../data/unit';
import { suggestedReferenceYear, useVacationPlan } from '../data/vacation';
import { confirmDelete } from '../lib/confirm';
import { fmtDate, todayISO } from '../lib/format';
import type { VacationPeriod } from '../types';

const GROUPS: { key: string; label: string; color: string; empty: string; match: (p: VacationPeriod, today: string) => boolean }[] = [
  { key: 'current', label: 'Atuais', color: 'sigase', empty: 'Militares em férias ou em deslocamento aparecerão aqui.', match: (p, t) => p.start_date <= t && p.presentation_date > t },
  { key: 'future', label: 'Futuros', color: 'blue', empty: 'Próximos períodos de férias aparecerão aqui.', match: (p, t) => p.start_date > t },
  { key: 'previous', label: 'Anteriores', color: 'gray', empty: 'Períodos cujo retorno já ocorreu aparecerão aqui.', match: (p, t) => p.presentation_date <= t },
];

export function VacationPage() {
  const me = useCurrentUser();
  const qc = useQueryClient();
  const { data: periods = [], isLoading } = useVacationPlan();
  const { data: roster = [] } = useUnitPersonnel();
  const [search, setSearch] = useState('');
  const [editing, setEditing] = useState<VacationPeriod | null>(null);
  const [formOpen, form] = useDisclosure();
  const today = todayISO();
  const currentYear = dayjs().year();

  const filtered = periods.filter((p) => `${p.full_name} ${p.rank}`.toLocaleLowerCase('pt-BR').includes(search.toLocaleLowerCase('pt-BR')));
  const yearOf = (p: VacationPeriod) => Number(p.reference_year || suggestedReferenceYear(p.start_date));
  const openYears = [2025, 2026].filter((y) => y === currentYear || filtered.some((p) => yearOf(p) === y && p.start_date <= today && p.presentation_date > today)).map(String);

  const openForm = (p: VacationPeriod | null) => {
    setEditing(p);
    form.open();
  };
  const remove = (p: VacationPeriod) => confirmDelete({ label: 'período de férias', path: `/api/vacation-plan/${p.id}`, qc, invalidate: [['vacation-plan'], ['notices']] });

  const card = (p: VacationPeriod) => (
    <Card key={p.id} padding="sm" radius="md" className="lift-card">
      <Group wrap="nowrap" gap="md">
        <Stack gap={0} align="center" justify="center" w={54} h={54} style={{ borderRadius: 12, background: 'var(--mantine-color-sigase-light)', flexShrink: 0 }}>
          <Text fw={800} fz={20} lh={1} c="sigase">
            {dayjs(p.start_date).date()}
          </Text>
          <Text size="xs" fw={700} c="sigase" tt="uppercase">
            {dayjs(p.start_date).format('MMM').replace('.', '')}
          </Text>
        </Stack>
        <Stack gap={2} style={{ flex: 1, minWidth: 0 }}>
          <Text fw={700} size="sm" truncate>
            {p.rank} {p.full_name}
          </Text>
          <Text size="xs" c="dimmed">
            Período {p.period_number}/{p.period_total} · {p.vacation_days} dias · {fmtDate(p.start_date)} a {fmtDate(p.end_date)}
          </Text>
          <Group gap={6}>
            <Badge size="xs" variant="light" color="grape">
              Apresentação {fmtDate(p.presentation_date)}
            </Badge>
            {!!p.travel_days && (
              <Badge size="xs" variant="outline" color="gray">
                + 2 dias de deslocamento
              </Badge>
            )}
          </Group>
        </Stack>
        {me.canEditVacation && (
          <Group gap={2} wrap="nowrap">
            <Tooltip label="Editar">
              <ActionIcon variant="subtle" aria-label="Editar" onClick={() => openForm(p)}>
                <IconEdit size={18} />
              </ActionIcon>
            </Tooltip>
            <Tooltip label="Excluir">
              <ActionIcon variant="subtle" color="red" aria-label="Excluir" onClick={() => remove(p)}>
                <IconTrash size={18} />
              </ActionIcon>
            </Tooltip>
          </Group>
        )}
      </Group>
    </Card>
  );

  return (
    <>
      <PageHeader
        title="Plano de férias"
        subtitle={`${filtered.length} ${filtered.length === 1 ? 'período cadastrado' : 'períodos cadastrados'} · avisos de início e apresentação são criados automaticamente`}
        actions={
          me.canEditVacation && (
            <Button leftSection={<IconPlus size={18} />} onClick={() => openForm(null)}>
              Incluir período
            </Button>
          )
        }
      />

      <Tabs defaultValue="lista" variant="pills" radius="md" keepMounted={false}>
        <Group justify="space-between" mb="md" gap="sm">
          <Tabs.List>
            <Tabs.Tab value="lista" leftSection={<IconList size={16} />}>
              Períodos
            </Tabs.Tab>
            <Tabs.Tab value="calendario" leftSection={<IconCalendarMonth size={16} />}>
              Calendário
            </Tabs.Tab>
          </Tabs.List>
          <TextInput placeholder="Buscar por nome ou posto…" leftSection={<IconSearch size={16} />} value={search} onChange={(e) => setSearch(e.currentTarget.value)} w={{ base: '100%', xs: 280 }} />
        </Group>

        <Tabs.Panel value="lista" className="page-enter">
          {isLoading ? (
            <Skeleton h={200} radius="lg" />
          ) : (
            <Accordion multiple defaultValue={openYears} variant="separated" radius="lg">
              {[2025, 2026].map((year) => {
                const items = filtered.filter((p) => yearOf(p) === year);
                return (
                  <Accordion.Item key={year} value={String(year)}>
                    <Accordion.Control>
                      <Group gap="sm">
                        <ThemeIcon variant="light" radius="md" size="lg">
                          <IconCalendarMonth size={20} />
                        </ThemeIcon>
                        <div>
                          <Text fw={800}>REF {year}</Text>
                          <Text size="xs" c="dimmed">
                            {items.length} {items.length === 1 ? 'período' : 'períodos'}
                          </Text>
                        </div>
                      </Group>
                    </Accordion.Control>
                    <Accordion.Panel>
                      <Stack gap="lg">
                        {GROUPS.map((g) => {
                          const group = items.filter((p) => g.match(p, today)).sort((a, b) => a.start_date.localeCompare(b.start_date) || a.full_name.localeCompare(b.full_name, 'pt-BR'));
                          return (
                            <div key={g.key}>
                              <Group gap="xs" mb="xs">
                                <Text fw={700} size="sm">
                                  {g.label}
                                </Text>
                                <Badge size="sm" color={g.color} variant="light">
                                  {group.length}
                                </Badge>
                              </Group>
                              {group.length ? (
                                <Stack gap="xs" className="stagger">
                                  {group.map(card)}
                                </Stack>
                              ) : (
                                <Text size="sm" c="dimmed" pl="xs">
                                  {g.empty}
                                </Text>
                              )}
                            </div>
                          );
                        })}
                      </Stack>
                    </Accordion.Panel>
                  </Accordion.Item>
                );
              })}
            </Accordion>
          )}
          {!isLoading && !periods.length && <EmptyState title="Nenhum período cadastrado" description="Inclua o primeiro período de férias do efetivo." />}
        </Tabs.Panel>

        <Tabs.Panel value="calendario" className="page-enter">
          <VacationCalendar periods={filtered} roster={roster} />
        </Tabs.Panel>
      </Tabs>

      <VacationFormModal opened={formOpen} onClose={form.close} period={editing} />
    </>
  );
}
