import { ActionIcon, Alert, Badge, Button, Checkbox, Chip, Collapse, Group, Loader, Modal, ScrollArea, SegmentedControl, Select, Stack, Table, Text, TextInput, ThemeIcon, Tooltip } from '@mantine/core';
import { IconAlertTriangle, IconChevronDown, IconChevronRight, IconCircleCheck, IconCircleX, IconFileSpreadsheet, IconInfoCircle, IconRefresh, IconUpload } from '@tabler/icons-react';
import { useQueryClient } from '@tanstack/react-query';
import { type DragEvent, Fragment, useMemo, useRef, useState } from 'react';
import { ApiError, api } from '../api';
import { UNIT_RANKS, identity, sortUnit, useUnitPersonnel } from '../data/unit';
import { FIELD_LABEL, type PersonRow, type SheetSummary, checkPeople, matchRoster, parsePeople } from '../data/unitImport';
import { notifyOk } from '../lib/confirm';
import { readXlsx } from '../lib/xlsx';

interface Props {
  opened: boolean;
  onClose: () => void;
}

const NEW = '__novo__';
const MATCH_LABEL: Record<PersonRow['match'], string> = { cpf: 'pelo CPF', idt: 'pela identidade', nome: 'pelo nome', aproximado: 'nome parecido', manual: 'escolhido', novo: '' };
const show = (field: string, value: string) => (field === 'birth_date' && /^\d{4}-\d{2}-\d{2}$/.test(value) ? value.split('-').reverse().join('/') : value);

