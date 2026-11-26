import { ActionIcon, Badge, Box, Button, Card, Group, SegmentedControl, Stack, Text, Tooltip } from '@mantine/core';
import { IconChevronLeft, IconChevronRight, IconFlag } from '@tabler/icons-react';
import dayjs from 'dayjs';
import { useMemo, useState } from 'react';
import { isDiscount, ordinal } from '../data/vacation';
import { type UnitPerson, sortUnit } from '../data/unit';
import { capitalize, fmtDate, todayISO } from '../lib/format';
import type { VacationPeriod } from '../types';
import { EmptyState } from './EmptyState';

interface Props {
  periods: VacationPeriod[];
  roster: UnitPerson[];
  onOpen?: (p: VacationPeriod) => void;
}

const NAME_COL = 190;
const DAY_W = 30;
const WEEKDAY = ['D', 'S', 'T', 'Q', 'Q', 'S', 'S'];

/**
 * Linha do tempo do mês: uma linha por militar, barras contínuas para férias, deslocamento hachurado,
 * desconto em outra cor e um marcador no dia da apresentação.
 */
export function VacationTimeline({ periods, roster, onOpen }: Props) {
  const [month, setMonth] = useState(dayjs().startOf('month'));
  const [refFilter, setRefFilter] = useState('todas');
  const today = todayISO();
  const first = month.format('YYYY-MM-DD');
  const last = month.endOf('month').format('YYYY-MM-DD');
  const nDays = month.daysInMonth();
  const days = Array.from({ length: nDays }, (_, i) => month.date(i + 1));

  const refs = useMemo(() => [...new Set(periods.map((p) => Number(p.reference_year)))].sort(), [periods]);

  // Cada lançamento ocupa: férias (início→término), deslocamento (+2 dias) e apresentação (dia seguinte).
  const rows = useMemo(() => {
    const visible = periods.filter((p) => (refFilter === 'todas' || String(p.reference_year) === refFilter) && p.start_date <= last && p.presentation_date >= first);
    const byPerson = new Map<number, VacationPeriod[]>();
    for (const p of visible) byPerson.set(p.person_id, [...(byPerson.get(p.person_id) ?? []), p]);
    const people = sortUnit(
      [...byPerson.keys()].map((id) => {
        const r = roster.find((x) => x.id === id);
        const p = byPerson.get(id)![0];
        return { id, rank: r?.rank ?? p.rank, war_name: r?.war_name ?? p.full_name.split(/\s+/).slice(-1)[0], seniority_order: r?.seniority_order ?? null };
      }),
    );
    return people.map((person) => ({ person, entries: byPerson.get(person.id)!.sort((a, b) => a.start_date.localeCompare(b.start_date)) }));
  }, [periods, roster, refFilter, first, last]);

  /** Coluna (1-based) de uma data dentro do mês, limitada às bordas. */
  const col = (iso: string) => Math.min(nDays, Math.max(1, dayjs(iso).diff(month, 'day') + 1));
  const inMonth = (iso: string) => iso >= first && iso <= last;

  const counts = useMemo(() => {
    const onLeave = periods.filter((p) => p.start_date <= today && dayjs(p.end_date).add(p.travel_days ? 2 : 0, 'day').format('YYYY-MM-DD') >= today).length;
    const startsThisMonth = periods.filter((p) => !isDiscount(p) && inMonth(p.start_date)).length;
    const presentations = periods.filter((p) => inMonth(p.presentation_date)).length;
    return { onLeave, startsThisMonth, presentations };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [periods, first, last, today]);

  const bar = (p: VacationPeriod) => {
    const discount = isDiscount(p);
    const travelEnd = dayjs(p.end_date).add(p.travel_days ? 2 : 0, 'day').format('YYYY-MM-DD');
    const segments: { from: string; to: string; kind: 'leave' | 'travel' }[] = [];
    if (p.start_date <= last && p.end_date >= first) segments.push({ from: p.start_date, to: p.end_date, kind: 'leave' });
    if (p.travel_days) {
      const tFrom = dayjs(p.end_date).add(1, 'day').format('YYYY-MM-DD');
      if (tFrom <= last && travelEnd >= first) segments.push({ from: tFrom, to: travelEnd, kind: 'travel' });
    }
    const label = discount ? `−${p.vacation_days}d` : `${p.period_number}/${p.period_total} · ${p.vacation_days} dias · REF ${p.reference_year}`;
    const tip = (
      <Stack gap={2}>
        <Text size="xs" fw={700}>
          {p.rank} {p.full_name}
        </Text>
        <Text size="xs">{discount ? `Desconto em férias · ${p.vacation_days} dia(s)` : `${ordinal(p.period_number)} parcela de ${p.period_total}${p.split_plan ? ` (${p.split_plan})` : ''} · ${p.vacation_days} dias`}</Text>
        <Text size="xs">
          {fmtDate(p.start_date)} a {fmtDate(p.end_date)} · REF {p.reference_year}
        </Text>
        {!!p.travel_days && <Text size="xs">+ 2 dias de deslocamento</Text>}
        <Text size="xs">Apresentação: {fmtDate(p.presentation_date)}</Text>
      </Stack>
    );
    return (
      <Box key={p.id} style={{ display: 'contents' }}>
        {segments.map((s) => {
          const c1 = col(s.from);
          const c2 = col(s.to);
          const contLeft = s.from < first;
          const contRight = s.to > last;
          return (
            <Tooltip key={s.kind} label={tip} withArrow multiline w={260} openDelay={150}>
              <Box
                className={`vt-bar vt-${discount ? 'discount' : s.kind}`}
                onClick={() => onOpen?.(p)}
                style={{
                  gridColumn: `${c1 + 1} / ${c2 + 2}`,
                  gridRow: 1,
                  borderTopLeftRadius: contLeft ? 0 : 6,
                  borderBottomLeftRadius: contLeft ? 0 : 6,
                  borderTopRightRadius: contRight ? 0 : 6,
                  borderBottomRightRadius: contRight ? 0 : 6,
                }}
              >
                {s.kind === 'leave' && (
                  <Text size="11px" fw={600} truncate>
                    {contLeft ? '‹ ' : ''}
                    {label}
                  </Text>
                )}
              </Box>
            </Tooltip>
          );
        })}
        {inMonth(p.presentation_date) && (
          <Tooltip label={`Apresentação · ${fmtDate(p.presentation_date)}`} withArrow>
            <Box className="vt-flag" style={{ gridColumn: `${col(p.presentation_date) + 1} / span 1`, gridRow: 1 }}>
              <IconFlag size={13} />
            </Box>
          </Tooltip>
        )}
      </Box>
    );
  };

  const gridCols = `${NAME_COL}px repeat(${nDays}, minmax(${DAY_W}px, 1fr))`;

  return (
    <Card p={0}>
      <Group justify="space-between" p="md" gap="sm">
        <Group gap="xs">
          <ActionIcon variant="default" aria-label="Mês anterior" onClick={() => setMonth((m) => m.subtract(1, 'month'))}>
            <IconChevronLeft size={16} />
          </ActionIcon>
          <Text fw={800} ff="heading" size="lg" miw={170} ta="center">
            {capitalize(month.format('MMMM [de] YYYY'))}
          </Text>
          <ActionIcon variant="default" aria-label="Próximo mês" onClick={() => setMonth((m) => m.add(1, 'month'))}>
            <IconChevronRight size={16} />
          </ActionIcon>
          <Button variant="subtle" size="xs" onClick={() => setMonth(dayjs().startOf('month'))}>
            Hoje
          </Button>
        </Group>
        <Group gap="xs">
          <Badge variant="light" color="sigase" tt="none">
            {counts.onLeave} de férias hoje
          </Badge>
          <Badge variant="light" color="gray" tt="none">
            {counts.startsThisMonth} inícios · {counts.presentations} apresentações no mês
          </Badge>
          {refs.length > 1 && (
            <SegmentedControl size="xs" value={refFilter} onChange={setRefFilter} data={[{ value: 'todas', label: 'Todas' }, ...refs.map((r) => ({ value: String(r), label: `REF ${r}` }))]} />
          )}
        </Group>
      </Group>

      <Box style={{ overflowX: 'auto', borderTop: '1px solid var(--mantine-color-default-border)' }}>
        <Box style={{ minWidth: NAME_COL + nDays * DAY_W }}>
          {/* Cabeçalho dos dias */}
          <Box className="vt-row vt-head" style={{ gridTemplateColumns: gridCols }}>
            <Text size="xs" fw={700} c="dimmed" className="vt-name">
              Militar
            </Text>
            {days.map((d) => {
              const iso = d.format('YYYY-MM-DD');
              const weekend = d.day() === 0 || d.day() === 6;
              return (
                <Box key={iso} className={`vt-day ${weekend ? 'vt-weekend' : ''} ${iso === today ? 'vt-today' : ''}`}>
                  <Text size="10px" c="dimmed" lh={1}>
                    {WEEKDAY[d.day()]}
                  </Text>
                  <Text size="xs" fw={iso === today ? 800 : 600} lh={1.4}>
                    {d.date()}
                  </Text>
                </Box>
              );
            })}
          </Box>

          {!rows.length && <EmptyState title="Ninguém de férias neste mês" description="Use as setas para ver outros meses." py={36} />}

          {rows.map(({ person, entries }) => (
            <Box key={person.id} className="vt-row" style={{ gridTemplateColumns: gridCols }}>
              {/* fundo: fins de semana e hoje */}
              {days.map((d, i) => {
                const iso = d.format('YYYY-MM-DD');
                const weekend = d.day() === 0 || d.day() === 6;
                return weekend || iso === today ? <Box key={iso} className={`vt-bg ${iso === today ? 'vt-today' : 'vt-weekend'}`} style={{ gridColumn: `${i + 2} / span 1`, gridRow: 1 }} /> : null;
              })}
              <Box className="vt-name" style={{ gridColumn: 1, gridRow: 1 }}>
                <Text size="xs" c="dimmed" lh={1.1}>
                  {person.rank}
                </Text>
                <Text size="sm" fw={700} lh={1.2} truncate>
                  {person.war_name}
                </Text>
              </Box>
              {entries.map(bar)}
            </Box>
          ))}
        </Box>
      </Box>

      <Group gap="lg" p="sm" px="md" style={{ borderTop: '1px solid var(--mantine-color-default-border)' }}>
        <Group gap={6}>
          <span className="vt-legend vt-leave" />
          <Text size="xs" c="dimmed">
            Férias (parcela · dias · referência)
          </Text>
        </Group>
        <Group gap={6}>
          <span className="vt-legend vt-travel" />
          <Text size="xs" c="dimmed">
            Deslocamento
          </Text>
        </Group>
        <Group gap={6}>
          <span className="vt-legend vt-discount" />
          <Text size="xs" c="dimmed">
            Desconto em férias
          </Text>
        </Group>
        <Group gap={6}>
          <IconFlag size={13} color="var(--mantine-color-sigase-7)" />
          <Text size="xs" c="dimmed">
            Apresentação
          </Text>
        </Group>
      </Group>
    </Card>
  );
}
