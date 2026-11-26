import { Badge, Button, Card, Grid, Group, Indicator, SegmentedControl, SimpleGrid, Skeleton, Stack, Text, ThemeIcon, Title, UnstyledButton } from '@mantine/core';
import { Calendar } from '@mantine/dates';
import { useDisclosure } from '@mantine/hooks';
import { IconAlertTriangle, IconArrowRight, IconBeach, IconCircleCheck, IconClockHour4, IconPlus, IconProgress } from '@tabler/icons-react';
import dayjs from 'dayjs';
import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useCurrentUser, useNotices, useTasks } from '../api';
import { pendingNotices } from '../data/notices';
import { useVacationPlan } from '../data/vacation';
import { capitalize, fmtDate, fmtShort, stripRank, todayISO } from '../lib/format';
import { isOverdue, visibleTasks } from '../lib/tasks';
import type { Notice, Task } from '../types';
import { DueText, PriorityBadge } from '../components/TaskBadges';
import { TaskDrawer } from '../components/TaskDrawer';
import { NewTaskModal } from '../components/NewTaskModal';
import { NoticeCard } from '../components/NoticeCard';
import { EmptyState } from '../components/EmptyState';

function greeting() {
  const hour = new Date().getHours();
  return hour >= 6 && hour < 12 ? 'Bom dia' : hour >= 12 && hour < 18 ? 'Boa tarde' : 'Boa noite';
}

type AgendaKind = 'task' | 'done' | 'notice' | 'leave' | 'presentation';
const KIND_COLOR: Record<AgendaKind, string> = { task: 'sigase', done: 'gray', notice: 'brass', leave: 'blue', presentation: 'grape' };
const KIND_LABEL: Record<AgendaKind, string> = { task: 'Tarefa', done: 'Concluída', notice: 'Aviso', leave: 'Férias', presentation: 'Apresentação' };

