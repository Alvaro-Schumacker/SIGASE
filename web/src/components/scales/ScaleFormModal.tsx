import { ActionIcon, Badge, Button, Card, Group, Modal, NumberInput, ScrollArea, Select, SimpleGrid, Stack, Text, TextInput, Tooltip } from '@mantine/core';
import { IconArrowDown, IconArrowUp, IconPlus, IconSearch, IconTrash, IconX } from '@tabler/icons-react';
import { useEffect, useState } from 'react';
import { type DutyScale, MODE_HELP, MODE_LABEL, type ScaleMode, type ScaleService, SERVICE_COLOR, type ServiceColor, abbreviationOf, useSaveScale } from '../../data/scales';
import { useUnitPersonnel } from '../../data/unit';
import { notifyError, notifyOk } from '../../lib/confirm';

interface Props {
  opened: boolean;
  onClose: () => void;
  scale: DutyScale | null;
  onSaved?: (scale: DutyScale) => void;
}

const DEFAULT_SERVICES: ScaleService[] = [
  { name: 'Plantão', abbreviation: 'PLT', color: 'green', daily_slots: 1 },
  { name: 'Guarda', abbreviation: 'GDA', color: 'blue', daily_slots: 1 },
  { name: 'Vila', abbreviation: 'VIL', color: 'yellow', daily_slots: 1 },
];

