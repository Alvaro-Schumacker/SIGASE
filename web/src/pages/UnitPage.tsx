import { ActionIcon, Alert, Badge, Button, Card, Drawer, Group, Menu, SimpleGrid, Skeleton, Stack, Table, Text, TextInput, ThemeIcon, Title, Tooltip } from '@mantine/core';
import { useDebouncedValue, useDisclosure, useMediaQuery } from '@mantine/hooks';
import { IconAlertTriangle, IconDots, IconEdit, IconEye, IconFileSpreadsheet, IconPlus, IconSearch, IconTrash, IconUsersGroup } from '@tabler/icons-react';
import { useQueryClient } from '@tanstack/react-query';
import { useMemo, useState } from 'react';
import { useCurrentUser } from '../api';
import { EmptyState } from '../components/EmptyState';
import { PageHeader } from '../components/PageHeader';
import { UnitImportModal } from '../components/UnitImportModal';
import { UnitPersonForm } from '../components/UnitPersonForm';
import { identity, missingFields, type UnitPerson, UNIT_RANKS, useUnitPersonnel } from '../data/unit';
import { confirmDelete } from '../lib/confirm';
import { fmtDate } from '../lib/format';

export function UnitPage() {
  const me = useCurrentUser();
  const qc = useQueryClient();
  const { data: roster = [], isLoading } = useUnitPersonnel();
  const [search, setSearch] = useState('');
  const [debounced] = useDebouncedValue(search, 150);
  const [viewing, setViewing] = useState<UnitPerson | null>(null);
  const [editing, setEditing] = useState<UnitPerson | null>(null);
  const [formOpen, form] = useDisclosure();
  const [importOpen, importer] = useDisclosure();
  const mobile = useMediaQuery('(max-width: 48em)');

  const rows = useMemo(() => {
    const term = debounced.toLocaleLowerCase('pt-BR');
    return roster.filter((p) => Object.values(p).join(' ').toLocaleLowerCase('pt-BR').includes(term));
  }, [roster, debounced]);

  const byRank = useMemo(() => {
    const counts = new Map<string, number>();
    for (const p of roster) counts.set(p.rank, (counts.get(p.rank) ?? 0) + 1);
    return UNIT_RANKS.filter(([r]) => counts.has(r)).map(([r]) => ({ rank: r, count: counts.get(r)! }));
  }, [roster]);
  const incomplete = roster.filter((p) => missingFields(p).length).length;

  const openEdit = (p: UnitPerson | null) => {
    setViewing(null);
    setEditing(p);
    form.open();
  };
  const remove = (p: UnitPerson) =>
    confirmDelete({
      label: 'ficha do efetivo',
      feminine: true,
      path: `/api/unit-personnel/${p.id}`,
      qc,
      invalidate: [['unit-personnel'], ['vacation-plan'], ['service-scales'], ['notices']],
      message: 'Excluir esta ficha do efetivo? Os períodos de férias associados e a participação desta pessoa nas escalas também serão removidos.',
      onDone: () => setViewing(null),
    });

  const actions = (p: UnitPerson) => (
    <Menu position="bottom-end" withinPortal shadow="md">
      <Menu.Target>
        <ActionIcon variant="subtle" color="gray" aria-label="Ações" onClick={(e) => e.stopPropagation()}>
          <IconDots size={18} />
        </ActionIcon>
      </Menu.Target>
      <Menu.Dropdown onClick={(e) => e.stopPropagation()}>
        <Menu.Item leftSection={<IconEye size={16} />} onClick={() => setViewing(p)}>
          Ver ficha
        </Menu.Item>
        {me.canEditPersonnel && (
          <>
            <Menu.Item leftSection={<IconEdit size={16} />} onClick={() => openEdit(p)}>
              Editar
            </Menu.Item>
            <Menu.Item leftSection={<IconTrash size={16} />} color="red" onClick={() => remove(p)}>
              Excluir
            </Menu.Item>
          </>
        )}
      </Menu.Dropdown>
    </Menu>
  );

  const incompleteMark = (p: UnitPerson) => {
    const missing = missingFields(p).length;
    return missing ? (
      <Tooltip label={`Ficha incompleta · ${missing} campos sem preenchimento`}>
        <ThemeIcon size={18} radius="xl" color="brass" variant="light">
          <IconAlertTriangle size={12} />
        </ThemeIcon>
      </Tooltip>
    ) : null;
  };

  return (
    <>
      <PageHeader
        title="Dados da Unidade"
        subtitle={me.canEditPersonnel ? 'Efetivo da unidade · edição habilitada para este perfil.' : 'Efetivo da unidade · acesso somente para visualização.'}
        actions={
          me.canEditPersonnel && (
            <Group gap="xs">
              <Button variant="default" leftSection={<IconFileSpreadsheet size={18} />} onClick={importer.open}>
                Importar planilha
              </Button>
              <Button leftSection={<IconPlus size={18} />} onClick={() => openEdit(null)}>
                Adicionar pessoa
              </Button>
            </Group>
          )
        }
      />

      <SimpleGrid cols={{ base: 2, sm: 4 }} mb="lg" className="stagger">
        <Card padding="md">
          <Text size="xs" c="dimmed" fw={600}>
            Efetivo total
          </Text>
          <Text fz={28} fw={800} ff="heading">
            {roster.length}
          </Text>
        </Card>
        <Card padding="md">
          <Text size="xs" c="dimmed" fw={600}>
            Fichas incompletas
          </Text>
          <Text fz={28} fw={800} ff="heading" c={incomplete ? 'brass.7' : undefined}>
            {incomplete}
          </Text>
        </Card>
        <Card padding="md" style={{ gridColumn: 'span 2' }}>
          <Text size="xs" c="dimmed" fw={600} mb={6}>
            Por posto/graduação
          </Text>
          <Group gap={6}>
            {byRank.map((r) => (
              <Badge key={r.rank} variant="light" tt="none">
                {r.rank} · {r.count}
              </Badge>
            ))}
          </Group>
        </Card>
      </SimpleGrid>

      <Card p={0}>
        <Group p="md" justify="space-between">
          <TextInput
            placeholder="Buscar por nome, guerra, P/G, QM ou seção…"
            leftSection={<IconSearch size={16} />}
            value={search}
            onChange={(e) => setSearch(e.currentTarget.value)}
            style={{ flex: '1 1 280px', maxWidth: 460 }}
          />
          <Text size="sm" c="dimmed">
            {rows.length} de {roster.length} pessoas
          </Text>
        </Group>

        {isLoading && (
          <Stack p="md" pt={0} gap="xs">
            {Array.from({ length: 6 }, (_, i) => (
              <Skeleton key={i} h={44} />
            ))}
          </Stack>
        )}
        {!isLoading && !rows.length && <EmptyState title="Nenhuma ficha encontrada" icon={<IconUsersGroup size={26} />} />}

        {!isLoading && !!rows.length && mobile && (
          <Stack p="md" pt={0} gap="xs">
            {rows.map((p) => (
              <Card key={p.id} padding="sm" radius="md" onClick={() => setViewing(p)} className="clickable-row">
                <Group justify="space-between" wrap="nowrap">
                  <div style={{ minWidth: 0 }}>
                    <Group gap={6}>
                      <Text fw={700} size="sm">
                        {identity(p)}
                      </Text>
                      {incompleteMark(p)}
                    </Group>
                    <Text size="xs" c="dimmed" truncate>
                      {p.full_name}
                    </Text>
                  </div>
                  {actions(p)}
                </Group>
              </Card>
            ))}
          </Stack>
        )}

        {!isLoading && !!rows.length && !mobile && (
          <Table.ScrollContainer minWidth={820}>
            <Table highlightOnHover verticalSpacing="sm" horizontalSpacing="md">
              <Table.Thead>
                <Table.Tr>
                  <Table.Th>Militar</Table.Th>
                  <Table.Th>Antiguidade · QM</Table.Th>
                  <Table.Th>Idade</Table.Th>
                  <Table.Th>Nascimento</Table.Th>
                  <Table.Th>Seção</Table.Th>
                  <Table.Th w={48} />
                </Table.Tr>
              </Table.Thead>
              <Table.Tbody>
                {rows.map((p) => (
                  <Table.Tr key={p.id} className="clickable-row" onClick={() => setViewing(p)}>
                    <Table.Td>
                      <Group gap={6} wrap="nowrap">
                        <Text fw={700} size="sm">
                          {identity(p)}
                        </Text>
                        {incompleteMark(p)}
                      </Group>
                      <Text size="xs" c="dimmed">
                        {p.full_name}
                      </Text>
                    </Table.Td>
                    <Table.Td>
                      <Text size="xs" c="dimmed">
                        {p.seniority_order ? `${p.seniority_order}º` : '—'} · {p.qm || 'QM não informada'}
                      </Text>
                    </Table.Td>
                    <Table.Td>
                      <Text size="sm">{p.age == null ? '—' : `${p.age} anos`}</Text>
                    </Table.Td>
                    <Table.Td>
                      <Text size="sm">{p.birth_date ? fmtDate(p.birth_date) : '—'}</Text>
                    </Table.Td>
                    <Table.Td>
                      <Text size="sm">{p.section || '—'}</Text>
                    </Table.Td>
                    <Table.Td>{actions(p)}</Table.Td>
                  </Table.Tr>
                ))}
              </Table.Tbody>
            </Table>
          </Table.ScrollContainer>
        )}
      </Card>

      <PersonDrawer person={viewing} onClose={() => setViewing(null)} onEdit={me.canEditPersonnel ? openEdit : undefined} onDelete={me.canEditPersonnel ? remove : undefined} />
      <UnitPersonForm opened={formOpen} onClose={form.close} person={editing} />
      {me.canEditPersonnel && <UnitImportModal opened={importOpen} onClose={importer.close} />}
    </>
  );
}

