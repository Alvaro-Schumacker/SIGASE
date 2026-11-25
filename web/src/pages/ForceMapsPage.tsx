import { ActionIcon, Badge, Button, Card, Group, Menu, Modal, ScrollArea, Select, SimpleGrid, Skeleton, Stack, Table, Text, TextInput, ThemeIcon } from '@mantine/core';
import { DateInput } from '@mantine/dates';
import { useDisclosure } from '@mantine/hooks';
import { IconDots, IconEdit, IconEye, IconMap2, IconPlus, IconPrinter, IconTrash } from '@tabler/icons-react';
import { useQueryClient } from '@tanstack/react-query';
import dayjs from 'dayjs';
import { useEffect, useRef, useState } from 'react';
import { useCurrentUser } from '../api';
import { EmptyState } from '../components/EmptyState';
import { PageHeader } from '../components/PageHeader';
import { PaperPreview } from '../components/PaperPreview';
import { type ForceMap, type ForceRow, OBSERVATIONS, forceMapPaper, forceName, sortForceRows, useForceMaps, useSaveForceMap } from '../data/forceMaps';
import { useUnitPersonnel } from '../data/unit';
import { confirmDelete, notifyError, notifyOk } from '../lib/confirm';
import { fmtDate } from '../lib/format';
import { printPaper } from '../lib/print';

