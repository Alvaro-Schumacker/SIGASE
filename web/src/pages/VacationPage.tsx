import { Accordion, ActionIcon, Alert, Badge, Button, Card, Group, Progress, SimpleGrid, Skeleton, Stack, Tabs, Text, TextInput, ThemeIcon, Tooltip } from '@mantine/core';
import { useDisclosure } from '@mantine/hooks';
import { IconAlertTriangle, IconCalendarMonth, IconChartBar, IconEdit, IconFileSpreadsheet, IconList, IconPlus, IconSearch, IconTrash } from '@tabler/icons-react';
import { useQueryClient } from '@tanstack/react-query';
import dayjs from 'dayjs';
import { useMemo, useState } from 'react';
import { useCurrentUser } from '../api';
import { EmptyState } from '../components/EmptyState';
import { PageHeader } from '../components/PageHeader';
import { VacationFormModal } from '../components/VacationFormModal';
import { VacationImportModal } from '../components/VacationImportModal';
import { VacationTimeline } from '../components/VacationTimeline';
import { sortUnit, useUnitPersonnel } from '../data/unit';
import { isDiscount, ordinal, summarize, useVacationPlan } from '../data/vacation';
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
  const [importOpen, importer] = useDisclosure();
  const today = todayISO();

  const term = search.toLocaleLowerCase('pt-BR');
  const filtered = periods.filter((p) => `${p.full_name} ${p.rank}`.toLocaleLowerCase('pt-BR').includes(term));
  const refs = [...new Set(periods.map((p) => Number(p.reference_year)))].sort((a, b) => b - a);
  const openRefs = refs.filter((y) => filtered.some((p) => Number(p.reference_year) === y && p.presentation_date > today)).map(String);

  const openForm = (p: VacationPeriod | null) => {
    if (p && !me.canEditVacation) return;
    setEditing(p);
    form.open();
  };
  const remove = (p: VacationPeriod) => confirmDelete({ label: isDiscount(p) ? 'desconto em férias' : 'período de férias', path: `/api/vacation-plan/${p.id}`, qc, invalidate: [['vacation-plan'], ['notices']] });

  const card = (p: VacationPeriod) => {
    const discount = isDiscount(p);
    return (
      <Card key={p.id} padding="sm" radius="md" className="lift-card">
        <Group wrap="nowrap" gap="md">
          <Stack gap={0} align="center" justify="center" w={54} h={54} style={{ borderRadius: 12, background: discount ? 'var(--mantine-color-brass-light)' : 'var(--mantine-color-sigase-light)', flexShrink: 0 }}>
            <Text fw={800} fz={20} lh={1} c={discount ? 'brass.8' : 'sigase'}>
              {dayjs(p.start_date).date()}
            </Text>
            <Text size="xs" fw={700} c={discount ? 'brass.8' : 'sigase'} tt="uppercase">
              {dayjs(p.start_date).format('MMM').replace('.', '')}
            </Text>
          </Stack>
          <Stack gap={2} style={{ flex: 1, minWidth: 0 }}>
            <Text fw={700} size="sm" truncate>
              {p.rank} {p.full_name}
            </Text>
            <Text size="xs" c="dimmed">
              {discount ? 'Desconto em férias' : `${ordinal(p.period_number)} parcela de ${p.period_total}${p.split_plan ? ` (${p.split_plan})` : ''}`} · {p.vacation_days} dias · {fmtDate(p.start_date)} a {fmtDate(p.end_date)}
            </Text>
            <Group gap={6}>
              <Badge size="xs" variant="outline" color="gray">
                REF {p.reference_year}
              </Badge>
              <Badge size="xs" variant="light" color="sigase">
                Apresentação {fmtDate(p.presentation_date)}
              </Badge>
              {!!p.travel_days && (
                <Badge size="xs" variant="light" color="gray">
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
  };

  return (
    <>
      <PageHeader
        title="Plano de férias"
        subtitle="Parcelas, descontos e deslocamento por referência · avisos de início e apresentação são criados automaticamente"
        actions={
          me.canEditVacation && (
            <Group gap="xs">
              <Button variant="default" leftSection={<IconFileSpreadsheet size={18} />} onClick={importer.open}>
                Importar planilha
              </Button>
              <Button leftSection={<IconPlus size={18} />} onClick={() => openForm(null)}>
                Novo lançamento
              </Button>
            </Group>
          )
        }
      />

      <Tabs defaultValue="calendario" variant="pills" radius="md" keepMounted={false}>
        <Group justify="space-between" mb="md" gap="sm">
          <Tabs.List>
            <Tabs.Tab value="calendario" leftSection={<IconCalendarMonth size={16} />}>
              Calendário
            </Tabs.Tab>
            <Tabs.Tab value="lista" leftSection={<IconList size={16} />}>
              Lançamentos
            </Tabs.Tab>
            <Tabs.Tab value="saldo" leftSection={<IconChartBar size={16} />}>
              Saldo por militar
            </Tabs.Tab>
          </Tabs.List>
          <TextInput placeholder="Buscar por nome ou posto…" leftSection={<IconSearch size={16} />} value={search} onChange={(e) => setSearch(e.currentTarget.value)} w={{ base: '100%', xs: 280 }} />
        </Group>

        <Tabs.Panel value="calendario" className="page-enter">
          {isLoading ? <Skeleton h={320} radius="lg" /> : <VacationTimeline periods={filtered} roster={roster} onOpen={me.canEditVacation ? openForm : undefined} />}
        </Tabs.Panel>

        <Tabs.Panel value="lista" className="page-enter">
          {isLoading && <Skeleton h={200} radius="lg" />}
          {!isLoading && !periods.length && <EmptyState title="Nenhum lançamento" description="Inclua o primeiro período de férias do efetivo." />}
          <Accordion multiple defaultValue={openRefs} variant="separated" radius="lg">
            {refs.map((year) => {
              const items = filtered.filter((p) => Number(p.reference_year) === year);
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
                          {items.length} {items.length === 1 ? 'lançamento' : 'lançamentos'}
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
        </Tabs.Panel>

        <Tabs.Panel value="saldo" className="page-enter">
          <BalanceView periods={filtered} roster={roster} refs={refs} />
        </Tabs.Panel>
      </Tabs>

      <VacationFormModal opened={formOpen} onClose={form.close} period={editing} />
      {me.canEditVacation && <VacationImportModal opened={importOpen} onClose={importer.close} />}
    </>
  );
}

/** Saldo de cada militar por referência: parcelas lançadas/a lançar, descontos e alertas. */
function BalanceView({ periods, roster, refs }: { periods: VacationPeriod[]; roster: ReturnType<typeof useUnitPersonnel>['data'] & object; refs: number[] }) {
  const [ref, setRef] = useState(String(refs[0] ?? dayjs().year()));
  const people = useMemo(() => {
    const ids = [...new Set(periods.filter((p) => String(p.reference_year) === ref).map((p) => p.person_id))];
    return sortUnit(ids.map((id) => roster.find((r) => r.id === id) ?? { id, rank: periods.find((p) => p.person_id === id)!.rank, war_name: periods.find((p) => p.person_id === id)!.full_name, full_name: '', seniority_order: null }));
  }, [periods, roster, ref]);

  if (!refs.length) return <EmptyState title="Nenhum lançamento" description="O saldo aparece depois do primeiro período lançado." />;
  return (
    <Stack>
      <Group gap="xs">
        {refs.map((r) => (
          <Button key={r} size="xs" variant={String(r) === ref ? 'filled' : 'default'} onClick={() => setRef(String(r))}>
            REF {r}
          </Button>
        ))}
      </Group>
      <SimpleGrid cols={{ base: 1, md: 2, xl: 3 }} className="stagger">
        {people.map((person) => {
          const s = summarize(periods, person.id, Number(ref));
          return (
            <Card key={person.id} padding="md">
              <Group justify="space-between" mb={6} wrap="nowrap">
                <div style={{ minWidth: 0 }}>
                  <Text size="xs" c="dimmed">
                    {person.rank}
                  </Text>
                  <Text fw={700} truncate>
                    {person.war_name}
                  </Text>
                </div>
                <Badge variant="light" color={s.remainingDays ? 'sigase' : 'gray'} style={{ flexShrink: 0 }}>
                  {s.usedDays}/30 dias
                </Badge>
              </Group>
              <Progress.Root size={10} mb="sm">
                {s.parcels.map((pc) => (
                  <Tooltip key={pc.number} label={`${ordinal(pc.number)} parcela · ${pc.expected} dias${pc.entry ? ` · ${fmtDate(pc.entry.start_date)}` : ' · a lançar'}`}>
                    <Progress.Section value={(pc.expected / 30) * 100} color={pc.entry ? 'sigase' : 'gray.3'} />
                  </Tooltip>
                ))}
                {s.discountDays > 0 && (
                  <Tooltip label={`Desconto · ${s.discountDays} dia(s)`}>
                    <Progress.Section value={(s.discountDays / 30) * 100} color="brass.4" />
                  </Tooltip>
                )}
              </Progress.Root>
              <Stack gap={4}>
                <Text size="xs" c="dimmed">
                  Divisão: <b>{s.split?.label ?? 'não informada'}</b>
                  {s.travel ? ` · deslocamento usado (${fmtDate(s.travel.start_date)})` : ' · deslocamento disponível'}
                </Text>
                {s.parcels.map((pc) => (
                  <Text key={pc.number} size="xs">
                    {ordinal(pc.number)} parcela · {pc.expected} dias{pc.expected !== pc.planned ? ` (de ${pc.planned})` : ''} —{' '}
                    {pc.entry ? `${fmtDate(pc.entry.start_date)} a ${fmtDate(pc.entry.end_date)}` : <Text span c="dimmed">a lançar</Text>}
                  </Text>
                ))}
                {s.discounts.map((d) => (
                  <Text key={d.id} size="xs" c="brass.8">
                    Desconto · {d.vacation_days} dia(s) — {fmtDate(d.start_date)}
                  </Text>
                ))}
                {s.warnings.map((w) => (
                  <Alert key={w} color="brass" variant="light" p={6} icon={<IconAlertTriangle size={14} />}>
                    <Text size="xs">{w}</Text>
                  </Alert>
                ))}
              </Stack>
            </Card>
          );
        })}
      </SimpleGrid>
    </Stack>
  );
}