/** Importa os dados da bateria (planilha .xlsx): lê, liga cada linha ao efetivo, mostra o que muda e grava tudo de uma vez. */
export function UnitImportModal({ opened, onClose }: Props) {
  const qc = useQueryClient();
  const { data: roster = [] } = useUnitPersonnel();
  const input = useRef<HTMLInputElement>(null);
  const [fileName, setFileName] = useState('');
  const [rows, setRows] = useState<PersonRow[]>([]);
  const [sheets, setSheets] = useState<SheetSummary[]>([]);
  const [enabled, setEnabled] = useState<string[]>([]);
  const [open, setOpen] = useState<Record<string, boolean>>({});
  const [reading, setReading] = useState(false);
  const [readError, setReadError] = useState('');
  const [serverErrors, setServerErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [filter, setFilter] = useState('todos');
  const [dragging, setDragging] = useState(false);

  const targets = useMemo(() => [{ value: NEW, label: '➕ Novo cadastro' }, ...sortUnit(roster).map((p) => ({ value: String(p.id), label: `${identity(p)} · ${p.full_name}` }))], [roster]);
  // Linhas de abas desmarcadas ficam fora da importação.
  const effective = useMemo(() => rows.map((r) => ({ ...r, include: r.include && enabled.includes(r.sheet) })), [rows, enabled]);
  const checks = useMemo(() => checkPeople(effective, roster), [effective, roster]);

  const reset = () => {
    setRows([]);
    setSheets([]);
    setEnabled([]);
    setOpen({});
    setFileName('');
    setReadError('');
    setServerErrors({});
    setFilter('todos');
  };
  const close = () => {
    reset();
    onClose();
  };

  const load = async (file?: File | null) => {
    if (!file) return;
    if (!/\.xlsx$/i.test(file.name)) {
      setReadError('Escolha um arquivo .xlsx (Excel). Se a planilha estiver em .xls, salve como .xlsx antes.');
      return;
    }
    setReading(true);
    setReadError('');
    setServerErrors({});
    try {
      const parsed = parsePeople(await readXlsx(file));
      if (!parsed.rows.length) throw new Error('Não encontrei militares. A planilha precisa ter uma coluna “NOME” ou “NOME COMPLETO”.');
      setRows(matchRoster(parsed.rows, roster));
      setSheets(parsed.sheets);
      setEnabled(parsed.sheets.filter((s) => s.suggested).map((s) => s.name));
      setFileName(file.name);
    } catch (error) {
      setReadError((error as Error).message || 'Não foi possível ler a planilha.');
    } finally {
      setReading(false);
      if (input.current) input.current.value = '';
    }
  };

  const update = (key: string, patch: Partial<PersonRow>) => {
    setServerErrors({});
    setRows((list) => list.map((r) => (r.key === key ? { ...r, ...patch } : r)));
  };

  const active = effective.filter((r) => r.include);
  const toSave = active.filter((r) => checks.get(r.key)?.status !== 'igual');
  const counts = {
    novos: active.filter((r) => checks.get(r.key)?.status === 'novo').length,
    atualizar: active.filter((r) => checks.get(r.key)?.status === 'atualizar').length,
    iguais: active.filter((r) => checks.get(r.key)?.status === 'igual').length,
    erros: active.filter((r) => checks.get(r.key)?.errors.length || serverErrors[r.key]).length,
    avisos: active.filter((r) => !checks.get(r.key)?.errors.length && (checks.get(r.key)?.warnings.length || checks.get(r.key)?.changes.some((c) => c.kind === 'diff'))).length,
    fora: effective.filter((r) => enabled.includes(r.sheet) && !r.include).length,
  };
  const visible = effective.filter((r) => {
    if (!enabled.includes(r.sheet)) return false;
    const c = checks.get(r.key);
    if (filter === 'conferir') return r.include && (c?.errors.length || c?.warnings.length || serverErrors[r.key] || c?.changes.some((x) => x.kind === 'diff'));
    if (filter === 'fora') return !r.include;
    return true;
  });

  const submit = async () => {
    const batch = toSave.map((r) => ({ key: r.key, record: checks.get(r.key)?.record }));
    if (!batch.length || batch.some((b) => !b.record)) return;
    setSaving(true);
    setServerErrors({});
    try {
      const result = await api<{ created: number; updated: number }>('/api/unit-personnel/import', { method: 'POST', body: { people: batch.map((b) => b.record) } });
      await qc.invalidateQueries({ queryKey: ['unit-personnel'] });
      notifyOk(`Dados da bateria importados: ${result.created} novo(s) cadastro(s) e ${result.updated} atualização(ões).`);
      close();
    } catch (error) {
      if (error instanceof ApiError && Array.isArray(error.data.errors)) {
        const mapped: Record<string, string> = {};
        for (const e of error.data.errors as { index: number; error: string }[]) if (batch[e.index]) mapped[batch[e.index].key] = e.error;
        setServerErrors(mapped);
        setFilter('conferir');
      } else setServerErrors({ __geral: (error as Error).message });
    } finally {
      setSaving(false);
    }
  };

  const drop = (e: DragEvent) => {
    e.preventDefault();
    setDragging(false);
    load(e.dataTransfer.files?.[0]);
  };

  const messages = (r: PersonRow) => {
    const c = checks.get(r.key);
    if (!r.include) return <Badge size="sm" variant="light" color="gray">Fora da importação</Badge>;
    const errors = [...(c?.errors ?? []), ...(serverErrors[r.key] ? [serverErrors[r.key]] : [])];
    const line = (text: string, color: string, Icon: typeof IconCircleX) => (
      <Group key={text} gap={4} wrap="nowrap" align="flex-start">
        <Icon size={14} color={`var(--mantine-color-${color}-6)`} style={{ flexShrink: 0, marginTop: 2 }} />
        <Text size="xs" c={`${color}.8`}>
          {text}
        </Text>
      </Group>
    );
    if (errors.length) return <Stack gap={2}>{errors.map((e) => line(e, 'red', IconCircleX))}</Stack>;
    const diffs = c?.changes.filter((x) => x.kind === 'diff' && !x.applied).length ?? 0;
    const warnings = [...(c?.warnings ?? []), ...(diffs ? [`${diffs} dado(s) diferente(s) do SIGASE mantido(s): veja os detalhes.`] : [])];
    if (warnings.length) return <Stack gap={2}>{warnings.map((w) => line(w, 'orange', IconAlertTriangle))}</Stack>;
    return (
      <Group gap={4} wrap="nowrap">
        <IconCircleCheck size={14} color="var(--mantine-color-sigase-6)" />
        <Text size="xs" c="dimmed">
          Pronto
        </Text>
      </Group>
    );
  };

  const changeSummary = (r: PersonRow) => {
    const c = checks.get(r.key);
    if (!c) return null;
    if (c.status === 'novo') return <Badge size="sm" variant="light" color="sigase" tt="none">Novo · {Object.keys(r.values).length + 3} campos</Badge>;
    const fill = c.changes.filter((x) => x.kind !== 'diff').length;
    const diff = c.changes.filter((x) => x.kind === 'diff');
    if (!fill && !diff.length) return <Badge size="sm" variant="light" color="gray" tt="none">Sem alterações</Badge>;
    return (
      <Group gap={4}>
        {!!fill && <Badge size="sm" variant="light" color="blue" tt="none">Preenche {fill}</Badge>}
        {!!diff.length && <Badge size="sm" variant="light" color="orange" tt="none">{diff.filter((d) => d.applied).length}/{diff.length} diferentes</Badge>}
      </Group>
    );
  };

  let lastSheet = '';
  return (
    <Modal opened={opened} onClose={close} size="min(1320px, 97vw)" closeOnEscape={false} closeOnClickOutside={false} title={<Text fw={800}>Importar dados da bateria</Text>}>
      {!rows.length ? (
        <Stack>
          <div
            className={`import-drop${dragging ? ' is-dragging' : ''}`}
            onDragOver={(e) => {
              e.preventDefault();
              setDragging(true);
            }}
            onDragLeave={() => setDragging(false)}
            onDrop={drop}
            onClick={() => input.current?.click()}
            role="button"
            tabIndex={0}
            onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && input.current?.click()}
          >
            {reading ? (
              <Loader />
            ) : (
              <>
                <ThemeIcon size={54} radius="xl" variant="light">
                  <IconFileSpreadsheet size={30} />
                </ThemeIcon>
                <Text fw={700}>Arraste a planilha aqui ou clique para escolher</Text>
                <Text size="sm" c="dimmed">
                  Arquivo .xlsx com os dados do efetivo (uma ou mais abas)
                </Text>
                <Button mt="xs" leftSection={<IconUpload size={16} />} variant="light">
                  Escolher arquivo
                </Button>
              </>
            )}
          </div>
          <input ref={input} type="file" accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" hidden onChange={(e) => load(e.currentTarget.files?.[0])} data-testid="unit-import-file" />
          {readError && (
            <Alert color="red" variant="light" icon={<IconCircleX size={18} />}>
              {readError}
            </Alert>
          )}
          <Alert color="gray" variant="light" icon={<IconInfoCircle size={18} />}>
            <Text size="sm">
              A planilha é lida no seu computador e nada é gravado antes da sua conferência. Para quem já está no SIGASE, campos vazios são preenchidos e dados diferentes só são trocados se você marcar. Colunas que o SIGASE não tem (RA, banco, agência, título...) são ignoradas.
            </Text>
          </Alert>
        </Stack>
      ) : (
        <Stack gap="sm">
          <Group justify="space-between" wrap="wrap" gap="sm">
            <Group gap="xs">
              <IconFileSpreadsheet size={18} color="var(--mantine-color-sigase-6)" />
              <Text fw={700} size="sm">
                {fileName}
              </Text>
              <Tooltip label="Escolher outra planilha">
                <ActionIcon variant="subtle" onClick={reset} aria-label="Escolher outra planilha">
                  <IconRefresh size={16} />
                </ActionIcon>
              </Tooltip>
            </Group>
            <SegmentedControl
              size="xs"
              value={filter}
              onChange={setFilter}
              data={[
                { value: 'todos', label: 'Todos' },
                { value: 'conferir', label: `Para conferir (${counts.erros + counts.avisos})` },
                { value: 'fora', label: `Fora (${counts.fora})` },
              ]}
            />
          </Group>
          <Group gap="xs" align="center">
            <Text size="xs" fw={700} c="dimmed">
              Abas:
            </Text>
            <Chip.Group multiple value={enabled} onChange={setEnabled}>
              {sheets.map((s) => (
                <Chip key={s.name} value={s.name} size="xs" variant="light">
                  {s.name} ({s.rows})
                </Chip>
              ))}
            </Chip.Group>
            {sheets.some((s) => !s.suggested) && (
              <Text size="xs" c="dimmed">
                Abas com nome genérico (ex.: “Plan1”) começam desmarcadas por parecerem listas antigas.
              </Text>
            )}
          </Group>
          <Group gap="xs">
            <Badge variant="light" color="sigase" tt="none">{counts.novos} novos</Badge>
            <Badge variant="light" color="blue" tt="none">{counts.atualizar} atualizações</Badge>
            <Badge variant="light" color="gray" tt="none">{counts.iguais} sem alterações</Badge>
            <Badge variant="light" color="orange" tt="none">{counts.avisos} para conferir</Badge>
            <Badge variant="light" color="red" tt="none">{counts.erros} com erro</Badge>
          </Group>
          {serverErrors.__geral && (
            <Alert color="red" variant="light">
              {serverErrors.__geral}
            </Alert>
          )}
          <ScrollArea.Autosize mah="calc(100vh - 360px)" type="auto">
            <Table highlightOnHover verticalSpacing={6} horizontalSpacing="xs" stickyHeader miw={1180}>
              <Table.Thead>
                <Table.Tr>
                  <Table.Th w={30} />
                  <Table.Th w={28} />
                  <Table.Th>Planilha</Table.Th>
                  <Table.Th w={270}>Cadastro no SIGASE</Table.Th>
                  <Table.Th w={120}>P/G</Table.Th>
                  <Table.Th w={140}>Nome de guerra</Table.Th>
                  <Table.Th w={170}>Alterações</Table.Th>
                  <Table.Th>Conferência</Table.Th>
                </Table.Tr>
              </Table.Thead>
              <Table.Tbody>
                {visible.map((r) => {
                  const c = checks.get(r.key);
                  const isNew = !r.targetId;
                  const header = r.sheet !== lastSheet;
                  lastSheet = r.sheet;
                  const finalRank = c?.record?.rank ?? r.rank ?? '';
                  const finalWar = c?.record?.war_name ?? r.warName;
                  return (
                    <Fragment key={r.key}>
                      {header && (
                        <Table.Tr>
                          <Table.Td colSpan={8} bg="var(--mantine-color-default-hover)">
                            <Text size="xs" fw={800} tt="uppercase" c="dimmed" style={{ letterSpacing: 1 }}>
                              {r.sheet}
                            </Text>
                          </Table.Td>
                        </Table.Tr>
                      )}
                      <Table.Tr style={{ opacity: r.include ? 1 : 0.55 }}>
                        <Table.Td>
                          <Checkbox size="xs" checked={r.include} onChange={(e) => update(r.key, { include: e.currentTarget.checked })} aria-label="Incluir na importação" />
                        </Table.Td>
                        <Table.Td>
                          <ActionIcon size="sm" variant="subtle" color="gray" onClick={() => setOpen((o) => ({ ...o, [r.key]: !o[r.key] }))} aria-label="Ver detalhes">
                            {open[r.key] ? <IconChevronDown size={16} /> : <IconChevronRight size={16} />}
                          </ActionIcon>
                        </Table.Td>
                        <Table.Td>
                          <Text size="sm" fw={600} lh={1.2}>
                            {r.fullName}
                          </Text>
                          <Text size="10px" c="dimmed">
                            {r.rankText || 'sem posto'} · linha {r.row}
                          </Text>
                        </Table.Td>
                        <Table.Td>
                          <Select
                            size="xs"
                            searchable
                            data={targets}
                            value={r.targetId ? String(r.targetId) : NEW}
                            onChange={(v) => update(r.key, { targetId: v && v !== NEW ? Number(v) : null, match: v && v !== NEW ? 'manual' : 'novo', replace: {} })}
                            allowDeselect={false}
                            comboboxProps={{ withinPortal: true }}
                            maxDropdownHeight={260}
                          />
                          {!isNew && (
                            <Text size="10px" c={r.match === 'aproximado' ? 'orange.8' : 'dimmed'} mt={2}>
                              Encontrado {MATCH_LABEL[r.match]}
                            </Text>
                          )}
                        </Table.Td>
                        <Table.Td>
                          {isNew ? (
                            <Select size="xs" data={UNIT_RANKS.map(([v]) => v)} value={r.rank} onChange={(v) => update(r.key, { rank: v })} placeholder="Escolha" error={r.include && !r.rank} comboboxProps={{ withinPortal: true }} />
                          ) : (
                            <Text size="sm">{finalRank}</Text>
                          )}
                        </Table.Td>
                        <Table.Td>
                          {isNew ? (
                            <TextInput size="xs" value={r.warName} onChange={(e) => update(r.key, { warName: e.currentTarget.value, warNameSuggested: false })} error={r.include && !r.warName.trim()} styles={{ input: r.warNameSuggested ? { borderColor: 'var(--mantine-color-orange-5)' } : undefined }} />
                          ) : (
                            <Text size="sm" fw={600}>
                              {finalWar}
                            </Text>
                          )}
                        </Table.Td>
                        <Table.Td>{changeSummary(r)}</Table.Td>
                        <Table.Td>{messages(r)}</Table.Td>
                      </Table.Tr>
                      <Table.Tr style={{ display: open[r.key] ? undefined : 'none' }}>
                        <Table.Td />
                        <Table.Td colSpan={7} pb="sm">
                          <Collapse expanded={!!open[r.key]}>
                            {isNew ? (
                              <Table withTableBorder withColumnBorders fz="xs" verticalSpacing={3} maw={760}>
                                <Table.Tbody>
                                  {Object.entries(r.values).map(([field, value]) => (
                                    <Table.Tr key={field}>
                                      <Table.Td w={140} fw={600}>
                                        {FIELD_LABEL[field as keyof typeof FIELD_LABEL]}
                                      </Table.Td>
                                      <Table.Td>{show(field, value)}</Table.Td>
                                    </Table.Tr>
                                  ))}
                                </Table.Tbody>
                              </Table>
                            ) : c?.changes.length ? (
                              <Table withTableBorder withColumnBorders fz="xs" verticalSpacing={3} maw={980}>
                                <Table.Thead>
                                  <Table.Tr>
                                    <Table.Th w={140}>Campo</Table.Th>
                                    <Table.Th>No SIGASE</Table.Th>
                                    <Table.Th>Na planilha</Table.Th>
                                    <Table.Th w={190}>O que fazer</Table.Th>
                                  </Table.Tr>
                                </Table.Thead>
                                <Table.Tbody>
                                  {c.changes.map((ch) => (
                                    <Table.Tr key={ch.field}>
                                      <Table.Td fw={600}>{FIELD_LABEL[ch.field]}</Table.Td>
                                      <Table.Td c={ch.current ? undefined : 'dimmed'}>{ch.current ? show(ch.field, ch.current) : 'vazio'}</Table.Td>
                                      <Table.Td>{show(ch.field, ch.incoming)}</Table.Td>
                                      <Table.Td>
                                        {ch.kind === 'diff' ? (
                                          <Checkbox size="xs" label="Trocar pelo da planilha" checked={ch.applied} onChange={(e) => update(r.key, { replace: { ...r.replace, [ch.field]: e.currentTarget.checked } })} />
                                        ) : (
                                          <Text size="xs" c="blue.7">
                                            {ch.kind === 'append' ? 'Acrescentar' : 'Preencher'}
                                          </Text>
                                        )}
                                      </Table.Td>
                                    </Table.Tr>
                                  ))}
                                </Table.Tbody>
                              </Table>
                            ) : (
                              <Text size="xs" c="dimmed">
                                Os dados da planilha já são iguais aos do SIGASE.
                              </Text>
                            )}
                          </Collapse>
                        </Table.Td>
                      </Table.Tr>
                    </Fragment>
                  );
                })}
              </Table.Tbody>
            </Table>
          </ScrollArea.Autosize>
          <Group justify="space-between">
            <Text size="xs" c="dimmed">
              Quem já está igual ao SIGASE não é regravado. Corrija ou desmarque as linhas com erro para continuar.
            </Text>
            <Group gap="xs">
              <Button variant="default" onClick={close}>
                Cancelar
              </Button>
              <Button leftSection={<IconUpload size={16} />} loading={saving} disabled={!toSave.length || counts.erros > 0} onClick={submit}>
                Gravar {toSave.length} cadastro(s)
              </Button>
            </Group>
          </Group>
        </Stack>
      )}
    </Modal>
  );
}