export function ForceMapsPage() {
  const me = useCurrentUser();
  const qc = useQueryClient();
  const { data: maps = [], isLoading } = useForceMaps();
  const [viewing, setViewing] = useState<ForceMap | null>(null);
  const [editing, setEditing] = useState<ForceMap | null>(null);
  const [formOpen, form] = useDisclosure();

  const openForm = (m: ForceMap | null) => {
    setViewing(null);
    setEditing(m);
    form.open();
  };
  const remove = (m: ForceMap) => confirmDelete({ label: 'Mapa da Força', path: `/api/force-maps/${m.id}`, qc, invalidate: [['force-maps']], onDone: () => setViewing(null) });
  const sorted = [...maps].sort((a, b) => b.activity_date.localeCompare(a.activity_date) || b.id - a.id);

  return (
    <>
      <PageHeader
        title="Mapas da força"
        subtitle="Controle de presença por atividade, integrado ao efetivo da unidade"
        actions={
          me.canEditForceMaps && (
            <Button leftSection={<IconPlus size={18} />} onClick={() => openForm(null)}>
              Novo mapa
            </Button>
          )
        }
      />
      {isLoading && (
        <SimpleGrid cols={{ base: 1, sm: 2, lg: 3 }}>
          {Array.from({ length: 3 }, (_, i) => (
            <Skeleton key={i} h={110} radius="lg" />
          ))}
        </SimpleGrid>
      )}
      {!isLoading && !maps.length && <EmptyState title="Nenhum mapa salvo" description="Crie um mapa para a atividade e registre as observações do efetivo." icon={<IconMap2 size={26} />} />}
      <SimpleGrid cols={{ base: 1, sm: 2, lg: 3 }} spacing="md" className="stagger">
        {sorted.map((m) => {
          const absent = m.data.rows.filter((r) => r.observation).length;
          return (
            <Card key={m.id} className="lift-card clickable-row" onClick={() => setViewing(m)}>
              <Group justify="space-between" align="flex-start" wrap="nowrap">
                <Group gap="sm" wrap="nowrap">
                  <ThemeIcon size={46} radius="md" variant="light">
                    <IconMap2 size={24} />
                  </ThemeIcon>
                  <div>
                    <Text fw={700}>Mapa da Força - 3ªBO</Text>
                    <Text size="sm" c="dimmed">
                      {fmtDate(m.activity_date)}
                    </Text>
                  </div>
                </Group>
                <Menu position="bottom-end" withinPortal>
                  <Menu.Target>
                    <ActionIcon variant="subtle" color="gray" aria-label="Ações" onClick={(e) => e.stopPropagation()}>
                      <IconDots size={18} />
                    </ActionIcon>
                  </Menu.Target>
                  <Menu.Dropdown onClick={(e) => e.stopPropagation()}>
                    <Menu.Item leftSection={<IconEye size={16} />} onClick={() => setViewing(m)}>
                      Visualizar
                    </Menu.Item>
                    <Menu.Item leftSection={<IconPrinter size={16} />} onClick={() => printPaper(forceMapPaper(m))}>
                      Imprimir / PDF
                    </Menu.Item>
                    {me.canEditForceMaps && (
                      <>
                        <Menu.Item leftSection={<IconEdit size={16} />} onClick={() => openForm(m)}>
                          Editar
                        </Menu.Item>
                        <Menu.Item color="red" leftSection={<IconTrash size={16} />} onClick={() => remove(m)}>
                          Excluir
                        </Menu.Item>
                      </>
                    )}
                  </Menu.Dropdown>
                </Menu>
              </Group>
              <Group gap={6} mt="md">
                <Badge variant="light" color="gray">
                  {m.data.rows.length} militares
                </Badge>
                <Badge variant="light" color="sigase">
                  {m.data.rows.length - absent} presentes
                </Badge>
                {absent > 0 && (
                  <Badge variant="light" color="brass">
                    {absent} com observação
                  </Badge>
                )}
              </Group>
            </Card>
          );
        })}
      </SimpleGrid>

      <Modal
        opened={!!viewing}
        onClose={() => setViewing(null)}
        size="auto"
        title={
          <div>
            <Text size="xs" fw={700} c="sigase" tt="uppercase" style={{ letterSpacing: 1.2 }}>
              Mapa da Força · {viewing ? fmtDate(viewing.activity_date) : ''}
            </Text>
            <Text fw={800} size="lg">
              Mapa arquivado
            </Text>
          </div>
        }
      >
        {viewing && (
          <Stack w={{ base: '92vw', md: 860 }} maw="100%">
            <PaperPreview paper={forceMapPaper(viewing)} height="calc(100vh - 230px)" />
            <Group justify="space-between">
              {me.canEditForceMaps ? (
                <Button variant="subtle" color="red" leftSection={<IconTrash size={16} />} onClick={() => remove(viewing)}>
                  Excluir
                </Button>
              ) : (
                <span />
              )}
              <Group gap="xs">
                {me.canEditForceMaps && (
                  <Button variant="default" leftSection={<IconEdit size={16} />} onClick={() => openForm(viewing)}>
                    Editar
                  </Button>
                )}
                <Button leftSection={<IconPrinter size={16} />} onClick={() => printPaper(forceMapPaper(viewing))}>
                  Imprimir / PDF
                </Button>
              </Group>
            </Group>
          </Stack>
        )}
      </Modal>

      <ForceMapForm opened={formOpen} onClose={form.close} map={editing} />
    </>
  );
}