export function DashboardPage() {
  const me = useCurrentUser();
  const navigate = useNavigate();
  const { data: rawTasks, isLoading } = useTasks();
  const { data: notices = [] } = useNotices();
  const { data: periods = [] } = useVacationPlan();
  const [selected, setSelected] = useState<Task | null>(null);
  const [newOpen, newTask] = useDisclosure();
  const [taskFrom, setTaskFrom] = useState<Notice | null>(null);
  const [side, setSide] = useState<'avisos' | 'agenda'>('avisos');
  const [day, setDay] = useState(todayISO());

  const tasks = visibleTasks(rawTasks ?? [], me);
  const open = tasks.filter((t) => t.status !== 'Concluída');
  const stats = [
    { label: 'Pendentes', value: tasks.filter((t) => t.status === 'Pendente').length, note: 'Aguardando início', icon: IconClockHour4, color: 'gray', tab: 'Recebidas' },
    { label: 'Em andamento', value: tasks.filter((t) => t.status === 'Em andamento').length, note: 'Em execução', icon: IconProgress, color: 'blue', tab: 'Em andamento' },
    { label: 'Atrasadas', value: tasks.filter(isOverdue).length, note: 'Prazo ultrapassado', icon: IconAlertTriangle, color: 'red', tab: 'Atrasadas' },
    { label: 'Concluídas', value: tasks.filter((t) => t.status === 'Concluída').length, note: 'Finalizadas', icon: IconCircleCheck, color: 'sigase', tab: 'Concluídas' },
  ];
  const upcoming = [...open].sort((a, b) => a.due.localeCompare(b.due)).slice(0, 5);
  const myNotices = pendingNotices(notices);

  const vacationEvents = useMemo(() => {
    const today = todayISO();
    const events: { date: string; label: string; name: string }[] = [];
    for (const p of periods) {
      const name = `${p.rank || ''} ${p.full_name}`.trim();
      if (p.start_date >= today) events.push({ date: p.start_date, label: p.entry_type === 'desconto' ? 'Desconto em férias' : 'Início das férias', name });
      if (p.presentation_date >= today) events.push({ date: p.presentation_date, label: 'Apresentação', name });
    }
    return events.sort((a, b) => a.date.localeCompare(b.date) || a.name.localeCompare(b.name, 'pt-BR')).slice(0, 4);
  }, [periods]);

  // Marcadores da agenda: tarefas, avisos e férias (mesmas fontes da versão atual).
  const markers = useMemo(() => {
    const map = new Map<string, { kind: AgendaKind; title: string; detail: string }[]>();
    const add = (date: string, item: { kind: AgendaKind; title: string; detail: string }) => date && map.set(date, [...(map.get(date) ?? []), item]);
    for (const t of tasks) add(t.due.slice(0, 10), { kind: t.status === 'Concluída' ? 'done' : 'task', title: t.title, detail: `${t.assignee || 'Sem responsável'} · ${t.status}` });
    for (const n of notices.filter((x) => x.is_recipient)) add(n.notice_date, { kind: 'notice', title: n.title, detail: `${n.subject}${n.acknowledged ? ' · Ciente' : ''}` });
    for (const p of periods) {
      const name = `${p.rank || ''} ${p.full_name}`.trim();
      add(p.start_date, { kind: 'leave', title: `Início das férias · ${name}`, detail: 'Início do período de férias' });
      add(p.presentation_date, { kind: 'presentation', title: `Apresentação · ${name}`, detail: 'Retorno / apresentação na unidade' });
    }
    return map;
  }, [tasks, notices, periods]);

  const dayItems = [
    ...(markers.get(day) ?? []),
    ...periods
      .filter((p) => p.start_date < day && p.end_date >= day)
      .map((p) => ({ kind: 'leave' as AgendaKind, title: `De férias · ${`${p.rank || ''} ${p.full_name}`.trim()}`, detail: `Até ${fmtDate(p.end_date)}` })),
  ];

  return (
    <Stack gap="xl">
      <Group justify="space-between" align="flex-end">
        <div>
          <Title order={1} fz={{ base: 26, sm: 32 }}>
            {greeting()}, {stripRank(me.user) || me.user}!
          </Title>
          <Text c="dimmed">Resumo operacional · {capitalize(dayjs().format('dddd, D [de] MMMM'))}</Text>
        </div>
        {me.canEditTasks && (
          <Button leftSection={<IconPlus size={18} />} onClick={newTask.open}>
            Nova tarefa
          </Button>
        )}
      </Group>

      <SimpleGrid cols={{ base: 2, md: 4 }} spacing="md" className="stagger">
        {stats.map((s) => (
          <UnstyledButton key={s.label} onClick={() => navigate(`/tarefas?aba=${encodeURIComponent(s.tab)}`)}>
            <Card className="stat-card" h="100%">
              <Group justify="space-between" align="flex-start" wrap="nowrap">
                <Text size="sm" c="dimmed" fw={600}>
                  {s.label}
                </Text>
                <ThemeIcon variant="light" color={s.color} radius="md" size="lg">
                  <s.icon size={20} />
                </ThemeIcon>
              </Group>
              {isLoading ? (
                <Skeleton h={36} w={50} mt="xs" />
              ) : (
                <Text fz={34} fw={800} ff="heading" c={s.label === 'Atrasadas' && s.value ? 'red' : undefined} lh={1.2} mt="xs">
                  {s.value}
                </Text>
              )}
              <Text size="xs" c="dimmed">
                {s.note}
              </Text>
            </Card>
          </UnstyledButton>
        ))}
      </SimpleGrid>

      <Grid gap="lg">
        <Grid.Col span={{ base: 12, lg: 7 }}>
          <Stack gap="lg">
            <Card>
              <Group justify="space-between" mb="md">
                <div>
                  <Title order={4}>Próximas providências</Title>
                  <Text size="sm" c="dimmed">
                    Tarefas em aberto, pelo prazo mais próximo
                  </Text>
                </div>
                <Button variant="subtle" size="xs" rightSection={<IconArrowRight size={14} />} onClick={() => navigate('/tarefas')}>
                  Ver todas
                </Button>
              </Group>
              <Stack gap="xs" className="stagger">
                {isLoading && Array.from({ length: 4 }, (_, i) => <Skeleton key={i} h={56} radius="md" />)}
                {!isLoading && !upcoming.length && <EmptyState title="Tudo em dia" description="Nenhuma tarefa em aberto." py={24} />}
                {upcoming.map((t) => (
                  <UnstyledButton key={t.id} onClick={() => setSelected(t)}>
                    <Card padding="sm" radius="md" className="lift-card">
                      <Group justify="space-between" wrap="nowrap" gap="sm">
                        <Stack gap={2} style={{ minWidth: 0 }}>
                          <Text fw={600} size="sm" truncate>
                            {t.title}
                          </Text>
                          <Text size="xs" c="dimmed" truncate>
                            {t.requester} → {t.assignee}
                          </Text>
                        </Stack>
                        <Stack gap={4} align="flex-end" style={{ flexShrink: 0 }}>
                          <PriorityBadge task={t} />
                          <DueText task={t} />
                        </Stack>
                      </Group>
                    </Card>
                  </UnstyledButton>
                ))}
              </Stack>
            </Card>

            <Card>
              <Group justify="space-between" mb="md">
                <div>
                  <Title order={4}>Próximas férias</Title>
                  <Text size="sm" c="dimmed">
                    Inícios de período e apresentações
                  </Text>
                </div>
                <Button variant="subtle" size="xs" rightSection={<IconArrowRight size={14} />} onClick={() => navigate('/ferias')}>
                  Plano de férias
                </Button>
              </Group>
              {!vacationEvents.length && <EmptyState title="Nenhum período próximo" description="Os próximos períodos e apresentações aparecerão aqui." icon={<IconBeach size={24} />} py={20} />}
              <SimpleGrid cols={{ base: 1, sm: 2 }} spacing="sm" className="stagger">
                {vacationEvents.map((e) => (
                  <Group key={`${e.date}-${e.name}-${e.label}`} gap="sm" wrap="nowrap">
                    <Badge size="lg" variant="light" color={e.label === 'Apresentação' ? 'grape' : 'blue'} w={64} style={{ flexShrink: 0 }}>
                      {fmtShort(e.date)}
                    </Badge>
                    <div style={{ minWidth: 0 }}>
                      <Text size="sm" fw={600} truncate>
                        {e.name}
                      </Text>
                      <Text size="xs" c="dimmed">
                        {e.label}
                      </Text>
                    </div>
                  </Group>
                ))}
              </SimpleGrid>
            </Card>
          </Stack>
        </Grid.Col>

        <Grid.Col span={{ base: 12, lg: 5 }}>
          <Card>
            <Group justify="space-between" mb="md" wrap="nowrap">
              <Title order={4}>{side === 'avisos' ? 'Avisos' : 'Agenda'}</Title>
              <SegmentedControl
                size="xs"
                value={side}
                onChange={(v) => setSide(v as 'avisos' | 'agenda')}
                data={[
                  { value: 'avisos', label: `Avisos${myNotices.length ? ` (${myNotices.length})` : ''}` },
                  { value: 'agenda', label: 'Agenda' },
                ]}
              />
            </Group>

            {side === 'avisos' ? (
              <Stack gap="sm" className="stagger">
                {!myNotices.length && <EmptyState title="Nenhum aviso próximo" description="Avisos destinados a você aparecem aqui a partir de dois dias antes da data." py={28} />}
                {myNotices.map((n) => (
                  <NoticeCard key={n.id} notice={n} compact onCreateTask={me.canEditTasks ? setTaskFrom : undefined} />
                ))}
              </Stack>
            ) : (
              <Stack gap="md" className="page-enter">
                <Calendar
                  size="sm"
                  getDayProps={(date) => ({ selected: dayjs(date).format('YYYY-MM-DD') === day, onClick: () => setDay(dayjs(date).format('YYYY-MM-DD')) })}
                  renderDay={(date) => {
                    const items = markers.get(dayjs(date).format('YYYY-MM-DD')) ?? [];
                    return (
                      <Indicator size={6} color={items[0] ? KIND_COLOR[items[0].kind] : undefined} offset={-2} disabled={!items.length}>
                        <div>{dayjs(date).date()}</div>
                      </Indicator>
                    );
                  }}
                  styles={{ calendarHeader: { maxWidth: 'none' }, month: { width: '100%' } }}
                  style={{ display: 'flex', justifyContent: 'center' }}
                />
                <div>
                  <Text fw={700} size="sm" mb="xs">
                    {capitalize(dayjs(day).format('dddd, D [de] MMMM'))}
                  </Text>
                  {!dayItems.length && (
                    <Text size="sm" c="dimmed">
                      Nenhum compromisso neste dia.
                    </Text>
                  )}
                  <Stack gap={8} className="stagger">
                    {dayItems.map((item, i) => (
                      <Group key={i} gap="sm" wrap="nowrap" align="flex-start">
                        <Badge size="xs" color={KIND_COLOR[item.kind]} variant="light" w={92} style={{ flexShrink: 0 }}>
                          {KIND_LABEL[item.kind]}
                        </Badge>
                        <div style={{ minWidth: 0 }}>
                          <Text size="sm" fw={600}>
                            {item.title}
                          </Text>
                          <Text size="xs" c="dimmed" lineClamp={2}>
                            {item.detail}
                          </Text>
                        </div>
                      </Group>
                    ))}
                  </Stack>
                </div>
              </Stack>
            )}
          </Card>
        </Grid.Col>
      </Grid>

      <TaskDrawer task={selected} onClose={() => setSelected(null)} />
      <NewTaskModal opened={newOpen} onClose={newTask.close} />
      <NewTaskModal opened={!!taskFrom} onClose={() => setTaskFrom(null)} initial={taskFrom ? { title: taskFrom.title, description: taskFrom.subject } : undefined} />
    </Stack>
  );
}
