import { Alert, Badge, Button, Group, Modal, NumberInput, Paper, SegmentedControl, Select, SimpleGrid, Stack, Switch, Text } from '@mantine/core';
import { DateInput } from '@mantine/dates';
import { IconAlertTriangle, IconCalendarCheck } from '@tabler/icons-react';
import dayjs from 'dayjs';
import { useEffect, useMemo, useState } from 'react';
import { type EntryType, SPLITS, type SplitValue, guessSplit, ordinal, presentationDate, suggestedReferenceYear, summarize, useSaveVacation, useVacationPlan } from '../data/vacation';
import { useUnitPersonnel } from '../data/unit';
import { notifyError, notifyOk } from '../lib/confirm';
import { fmtDate } from '../lib/format';
import type { VacationPeriod } from '../types';

interface Props {
  opened: boolean;
  onClose: () => void;
  period: VacationPeriod | null;
}

const iso = (d: string | null) => (d ? dayjs(d).format('YYYY-MM-DD') : null);

export function VacationFormModal({ opened, onClose, period }: Props) {
  const editing = !!period;
  const { data: roster = [] } = useUnitPersonnel();
  const { data: periods = [] } = useVacationPlan();
  const save = useSaveVacation();
  const [type, setType] = useState<EntryType>('periodo');
  const [personId, setPersonId] = useState<string | null>(null);
  const [ref, setRef] = useState(String(suggestedReferenceYear()));
  const [split, setSplit] = useState<SplitValue>('30');
  const [number, setNumber] = useState('1');
  const [start, setStart] = useState<string | null>(null);
  const [days, setDays] = useState<number | string>(30);
  const [travel, setTravel] = useState(false);
  const [touchedRef, setTouchedRef] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  useEffect(() => {
    if (!opened) return;
    setSubmitted(false);
    setType(period?.entry_type === 'desconto' ? 'desconto' : 'periodo');
    setPersonId(period ? String(period.person_id) : null);
    setRef(String(period?.reference_year ?? suggestedReferenceYear()));
    setSplit(((period?.split_plan as SplitValue) || guessSplit(period?.period_total ?? 1)) as SplitValue);
    setNumber(String(period?.period_number ?? 1));
    setStart(period?.start_date ?? null);
    setDays(period?.vacation_days ?? 30);
    setTravel(!!period?.travel_days);
    setTouchedRef(editing);
  }, [opened, period, editing]);

  const summary = useMemo(() => (personId ? summarize(periods, Number(personId), Number(ref), period?.id) : null), [periods, personId, ref, period]);
  const splitInfo = SPLITS.find((s) => s.value === split)!;
  const parcelNo = Math.min(Number(number), splitInfo.total);
  const isLast = parcelNo === splitInfo.total;
  const discountDays = summary?.discountDays ?? 0;
  const expected = type === 'desconto' ? null : Math.max(0, splitInfo.parts[parcelNo - 1] - (isLast ? discountDays : 0));

  // Novo lançamento: ao escolher o militar/REF, segue a divisão já usada e sugere a próxima parcela livre.
  useEffect(() => {
    if (!opened || editing || !summary || type !== 'periodo') return;
    if (summary.split) setSplit(summary.split.value);
    const next = summary.parcels.find((p) => !p.entry);
    if (next) setNumber(String(next.number));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [personId, ref, type]);

  // Os dias acompanham a parcela escolhida (ainda podem ser ajustados).
  useEffect(() => {
    if (!opened || type !== 'periodo' || expected == null) return;
    if (!editing || Number(number) !== period?.period_number || split !== (period?.split_plan || guessSplit(period?.period_total ?? 1))) setDays(expected);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [split, number, discountDays, type]);

  const nDays = Number(days) || 0;
  const end = start && nDays > 0 ? dayjs(start).add(nDays - 1, 'day').format('YYYY-MM-DD') : null;
  const travelUsedElsewhere = summary?.travel && summary.travel.id !== period?.id ? summary.travel : undefined;
  const presentation = end ? presentationDate(end, type === 'periodo' && travel) : null;
  const years = useMemo(() => {
    const y = dayjs().year();
    const set = new Set([y - 2, y - 1, y, y + 1, Number(ref)]);
    return [...set].sort().map((v) => ({ value: String(v), label: `REF ${v}` }));
  }, [ref]);

  const onStart = (value: string | null) => {
    setStart(iso(value));
    if (!touchedRef && value) setRef(String(suggestedReferenceYear(iso(value))));
  };

  const errors = {
    person: !personId ? 'Selecione o militar' : null,
    start: !start ? 'Informe o início' : null,
    days: nDays < 1 || nDays > 30 ? 'Entre 1 e 30 dias' : summary && summary.usedDays + nDays > 30 ? `Só restam ${summary.remainingDays} dias na REF ${ref}` : null,
  };
  const daysWarning = type === 'periodo' && expected != null && nDays !== expected ? `A ${ordinal(parcelNo)} parcela de ${split} deveria ter ${expected} dias${isLast && discountDays ? ` (${splitInfo.parts[parcelNo - 1]} − ${discountDays} de desconto)` : ''}.` : null;

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitted(true);
    if (Object.values(errors).some(Boolean)) return;
    save.mutate(
      {
        id: period?.id,
        entry_type: type,
        person_id: Number(personId),
        start_date: start!,
        end_date: end!,
        travel_days: type === 'periodo' && travel,
        period_number: type === 'periodo' ? parcelNo : 1,
        period_total: type === 'periodo' ? splitInfo.total : 1,
        split_plan: type === 'periodo' ? split : '',
        reference_year: Number(ref),
      },
      {
        onSuccess: () => {
          notifyOk(type === 'desconto' ? 'Desconto em férias lançado; aviso criado.' : editing ? 'Período atualizado e avisos sincronizados.' : 'Período salvo; avisos de início e apresentação criados.');
          onClose();
        },
        onError: (err) => notifyError(err),
      },
    );
  };

  return (
    <Modal
      opened={opened}
      onClose={onClose}
      size="lg"
      closeOnEscape={false}
      closeOnClickOutside={false}
      title={
        <div>
          <Text fw={800} size="lg">
            {editing ? 'Editar lançamento de férias' : 'Novo lançamento de férias'}
          </Text>
          <Text size="sm" c="dimmed">
            Período (parcela) ou desconto em férias de um militar do efetivo.
          </Text>
        </div>
      }
    >
      <form onSubmit={submit}>
        <Stack gap="md">
          <SegmentedControl
            fullWidth
            value={type}
            onChange={(v) => setType(v as EntryType)}
            data={[
              { value: 'periodo', label: 'Período de férias' },
              { value: 'desconto', label: 'Desconto em férias' },
            ]}
          />
          <SimpleGrid cols={{ base: 1, sm: 2 }}>
            <Select
              label="Militar"
              withAsterisk
              searchable
              placeholder="Selecione"
              data={roster.map((p) => ({ value: String(p.id), label: `${p.rank} ${p.war_name} · ${p.full_name}` }))}
              value={personId}
              onChange={setPersonId}
              error={submitted && errors.person}
            />
            <Select
              label="Referente a"
              allowDeselect={false}
              data={years}
              value={ref}
              onChange={(v) => {
                setRef(v ?? ref);
                setTouchedRef(true);
              }}
              description="Dezembro costuma misturar referências: confira."
            />
          </SimpleGrid>

          {summary && (
            <Paper withBorder radius="md" p="sm" className="page-enter">
              <Group justify="space-between" mb={6}>
                <Text size="sm" fw={700}>
                  Situação na REF {ref}
                </Text>
                <Badge variant="light" color={summary.remainingDays ? 'sigase' : 'gray'}>
                  {summary.remainingDays} de 30 dias disponíveis
                </Badge>
              </Group>
              <Group gap={6}>
                {summary.parcels.map((p) => (
                  <Badge key={p.number} variant={p.entry ? 'filled' : 'outline'} color={p.entry ? 'sigase' : 'gray'} tt="none">
                    {ordinal(p.number)}: {p.expected} dias {p.entry ? `· ${fmtDate(p.entry.start_date).slice(0, 5)}` : '· a lançar'}
                  </Badge>
                ))}
                {!summary.parcels.length && (
                  <Text size="xs" c="dimmed">
                    Nenhuma parcela lançada nesta referência.
                  </Text>
                )}
                {summary.discountDays > 0 && (
                  <Badge variant="light" color="brass" tt="none">
                    Desconto: {summary.discountDays} dia(s)
                  </Badge>
                )}
                {summary.travel && (
                  <Badge variant="light" color="gray" tt="none">
                    Deslocamento usado
                  </Badge>
                )}
              </Group>
            </Paper>
          )}

          {type === 'periodo' ? (
            <>
              <Stack gap={4}>
                <Text size="sm" fw={500}>
                  Divisão das férias
                </Text>
                <SegmentedControl fullWidth value={split} onChange={(v) => setSplit(v as SplitValue)} data={SPLITS.map((s) => ({ value: s.value, label: s.label }))} />
              </Stack>
              <SimpleGrid cols={{ base: 1, sm: 3 }}>
                <Select
                  label="Parcela"
                  allowDeselect={false}
                  data={splitInfo.parts.map((d, i) => ({ value: String(i + 1), label: `${ordinal(i + 1)} de ${splitInfo.total} · ${d} dias` }))}
                  value={String(parcelNo)}
                  onChange={(v) => setNumber(v ?? '1')}
                />
                <DateInput label="Início" withAsterisk valueFormat="DD/MM/YYYY" value={start} onChange={onStart} error={submitted && errors.start} />
                <NumberInput label="Dias" min={1} max={30} allowDecimal={false} value={days} onChange={setDays} error={submitted && errors.days} />
              </SimpleGrid>
              {daysWarning && (
                <Alert color="brass" variant="light" icon={<IconAlertTriangle size={16} />} p="xs">
                  <Text size="xs">{daysWarning}</Text>
                </Alert>
              )}
              <Switch
                label="Usar os 2 dias de deslocamento"
                description={travelUsedElsewhere ? `Já usados nesta REF (lançamento de ${fmtDate(travelUsedElsewhere.start_date)}). Só podem ser usados uma vez por referência.` : 'Só podem ser usados uma vez por referência.'}
                checked={travel}
                disabled={!!travelUsedElsewhere}
                onChange={(e) => setTravel(e.currentTarget.checked)}
              />
            </>
          ) : (
            <>
              <SimpleGrid cols={{ base: 1, sm: 2 }}>
                <DateInput label="Início do desconto" withAsterisk valueFormat="DD/MM/YYYY" value={start} onChange={onStart} error={submitted && errors.start} />
                <NumberInput label="Dias de desconto" min={1} max={30} allowDecimal={false} value={days} onChange={setDays} error={submitted && errors.days} />
              </SimpleGrid>
              <Text size="xs" c="dimmed">
                Os dias saem da última parcela da referência
                {summary?.split ? ` (${ordinal(summary.split.total)} parcela de ${summary.split.parts[summary.split.total - 1]} dias passa a ter ${Math.max(0, summary.split.parts[summary.split.total - 1] - summary.discountDays - nDays)})` : ''}. Desconto não usa dias de deslocamento.
              </Text>
            </>
          )}

          <Alert variant="light" color="sigase" icon={<IconCalendarCheck size={18} />}>
            {end && presentation ? (
              <>
                {fmtDate(start)} a <b>{fmtDate(end)}</b> ({nDays} {nDays === 1 ? 'dia' : 'dias'}) · Apresentação: <b>{fmtDate(presentation)}</b>
                {type === 'periodo' && travel ? ' (com 2 dias de deslocamento)' : ''}
              </>
            ) : (
              'Informe o início e os dias para calcular o término e a apresentação.'
            )}
          </Alert>

          <Group justify="flex-end">
            <Button variant="default" onClick={onClose}>
              Cancelar
            </Button>
            <Button type="submit" loading={save.isPending}>
              {editing ? 'Salvar alterações' : type === 'desconto' ? 'Lançar desconto' : 'Salvar período'}
            </Button>
          </Group>
        </Stack>
      </form>
    </Modal>
  );
}
