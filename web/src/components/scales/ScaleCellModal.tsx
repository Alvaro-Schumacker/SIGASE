import { Button, Group, Modal, NumberInput, SegmentedControl, Select, Stack, Switch, Text, TextInput } from '@mantine/core';
import { useEffect, useState } from 'react';
import { type DutyScale, assignmentInfo, useSaveCell } from '../../data/scales';
import { notifyError } from '../../lib/confirm';
import { capitalize } from '../../lib/format';
import dayjs from 'dayjs';

interface Props {
  scale: DutyScale;
  cell: { personId: number; date: string } | null;
  onClose: () => void;
}

type Mode = 'off' | 'service' | 'excluded';

/** Situação de um militar em um dia: folga (automática ou manual), serviço (com troca) ou fora da escala. */
export function ScaleCellModal({ scale, cell, onClose }: Props) {
  const save = useSaveCell(scale.id);
  const person = cell ? scale.participants.find((p) => p.id === cell.personId) : undefined;
  const [mode, setMode] = useState<Mode>('off');
  const [service, setService] = useState<string | null>(null);
  const [swap, setSwap] = useState(false);
  const [swapName, setSwapName] = useState('');
  const [manualRest, setManualRest] = useState(false);
  const [restCount, setRestCount] = useState<number | string>(0);
  const [days, setDays] = useState<number | string>(1);
  const [reason, setReason] = useState('');

  useEffect(() => {
    if (!cell) return;
    const current = assignmentInfo(scale.assignments[`${cell.personId}|${cell.date}`]);
    const known = scale.services.some((s) => s.name === current.service) ? current.service : '';
    setMode(current.excluded ? 'excluded' : known ? 'service' : 'off');
    setService(known || null);
    setSwap(!!current.swapName);
    setSwapName(current.swapName);
    setManualRest(current.restCount !== null);
    setRestCount(current.restCount ?? 0);
    setDays(1);
    setReason(current.reason);
  }, [cell, scale]);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!cell) return;
    if (mode === 'service' && !service) return notifyError(new Error('Selecione o serviço.'), 'Campo obrigatório');
    if (mode === 'service' && swap && !swapName.trim()) return notifyError(new Error('Informe quem vai tirar o serviço.'), 'Campo obrigatório');
    const rest = Number(restCount);
    if (mode === 'off' && manualRest && (!Number.isInteger(rest) || rest < 0 || rest > 99)) return notifyError(new Error('A contagem manual deve ser um número inteiro entre 0 e 99.'), 'Valor inválido');
    const nDays = Number(days);
    if (mode === 'excluded' && (!Number.isInteger(nDays) || nDays < 1 || nDays > 366 || !reason.trim())) return notifyError(new Error('Informe uma quantidade válida de dias e o motivo.'), 'Campos obrigatórios');
    const status = mode === 'off' && manualRest ? 'rest' : mode;
    save.mutate(
      { person_id: cell.personId, date: cell.date, status, service: status === 'service' ? service : null, swap_name: mode === 'service' && swap ? swapName.trim() : '', rest_count: rest, excluded_days: nDays, reason: reason.trim() },
      { onSuccess: onClose, onError: (err) => notifyError(err) },
    );
  };

  return (
    <Modal
      opened={!!cell}
      onClose={onClose}
      title={
        <div>
          <Text size="xs" fw={700} c="sigase" tt="uppercase" style={{ letterSpacing: 1.2 }}>
            {person ? `${person.rank} ${person.war_name}` : ''}
          </Text>
          <Text fw={800} size="lg">
            {cell ? capitalize(dayjs(cell.date).format('dddd, DD/MM/YYYY')) : ''}
          </Text>
        </div>
      }
    >
      <form onSubmit={submit}>
        <Stack gap="md">
          <SegmentedControl
            fullWidth
            value={mode}
            onChange={(v) => setMode(v as Mode)}
            data={[
              { value: 'off', label: 'Folga' },
              { value: 'service', label: 'Serviço' },
              { value: 'excluded', label: 'Fora da escala' },
            ]}
          />

          {mode === 'off' && (
            <Stack gap="xs" className="page-enter">
              <Switch label="Ajustar a contagem de folga manualmente" checked={manualRest} onChange={(e) => setManualRest(e.currentTarget.checked)} />
              {manualRest && (
                <NumberInput label="Contagem de folga (0 a 99)" min={0} max={99} allowDecimal={false} value={restCount} onChange={setRestCount} description="Os próximos dias continuam contando a partir deste número." />
              )}
            </Stack>
          )}

          {mode === 'service' && (
            <Stack gap="xs" className="page-enter">
              <Select label="Serviço" placeholder="Selecione um serviço" data={scale.services.map((s) => s.name)} value={service} onChange={setService} />
              {service && <Switch label="Troca de serviço" checked={swap} onChange={(e) => setSwap(e.currentTarget.checked)} />}
              {service && swap && <TextInput label="Quem vai tirar o serviço" maxLength={100} placeholder="Nome de guerra" value={swapName} onChange={(e) => setSwapName(e.currentTarget.value)} />}
            </Stack>
          )}

          {mode === 'excluded' && (
            <Stack gap="xs" className="page-enter">
              <NumberInput label="Dias fora da escala (incluindo esta data)" min={1} max={366} allowDecimal={false} value={days} onChange={setDays} />
              <TextInput label="Motivo" maxLength={120} placeholder="Ex.: Dispensa médica" value={reason} onChange={(e) => setReason(e.currentTarget.value)} />
            </Stack>
          )}

          <Group justify="flex-end">
            <Button variant="default" onClick={onClose}>
              Cancelar
            </Button>
            <Button type="submit" loading={save.isPending}>
              Salvar
            </Button>
          </Group>
        </Stack>
      </form>
    </Modal>
  );
}
