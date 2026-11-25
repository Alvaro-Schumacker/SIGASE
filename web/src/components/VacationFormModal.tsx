import { Alert, Button, Group, Modal, NumberInput, SegmentedControl, Select, SimpleGrid, Stack, Switch, Text } from '@mantine/core';
import { DateInput } from '@mantine/dates';
import { IconCalendarCheck } from '@tabler/icons-react';
import dayjs from 'dayjs';
import { useEffect, useState } from 'react';
import { presentationDate, suggestedReferenceYear, useSaveVacation } from '../data/vacation';
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
  const save = useSaveVacation();
  const [personId, setPersonId] = useState<string | null>(null);
  const [start, setStart] = useState<string | null>(null);
  const [end, setEnd] = useState<string | null>(null);
  const [days, setDays] = useState<number | string>('');
  const [travel, setTravel] = useState(false);
  const [total, setTotal] = useState('1');
  const [number, setNumber] = useState('1');
  const [refYear, setRefYear] = useState('2026');
  const [refTouched, setRefTouched] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  useEffect(() => {
    if (!opened) return;
    setPersonId(period ? String(period.person_id) : null);
    setStart(period?.start_date ?? null);
    setEnd(period?.end_date ?? null);
    setDays(period?.vacation_days ?? '');
    setTravel(!!period?.travel_days);
    setTotal(String(period?.period_total ?? 1));
    setNumber(String(period?.period_number ?? 1));
    setRefYear(String(period?.reference_year ?? suggestedReferenceYear(period?.start_date)));
    setRefTouched(editing);
    setSubmitted(false);
  }, [opened, period, editing]);

  // Dias ↔ término: preencher um calcula o outro (contando o primeiro e o último dia).
  const onStart = (value: string | null) => {
    const s = iso(value);
    setStart(s);
    if (!refTouched) setRefYear(String(suggestedReferenceYear(s)));
    const n = Number(days);
    if (s && Number.isInteger(n) && n >= 1) setEnd(dayjs(s).add(n - 1, 'day').format('YYYY-MM-DD'));
    else if (s && end && end >= s) setDays(dayjs(end).diff(dayjs(s), 'day') + 1);
  };
  const onEnd = (value: string | null) => {
    const e = iso(value);
    setEnd(e);
    if (start && e && e >= start) setDays(dayjs(e).diff(dayjs(start), 'day') + 1);
  };
  const onDays = (value: number | string) => {
    setDays(value);
    const n = Number(value);
    if (start && Number.isInteger(n) && n >= 1 && n <= 366) setEnd(dayjs(start).add(n - 1, 'day').format('YYYY-MM-DD'));
  };
  const onTotal = (value: string) => {
    setTotal(value);
    if (Number(number) > Number(value)) setNumber(value);
  };

  const errors = {
    person: !personId ? 'Selecione uma pessoa' : null,
    start: !start ? 'Informe a data inicial' : null,
    end: !end ? 'Informe o término ou a duração' : start && end < start ? 'O término não pode ser anterior ao início' : null,
  };
  const presentation = end ? presentationDate(end, travel) : null;

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitted(true);
    if (Object.values(errors).some(Boolean)) return;
    save.mutate(
      { id: period?.id, person_id: Number(personId), start_date: start!, end_date: end!, travel_days: travel, period_number: Number(number), period_total: Number(total), reference_year: Number(refYear) },
      {
        onSuccess: () => {
          notifyOk(editing ? 'Período atualizado e avisos sincronizados.' : 'Período salvo; avisos de início e apresentação criados.');
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
            {editing ? 'Editar período de férias' : 'Incluir período de férias'}
          </Text>
          <Text size="sm" c="dimmed">
            Selecione uma ficha do efetivo da unidade.
          </Text>
        </div>
      }
    >
      <form onSubmit={submit}>
        <Stack gap="md">
          <Select
            label="Militar"
            withAsterisk
            searchable
            placeholder="Selecione uma pessoa"
            data={roster.map((p) => ({ value: String(p.id), label: `${p.rank} ${p.full_name}` }))}
            value={personId}
            onChange={setPersonId}
            error={submitted && errors.person}
          />
          <Stack gap={4}>
            <Text size="sm" fw={500}>
              Referente a
            </Text>
            <SegmentedControl
              data={[
                { value: '2025', label: 'REF 2025' },
                { value: '2026', label: 'REF 2026' },
              ]}
              value={refYear}
              onChange={(v) => {
                setRefYear(v);
                setRefTouched(true);
              }}
            />
          </Stack>
          <SimpleGrid cols={{ base: 1, sm: 3 }}>
            <DateInput label="Início das férias" withAsterisk valueFormat="DD/MM/YYYY" value={start} onChange={onStart} error={submitted && errors.start} />
            <NumberInput label="Dias de férias" min={1} max={366} placeholder="Ex.: 10" value={days} onChange={onDays} allowDecimal={false} />
            <DateInput label="Término das férias" withAsterisk valueFormat="DD/MM/YYYY" value={end} onChange={onEnd} minDate={start ?? undefined} error={submitted && errors.end} />
          </SimpleGrid>
          <SimpleGrid cols={{ base: 1, sm: 2 }}>
            <Select label="Quantidade de parcelas" data={['1', '2', '3'].map((v) => ({ value: v, label: `${v} ${v === '1' ? 'período' : 'períodos'}` }))} value={total} onChange={(v) => onTotal(v ?? '1')} allowDeselect={false} />
            <Select
              label="Período"
              data={Array.from({ length: Number(total) }, (_, i) => ({ value: String(i + 1), label: `Período ${i + 1}/${total}` }))}
              value={number}
              onChange={(v) => setNumber(v ?? '1')}
              allowDeselect={false}
            />
          </SimpleGrid>
          <Switch label="Incluir dois dias de deslocamento" checked={travel} onChange={(e) => setTravel(e.currentTarget.checked)} />
          <Alert variant="light" color="sigase" icon={<IconCalendarCheck size={18} />}>
            {presentation ? (
              <>
                Apresentação calculada: <b>{fmtDate(presentation)}</b>
              </>
            ) : (
              'Informe o início e os dias (ou o término) para calcular a apresentação.'
            )}
          </Alert>
          <Text size="xs" c="dimmed">
            Informe os dias de férias ou o término; o outro campo é calculado automaticamente. A duração conta o primeiro e o último dia.
          </Text>
          <Group justify="flex-end">
            <Button variant="default" onClick={onClose}>
              Cancelar
            </Button>
            <Button type="submit" loading={save.isPending}>
              {editing ? 'Salvar alterações' : 'Salvar período'}
            </Button>
          </Group>
        </Stack>
      </form>
    </Modal>
  );
}