function ForceMapForm({ opened, onClose, map }: { opened: boolean; onClose: () => void; map: ForceMap | null }) {
  const { data: roster = [] } = useUnitPersonnel();
  const save = useSaveForceMap();
  const [date, setDate] = useState<string | null>(null);
  const [rows, setRows] = useState<ForceRow[]>([]);

  // Inicializa uma única vez por abertura (recarregar o efetivo não apaga o que já foi marcado).
  const initialized = useRef(false);
  useEffect(() => {
    if (!opened) {
      initialized.current = false;
      return;
    }
    if (initialized.current || (!map && !roster.length)) return;
    initialized.current = true;
    setDate(map?.activity_date ?? dayjs().format('YYYY-MM-DD'));
    setRows(
      sortForceRows(
        map?.data.rows ??
          roster.map((p) => ({ person_id: p.id, rank: p.rank, war_name: p.war_name, military_number: p.military_number, seniority_order: Number(p.seniority_order) || 9999, observation: '', other_text: '' })),
      ),
    );
  }, [opened, map, roster]);

  const update = (i: number, patch: Partial<ForceRow>) => setRows((list) => list.map((r, idx) => (idx === i ? { ...r, ...patch } : r)));
  const middle = Math.ceil(rows.length / 2);

  const submit = () => {
    if (!date) return notifyError(new Error('Informe a data da atividade.'), 'Campo obrigatório');
    save.mutate(
      { id: map?.id, activity_date: dayjs(date).format('YYYY-MM-DD'), rows: rows.map((r) => ({ ...r, other_text: r.other_text.trim() })) },
      {
        onSuccess: () => {
          notifyOk(map ? 'Mapa da Força atualizado.' : 'Mapa da Força salvo.');
          onClose();
        },
        onError: (e) => notifyError(e),
      },
    );
  };

  const column = (list: ForceRow[], offset: number) => (
    <Table withTableBorder withColumnBorders verticalSpacing={4} horizontalSpacing={6} fz="xs">
      <Table.Thead>
        <Table.Tr>
          <Table.Th w={36}>Ord</Table.Th>
          <Table.Th>P/G · Nome de guerra</Table.Th>
          <Table.Th w={170}>Obs</Table.Th>
        </Table.Tr>
      </Table.Thead>
      <Table.Tbody>
        {list.map((r, i) => (
          <Table.Tr key={r.person_id} bg={r.observation ? 'var(--mantine-color-brass-light)' : undefined}>
            <Table.Td ta="center">{offset + i + 1}</Table.Td>
            <Table.Td fw={600}>{forceName(r)}</Table.Td>
            <Table.Td>
              <Select
                size="xs"
                allowDeselect={false}
                data={OBSERVATIONS.map((o) => ({ value: o, label: o || 'Presente' }))}
                value={r.observation}
                onChange={(v) => update(offset + i, { observation: v ?? '' })}
                comboboxProps={{ withinPortal: true }}
              />
              {r.observation === 'Outros' && <TextInput size="xs" mt={4} maxLength={80} placeholder="Descreva" value={r.other_text} onChange={(e) => update(offset + i, { other_text: e.currentTarget.value })} />}
            </Table.Td>
          </Table.Tr>
        ))}
      </Table.Tbody>
    </Table>
  );

  return (
    <Modal
      opened={opened}
      onClose={onClose}
      size="90rem"
      closeOnEscape={false}
      closeOnClickOutside={false}
      scrollAreaComponent={ScrollArea.Autosize}
      title={
        <div>
          <Text size="xs" fw={700} c="sigase" tt="uppercase" style={{ letterSpacing: 1.2 }}>
            Controle de presença
          </Text>
          <Text fw={800} size="lg">
            {map ? 'Editar' : 'Novo'} Mapa da Força - 3ªBO
          </Text>
        </div>
      }
    >
      <Stack gap="md">
        <Group align="flex-end" justify="space-between">
          <DateInput label="Data da atividade" withAsterisk valueFormat="DD/MM/YYYY" value={date} onChange={setDate} w={220} />
          <Text size="xs" c="dimmed" maw={460}>
            Deixe “Presente” para marcar um X à caneta. Em “Outros”, descreva a observação. A lista vem das fichas atuais do efetivo.
          </Text>
        </Group>
        <SimpleGrid cols={{ base: 1, md: 2 }} spacing="md">
          {column(rows.slice(0, middle), 0)}
          {column(rows.slice(middle), middle)}
        </SimpleGrid>
        <Group justify="flex-end">
          <Button variant="default" onClick={onClose}>
            Cancelar
          </Button>
          <Button onClick={submit} loading={save.isPending}>
            {map ? 'Salvar alterações' : 'Salvar mapa'}
          </Button>
        </Group>
      </Stack>
    </Modal>
  );
}
