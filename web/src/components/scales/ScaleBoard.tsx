import { ActionIcon, Badge, Box, Button, Card, Group, Paper, SimpleGrid, Stack, Text, Title, Tooltip, UnstyledButton } from '@mantine/core';
import { IconArrowsExchange, IconChevronLeft, IconChevronRight, IconSettings } from '@tabler/icons-react';
import dayjs, { type Dayjs } from 'dayjs';
import { useEffect, useMemo, useRef, useState } from 'react';
import { type DutyScale, MODE_LABEL, SERVICE_COLOR, abbreviationOf, assignmentInfo, categoryOf, computeRow, nextServiceDates, useToggleRedDate } from '../../data/scales';
import { notifyError } from '../../lib/confirm';
import { capitalize, todayISO } from '../../lib/format';
import { ScaleCellModal } from './ScaleCellModal';

interface Props {
  scale: DutyScale;
  canEdit: boolean;
  onEdit: () => void;
}

const DAY_TINT = {
  vermelha: 'var(--mantine-color-red-light)',
  roxa: 'var(--mantine-color-grape-light)',
  preta: undefined,
  corrida: undefined,
} as const;
const DAY_TEXT = { vermelha: 'red.7', roxa: 'grape.7', preta: undefined, corrida: undefined } as const;

