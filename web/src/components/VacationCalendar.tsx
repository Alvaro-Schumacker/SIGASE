import { ActionIcon, Box, Card, Group, Text, Tooltip } from '@mantine/core';
import { IconChevronLeft, IconChevronRight } from '@tabler/icons-react';
import dayjs from 'dayjs';
import { useMemo, useState } from 'react';
import type { UnitPerson } from '../data/unit';
import { capitalize, todayISO } from '../lib/format';
import type { VacationPeriod } from '../types';

// 8 cores para diferenciar os períodos (mesma lógica de rotação da versão atual).
const COLORS = ['sigase', 'blue', 'grape', 'orange', 'teal', 'pink', 'indigo', 'lime'];
const WEEKDAYS = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];

interface Props {
  periods: VacationPeriod[];
  roster: UnitPerson[];
}

export function VacationCalendar({ periods, roster }: Props) {
  const [month, setMonth] = useState(dayjs().startOf('month'));
  const today = todayISO();

  const ordered = useMemo(
    () =>
      [...periods]
        .sort((a, b) => a.start_date.localeCompare(b.start_date) || a.full_name.localeCompare(b.full_name, 'pt-BR') || a.id - b.id)
        .map((p, i) => ({
          ...p,
          color: COLORS[i % COLORS.length],
          leaveEnd: dayjs(p.end_date).add(p.travel_days ? 2 : 0, 'day').format('YYYY-MM-DD'),
          war: roster.find((r) => r.id === p.person_id)?.war_name || p.full_name.split(/\s+/).slice(-1)[0],
        })),
    [periods, roster],
  );

  const start = month.subtract(month.day(), 'day');
  const days = Array.from({ length: 42 }, (_, i) => start.add(i, 'day'));

  return (
    <Card p={0}>
      <Group justify="space-between" p="md">
        <Text fw={800} ff="heading" size="lg">
          {capitalize(month.format('MMMM [de] YYYY'))}
        </Text>
        <Group gap={4}>
          <ActionIcon variant="default" aria-label="Mês anterior" onClick={() => setMonth((m) => m.subtract(1, 'month'))}>
            <IconChevronLeft size={16} />
          </ActionIcon>
          <Text size="sm" fw={600} c="sigase" style={{ cursor: 'pointer' }} px="xs" onClick={() => setMonth(dayjs().startOf('month'))}>
            Hoje
          </Text>
          <ActionIcon variant="default" aria-label="Próximo mês" onClick={() => setMonth((m) => m.add(1, 'month'))}>
            <IconChevronRight size={16} />
          </ActionIcon>
        </Group>
      </Group>
      <Box style={{ overflowX: 'auto' }}>
        <Box style={{ display: 'grid', gridTemplateColumns: 'repeat(7, minmax(92px, 1fr))', minWidth: 660 }}>
          {WEEKDAYS.map((d, i) => (
            <Text key={d} size="xs" fw={700} ta="center" py={6} c={i === 0 || i === 6 ? 'red.6' : i === 5 ? 'grape.6' : 'dimmed'} style={{ borderTop: '1px solid var(--mantine-color-default-border)' }}>
              {d}
            </Text>
          ))}
          {days.map((d) => {
            const iso = d.format('YYYY-MM-DD');
            const outside = d.month() !== month.month();
            const weekday = d.day();
            const events = ordered
              .map((p) => {
                if (iso >= p.start_date && iso <= p.leaveEnd) return { p, kind: iso === p.start_date ? 'start' : 'leave' };
                if (iso === p.presentation_date) return { p, kind: 'presentation' };
                return null;
              })
              .filter(Boolean) as { p: (typeof ordered)[number]; kind: 'start' | 'leave' | 'presentation' }[];
            return (
              <Box
                key={iso}
                p={4}
                mih={96}
                style={{
                  borderTop: '1px solid var(--mantine-color-default-border)',
                  borderRight: weekday < 6 ? '1px solid var(--mantine-color-default-border)' : undefined,
                  opacity: outside ? 0.45 : 1,
                  background: iso === today ? 'var(--mantine-color-sigase-light)' : undefined,
                }}
              >
                <Text size="xs" fw={iso === today ? 800 : 600} c={weekday === 0 || weekday === 6 ? 'red.6' : weekday === 5 ? 'grape.6' : undefined} mb={2}>
                  {d.date()}
                </Text>
                {events.slice(0, 4).map(({ p, kind }) => {
                  const title = `${p.rank || ''} ${p.war}${kind === 'presentation' ? ' · Apresentação' : kind === 'leave' ? ' · Em férias' : ''}`.trim();
                  return (
                    <Tooltip key={`${p.id}-${kind}`} label={title} withArrow>
                      <Box
                        mb={2}
                        px={6}
                        style={{
                          borderRadius: 4,
                          fontSize: 11,
                          fontWeight: 600,
                          lineHeight: '17px',
                          height: kind === 'leave' ? 6 : 17,
                          whiteSpace: 'nowrap',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          color: kind === 'presentation' ? `var(--mantine-color-${p.color}-7)` : 'white',
                          background: kind === 'presentation' ? `var(--mantine-color-${p.color}-light)` : `var(--mantine-color-${p.color}-filled)`,
                          border: kind === 'presentation' ? `1px dashed var(--mantine-color-${p.color}-5)` : undefined,
                          marginTop: kind === 'leave' ? 6 : undefined,
                        }}
                      >
                        {kind === 'start' ? p.war : kind === 'presentation' ? `${p.war} · Apres.` : ''}
                      </Box>
                    </Tooltip>
                  );
                })}
              </Box>
            );
          })}
        </Box>
      </Box>
    </Card>
  );
}