export function ScaleFormModal({ opened, onClose, scale, onSaved }: Props) {
  const editing = !!scale;
  const { data: roster = [] } = useUnitPersonnel();
  const save = useSaveScale();
  const [name, setName] = useState('');
  const [mode, setMode] = useState<ScaleMode>('corrida');
  const [services, setServices] = useState<ScaleService[]>(DEFAULT_SERVICES);
  const [chosen, setChosen] = useState<number[]>([]);
  const [search, setSearch] = useState('');
  const [submitted, setSubmitted] = useState(false);

  useEffect(() => {
    if (!opened) return;
    setName(scale?.name ?? '');
    setMode(scale?.mode ?? 'corrida');
    setServices(scale?.services.map((s) => ({ ...s, abbreviation: abbreviationOf(s), color: s.color || 'green' })) ?? DEFAULT_SERVICES);
    setChosen(scale?.participants.map((p) => p.id) ?? []);
    setSearch('');
    setSubmitted(false);
  }, [opened, scale]);

  const updateService = (i: number, patch: Partial<ScaleService>) => setServices((list) => list.map((s, idx) => (idx === i ? { ...s, ...patch } : s)));
  const move = (i: number, delta: number) =>
    setChosen((list) => {
      const next = [...list];
      const j = i + delta;
      if (j < 0 || j >= next.length) return list;
      [next[i], next[j]] = [next[j], next[i]];
      return next;
    });

  const term = search.toLocaleLowerCase('pt-BR');
  const available = roster.filter((p) => !chosen.includes(p.id) && `${p.rank} ${p.war_name} ${p.full_name}`.toLocaleLowerCase('pt-BR').includes(term));
  const servicesValid = services.length > 0 && services.every((s) => s.name.trim() && s.abbreviation.trim() && s.daily_slots > 0);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitted(true);
    if (!name.trim() || !servicesValid || !chosen.length) return;
    save.mutate(
      { id: scale?.id, name: name.trim(), mode, services: services.map((s) => ({ ...s, name: s.name.trim(), abbreviation: s.abbreviation.trim() })), participants: chosen },
      {
        onSuccess: (result) => {
          notifyOk(editing ? 'Configuração atualizada.' : 'Escala criada.');
          onSaved?.(result.scale);
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
      size="xl"
      scrollAreaComponent={ScrollArea.Autosize}
      closeOnEscape={false}
      closeOnClickOutside={false}
      title={
        <div>
          <Text fw={800} size="lg">
            {editing ? 'Editar configuração' : 'Criar escala'}
          </Text>
          <Text size="sm" c="dimmed">
            Defina a regra, os serviços e os militares participantes.
          </Text>
        </div>
      }
    >
      <form onSubmit={submit}>
        <Stack gap="lg">
          <SimpleGrid cols={{ base: 1, sm: 2 }}>
            <TextInput label="Nome da escala" withAsterisk maxLength={80} placeholder="Ex.: Plantões e guardas" value={name} onChange={(e) => setName(e.currentTarget.value)} error={submitted && !name.trim() && 'Informe o nome da escala'} />
            <Select
              label="Divisão da escala"
              withAsterisk
              allowDeselect={false}
              data={(Object.keys(MODE_LABEL) as ScaleMode[]).map((m) => ({ value: m, label: MODE_LABEL[m] }))}
              value={mode}
              onChange={(v) => setMode((v as ScaleMode) ?? 'corrida')}
              description={MODE_HELP[mode] + (mode !== 'corrida' ? ' Feriados podem ser marcados como vermelhos no cabeçalho do calendário.' : '')}
            />
          </SimpleGrid>

          <Stack gap="xs">
            <Group justify="space-between">
              <Text size="sm" fw={600}>
                Serviços e vagas por dia <Text span c="red">*</Text>
              </Text>
              <Button size="xs" variant="light" leftSection={<IconPlus size={14} />} onClick={() => setServices((l) => [...l, { name: '', abbreviation: '', color: 'green', daily_slots: 1 }])}>
                Adicionar serviço
              </Button>
            </Group>
            {services.map((s, i) => (
              <Card key={i} padding="xs" radius="md" className="page-enter">
                <Group gap="xs" align="flex-end" wrap="nowrap">
                  <TextInput label="Nome" size="xs" maxLength={40} placeholder="Ex.: Cabo de dia" value={s.name} onChange={(e) => updateService(i, { name: e.currentTarget.value })} style={{ flex: 2 }} />
                  <TextInput label="Sigla" size="xs" maxLength={8} placeholder="CD" value={s.abbreviation} onChange={(e) => updateService(i, { abbreviation: e.currentTarget.value })} style={{ flex: 1 }} />
                  <Select
                    label="Cor"
                    size="xs"
                    allowDeselect={false}
                    data={(Object.keys(SERVICE_COLOR) as ServiceColor[]).map((c) => ({ value: c, label: SERVICE_COLOR[c].label }))}
                    value={s.color}
                    onChange={(v) => updateService(i, { color: (v as ServiceColor) ?? 'green' })}
                    leftSection={<span style={{ width: 10, height: 10, borderRadius: 3, background: `var(--mantine-color-${SERVICE_COLOR[s.color].mantine}-filled)` }} />}
                    style={{ flex: 1.2 }}
                  />
                  <NumberInput label="Vagas" size="xs" min={1} max={100} value={s.daily_slots} onChange={(v) => updateService(i, { daily_slots: Number(v) || 0 })} style={{ flex: 0.8 }} />
                  <ActionIcon variant="subtle" color="red" mb={2} aria-label="Remover serviço" onClick={() => setServices((l) => l.filter((_, idx) => idx !== i))}>
                    <IconTrash size={16} />
                  </ActionIcon>
                </Group>
              </Card>
            ))}
            {submitted && !servicesValid && (
              <Text size="xs" c="red">
                Informe nome, sigla e quantidade para cada serviço.
              </Text>
            )}
          </Stack>

          <SimpleGrid cols={{ base: 1, md: 2 }} spacing="md">
            <Stack gap="xs">
              <Group justify="space-between">
                <Text size="sm" fw={600}>
                  Ordem na escala <Text span c="red">*</Text>
                </Text>
                <Badge variant="light">{chosen.length} selecionados</Badge>
              </Group>
              <ScrollArea h={300} type="auto" offsetScrollbars>
                <Stack gap={4}>
                  {!chosen.length && (
                    <Text size="sm" c={submitted ? 'red' : 'dimmed'} p="sm">
                      Adicione ao menos um militar da lista ao lado.
                    </Text>
                  )}
                  {chosen.map((id, i) => {
                    const p = roster.find((r) => r.id === id) ?? scale?.participants.find((r) => r.id === id);
                    if (!p) return null;
                    return (
                      <Card key={id} padding={6} radius="md">
                        <Group gap="xs" wrap="nowrap">
                          <Badge variant="filled" circle size="lg">
                            {i + 1}
                          </Badge>
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <Text size="sm" fw={600} truncate>
                              {p.rank} {p.war_name}
                            </Text>
                          </div>
                          <ActionIcon size="sm" variant="subtle" aria-label="Subir" disabled={i === 0} onClick={() => move(i, -1)}>
                            <IconArrowUp size={14} />
                          </ActionIcon>
                          <ActionIcon size="sm" variant="subtle" aria-label="Descer" disabled={i === chosen.length - 1} onClick={() => move(i, 1)}>
                            <IconArrowDown size={14} />
                          </ActionIcon>
                          <Tooltip label="Remover da escala">
                            <ActionIcon size="sm" variant="subtle" color="red" aria-label="Remover" onClick={() => setChosen((l) => l.filter((x) => x !== id))}>
                              <IconX size={14} />
                            </ActionIcon>
                          </Tooltip>
                        </Group>
                      </Card>
                    );
                  })}
                </Stack>
              </ScrollArea>
            </Stack>
            <Stack gap="xs">
              <Text size="sm" fw={600}>
                Efetivo disponível
              </Text>
              <TextInput size="xs" placeholder="Filtrar por nome, guerra ou posto…" leftSection={<IconSearch size={14} />} value={search} onChange={(e) => setSearch(e.currentTarget.value)} />
              <ScrollArea h={262} type="auto" offsetScrollbars>
                <Stack gap={4}>
                  {available.map((p) => (
                    <Card key={p.id} padding={6} radius="md" className="lift-card clickable-row" onClick={() => setChosen((l) => [...l, p.id])}>
                      <Group gap="xs" wrap="nowrap">
                        <ActionIcon size="sm" variant="light" aria-label="Adicionar">
                          <IconPlus size={14} />
                        </ActionIcon>
                        <div style={{ minWidth: 0 }}>
                          <Text size="sm" fw={600} truncate>
                            {p.rank} {p.war_name}
                          </Text>
                          <Text size="xs" c="dimmed" truncate>
                            {p.full_name}
                          </Text>
                        </div>
                      </Group>
                    </Card>
                  ))}
                  {!available.length && (
                    <Text size="sm" c="dimmed" p="sm">
                      Ninguém para adicionar.
                    </Text>
                  )}
                </Stack>
              </ScrollArea>
            </Stack>
          </SimpleGrid>

          <Group justify="flex-end">
            <Button variant="default" onClick={onClose}>
              Cancelar
            </Button>
            <Button type="submit" loading={save.isPending}>
              {editing ? 'Salvar configuração' : 'Criar escala'}
            </Button>
          </Group>
        </Stack>
      </form>
    </Modal>
  );
}