const DETAIL_SECTIONS: [string, [string, keyof UnitPerson][]][] = [
  ['Identificação e vínculo', [['Posto/graduação', 'rank'], ['Número militar', 'military_number'], ['Antiguidade na graduação', 'seniority_order'], ['QM', 'qm'], ['Seção', 'section'], ['IDT militar', 'military_id'], ['IDT civil', 'civil_id'], ['Prec-CP', 'prec_cp']]],
  ['Dados pessoais', [['Data de nascimento', 'birth_date'], ['Idade', 'age'], ['CPF', 'cpf'], ['Tipo sanguíneo', 'blood_type'], ['E-mail', 'email'], ['Religião', 'religion']]],
  ['Contato e origem', [['Endereço', 'address'], ['Telefone', 'phone'], ['Cidade natal', 'birth_city'], ['Filiação · mãe', 'mother_name'], ['Filiação · pai', 'father_name']]],
  ['Formação e observações', [['CNH', 'cnh'], ['Escolaridade', 'education'], ['Observações', 'additional_data']]],
];

function PersonDrawer({ person, onClose, onEdit, onDelete }: { person: UnitPerson | null; onClose: () => void; onEdit?: (p: UnitPerson) => void; onDelete?: (p: UnitPerson) => void }) {
  const value = (p: UnitPerson, key: keyof UnitPerson) => {
    if (key === 'age') return p.age == null ? '' : `${p.age} anos`;
    if (key === 'birth_date') return p.birth_date ? fmtDate(p.birth_date) : '';
    if (key === 'seniority_order') return p.seniority_order ? `${p.seniority_order}º` : '';
    return String(p[key] ?? '');
  };
  const missing = person ? missingFields(person).length : 0;
  return (
    <Drawer opened={!!person} onClose={onClose} position="right" size="lg" title={<Text fw={700}>Ficha do efetivo</Text>}>
      {person && (
        <Stack gap="lg">
          <div>
            <Title order={3}>{identity(person)}</Title>
            <Text c="dimmed">{person.full_name}</Text>
          </div>
          {missing > 0 && (
            <Alert color="brass" variant="light" icon={<IconAlertTriangle size={18} />} title="Ficha incompleta">
              {missing} campos ainda não foram preenchidos.
            </Alert>
          )}
          {DETAIL_SECTIONS.map(([title, fields]) => (
            <div key={title}>
              <Text size="xs" fw={700} c="dimmed" tt="uppercase" mb="xs" style={{ letterSpacing: 1.1 }}>
                {title}
              </Text>
              <SimpleGrid cols={2} spacing="sm" verticalSpacing="sm">
                {fields.map(([label, key]) => {
                  const v = value(person, key);
                  return (
                    <div key={key} style={key === 'address' || key === 'additional_data' ? { gridColumn: 'span 2' } : undefined}>
                      <Text size="xs" c="dimmed">
                        {label}
                      </Text>
                      <Text size="sm" fw={v ? 600 : 400} c={v ? undefined : 'dimmed'} fs={v ? undefined : 'italic'}>
                        {v || 'Não informado'}
                      </Text>
                    </div>
                  );
                })}
              </SimpleGrid>
            </div>
          ))}
          {(onEdit || onDelete) && (
            <Group justify="space-between" mt="sm">
              {onDelete ? (
                <Button variant="subtle" color="red" leftSection={<IconTrash size={16} />} onClick={() => onDelete(person)}>
                  Excluir
                </Button>
              ) : (
                <span />
              )}
              {onEdit && (
                <Button leftSection={<IconEdit size={16} />} onClick={() => onEdit(person)}>
                  Editar ficha
                </Button>
              )}
            </Group>
          )}
        </Stack>
      )}
    </Drawer>
  );
}