export function ScaleBoard({ scale, canEdit, onEdit }: Props) {
  const [month, setMonth] = useState(dayjs().startOf('month'));
  const [cell, setCell] = useState<{ personId: number; date: string } | null>(null);
  const toggleRed = useToggleRedDate(scale.id);
  const scroller = useRef<HTMLDivElement>(null);
  const today = todayISO();

  const days = useMemo(() => Array.from({ length: month.daysInMonth() }, (_, i) => month.date(i + 1)), [month]);
  const rows = useMemo(() => scale.participants.map((p) => ({ person: p, cells: computeRow(scale, p.id, month) })), [scale, month]);

  // Rola o quadro até o dia de hoje quando o mês atual é exibido.
  useEffect(() => {
    const el = scroller.current?.querySelector<HTMLElement>(`[data-date="${today}"]`);
    const sticky = scroller.current?.querySelector<HTMLElement>('.scale-sticky')?.offsetWidth ?? 170;
    if (el && scroller.current) scroller.current.scrollTo({ left: Math.max(0, el.offsetLeft - sticky), behavior: 'smooth' });
  }, [month, scale.id, today]);

  const toggle = (iso: string) =>
    toggleRed.mutate({ date: iso, is_red: !scale.red_dates.includes(iso) }, { onError: (e) => notifyError(e) });

  const countFor = (iso: string, serviceName: string) =>
    Object.entries(scale.assignments).filter(([key, value]) => key.endsWith(`|${iso}`) && assignmentInfo(value).service === serviceName).length;

  const header = (d: Dayjs) => {
    const iso = d.format('YYYY-MM-DD');
    const cat = categoryOf(scale, d);
    const override = scale.red_dates.includes(iso);
    const weekend = scale.mode !== 'corrida' && (d.day() === 0 || d.day() === 6);
    return (
      <th key={iso} data-date={iso} style={{ background: iso === today ? 'var(--mantine-color-sigase-light)' : DAY_TINT[cat], minWidth: 64, padding: '6px 4px', verticalAlign: 'top' }}>
        <Stack gap={2} align="center">
          <Text size="10px" fw={700} tt="uppercase" c={DAY_TEXT[cat] ?? 'dimmed'}>
            {d.format('ddd').replace('.', '')}
          </Text>
          <Text fw={800} size="md" c={DAY_TEXT[cat]}>
            {d.date()}
          </Text>
          {scale.mode !== 'corrida' && (
            <Tooltip label={weekend && !override ? 'Vermelha pelo fim de semana' : override ? 'Remover marcação vermelha' : 'Marcar como vermelho (feriado)'}>
              <Badge
                size="xs"
                variant={override ? 'filled' : 'outline'}
                color={weekend || override ? 'red' : 'gray'}
                style={{ cursor: canEdit && !(weekend && !override) ? 'pointer' : 'default', opacity: weekend && !override ? 0.6 : 1 }}
                onClick={() => canEdit && !(weekend && !override) && toggle(iso)}
              >
                {weekend && !override ? 'FDS' : override ? 'VERM ×' : '+ VERM'}
              </Badge>
            </Tooltip>
          )}
          <Text size="9px" c="dimmed" ta="center" lh={1.3}>
            {scale.services.map((s) => `${abbreviationOf(s)} ${countFor(iso, s.name)}/${s.daily_slots}`).join(' · ')}
          </Text>
        </Stack>
      </th>
    );
  };

  return (
    <Stack gap="lg">
      <Card>
        <Group justify="space-between" align="flex-start" mb="md">
          <div>
            <Text size="xs" fw={700} c="sigase" tt="uppercase" style={{ letterSpacing: 1.2 }}>
              {MODE_LABEL[scale.mode]}
            </Text>
            <Title order={3}>{scale.name}</Title>
            <Group gap={6} mt={6}>
              <Badge variant="light" color="gray">
                {scale.participants.length} militares
              </Badge>
              {scale.services.map((s) => (
                <Badge key={s.name} variant="light" color={SERVICE_COLOR[s.color]?.mantine ?? 'sigase'}>
                  {abbreviationOf(s)} · {s.name}: {s.daily_slots}/dia
                </Badge>
              ))}
            </Group>
          </div>
          <Group gap="xs">
            <ActionIcon variant="default" size="lg" aria-label="Mês anterior" onClick={() => setMonth((m) => m.subtract(1, 'month'))}>
              <IconChevronLeft size={18} />
            </ActionIcon>
            <Button variant="default" onClick={() => setMonth(dayjs().startOf('month'))} miw={150}>
              {capitalize(month.format('MMMM YYYY'))}
            </Button>
            <ActionIcon variant="default" size="lg" aria-label="Próximo mês" onClick={() => setMonth((m) => m.add(1, 'month'))}>
              <IconChevronRight size={18} />
            </ActionIcon>
            {canEdit && (
              <Button variant="light" leftSection={<IconSettings size={16} />} onClick={onEdit}>
                Configurar
              </Button>
            )}
          </Group>
        </Group>

        <Box ref={scroller} style={{ overflowX: 'auto', borderRadius: 'var(--mantine-radius-md)', border: '1px solid var(--mantine-color-default-border)' }}>
          <table className="scale-grid">
            <thead>
              <tr>
                <th className="scale-sticky" style={{ minWidth: 170, textAlign: 'left', padding: '6px 10px' }}>
                  <Text size="xs" fw={700} c="dimmed">
                    POSTO / NOME DE GUERRA
                  </Text>
                </th>
                {days.map(header)}
              </tr>
            </thead>
            <tbody>
              {rows.map(({ person, cells }) => (
                <tr key={person.id}>
                  <th className="scale-sticky" style={{ textAlign: 'left', padding: '4px 10px' }}>
                    <Text size="xs" c="dimmed" fw={600} lh={1.1}>
                      {person.rank}
                    </Text>
                    <Text size="sm" fw={700} lh={1.2}>
                      {person.war_name}
                    </Text>
                  </th>
                  {days.map((d) => {
                    const iso = d.format('YYYY-MM-DD');
                    const c = cells[iso];
                    const cat = categoryOf(scale, d);
                    const color = c?.config ? SERVICE_COLOR[c.config.color]?.mantine ?? 'sigase' : null;
                    const title = c?.service
                      ? `Serviço: ${c.service}${c.swapName ? ` · Troca: ${c.swapName}` : ''}`
                      : c?.excluded
                        ? `Fora da escala: ${c.reason} · ${c.rest} dia(s) de folga`
                        : `${c?.rest ?? 99} dia(s) de folga na categoria ${cat}`;
                    return (
                      <td key={iso} style={{ background: DAY_TINT[cat], padding: 3 }}>
                        <Tooltip label={title} openDelay={350}>
                          <UnstyledButton
                            className="scale-cell"
                            disabled={!canEdit}
                            onClick={() => setCell({ personId: person.id, date: iso })}
                            data-excluded={c?.excluded || undefined}
                            style={{
                              background: color ? `var(--mantine-color-${color}-filled)` : undefined,
                              color: color ? (color === 'yellow' ? 'var(--mantine-color-dark-7)' : 'white') : c?.rest === 99 ? 'var(--mantine-color-dimmed)' : undefined,
                              fontWeight: color ? 800 : 600,
                              cursor: canEdit ? 'pointer' : 'default',
                            }}
                          >
                            {c?.service ? (c.config ? abbreviationOf(c.config) : c.service) : c?.rest ?? 99}
                            {c?.swapName && <IconArrowsExchange size={10} style={{ position: 'absolute', top: 2, right: 2 }} />}
                          </UnstyledButton>
                        </Tooltip>
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </Box>
        <Group gap="lg" mt="sm">
          <Text size="xs" c="dimmed">
            Números = dias de folga na categoria do dia (até 99). Clique em uma célula para lançar serviço, troca, folga manual ou afastamento.
          </Text>
        </Group>
      </Card>

      <NextServices scale={scale} />
      <ScaleCellModal scale={scale} cell={cell} onClose={() => setCell(null)} />
    </Stack>
  );
}

function NextServices({ scale }: { scale: DutyScale }) {
  const dates = nextServiceDates(scale);
  return (
    <Card>
      <Title order={4}>Próximos serviços</Title>
      <Text size="sm" c="dimmed" mb="md">
        Hoje é {dayjs().format('dddd, D [de] MMMM')}. Inclui amanhã e os dias vermelhos seguidos até o próximo dia comum.
      </Text>
      <SimpleGrid cols={{ base: 1, sm: 2, lg: 3 }} className="stagger">
        {dates.map((d) => {
          const iso = d.format('YYYY-MM-DD');
          const items = scale.participants
            .map((p) => ({ p, info: assignmentInfo(scale.assignments[`${p.id}|${iso}`]) }))
            .filter((x) => x.info.service && scale.services.some((s) => s.name === x.info.service));
          return (
            <Paper key={iso} withBorder p="sm" radius="md">
              <Text fw={700} size="sm" mb="xs">
                {capitalize(d.format('dddd, DD [de] MMMM'))}
              </Text>
              {!items.length && (
                <Text size="sm" c="dimmed">
                  Nenhum serviço atribuído.
                </Text>
              )}
              <Stack gap={6}>
                {items.map(({ p, info }) => (
                  <Group key={p.id} justify="space-between" wrap="nowrap">
                    <Text size="sm" fw={600}>
                      {p.rank} {p.war_name}
                    </Text>
                    <Text size="xs" c="dimmed" ta="right">
                      {info.service}
                      {info.swapName && ` · Troca: ${info.swapName}`}
                    </Text>
                  </Group>
                ))}
              </Stack>
            </Paper>
          );
        })}
      </SimpleGrid>
    </Card>
  );
}
