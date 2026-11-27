import { ActionIcon, Alert, Badge, Button, Checkbox, Group, Loader, Modal, NumberInput, ScrollArea, SegmentedControl, Select, Stack, Switch, Table, Text, ThemeIcon, Tooltip } from '@mantine/core';
import { DateInput } from '@mantine/dates';
import { IconAlertTriangle, IconCircleCheck, IconCircleX, IconFileSpreadsheet, IconInfoCircle, IconRefresh, IconUpload } from '@tabler/icons-react';
import { useQueryClient } from '@tanstack/react-query';
import dayjs from 'dayjs';
import { type DragEvent, useMemo, useRef, useState } from 'react';
import { ApiError, api } from '../api';
import { identity, sortUnit, useUnitPersonnel } from '../data/unit';
import { suggestedReferenceYear, useVacationPlan } from '../data/vacation';
import { type ImportRow, checkRows, initialInclude, matchPeople, parsePlan } from '../data/vacationImport';
import { notifyOk } from '../lib/confirm';
import { fmtDate } from '../lib/format';
import { readXlsx } from '../lib/xlsx';

interface Props {
  opened: boolean;
  onClose: () => void;
}

const PARCELS = ['1/1', '1/2', '2/2', '1/3', '2/3', '3/3'];
const toIso = (d: string | Date | null) => (d ? dayjs(d).format('YYYY-MM-DD') : null);

/** Importa o plano de férias da planilha (.xlsx): lê, mostra para conferência e grava tudo de uma vez. */
export function VacationImportModal({ opened, onClose }: Props) {
  const qc = useQueryClient();
  const { data: roster = [] } = useUnitPersonnel();
  const { data: existing = [] } = useVacationPlan();
  const input = useRef<HTMLInputElement>(null);
  const [fileName, setFileName] = useState('');
  const [rows, setRows] = useState<ImportRow[]>([]);
  const [ref, setRef] = useState<number | string>(suggestedReferenceYear());
  const [reading, setReading] = useState(false);
  const [readError, setReadError] = useState('');
  const [serverErrors, setServerErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [filter, setFilter] = useState('todos');
  const [dragging, setDragging] = useState(false);

  const people = useMemo(() => sortUnit(roster).map((p) => ({ value: String(p.id), label: `${identity(p)} · ${p.full_name}` })), [roster]);
  const refYear = Number(ref) || suggestedReferenceYear();
  const checks = useMemo(() => checkRows(rows, existing, refYear), [rows, existing, refYear]);

  const reset = () => {
    setRows([]);
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
      const plan = parsePlan(await readXlsx(file));
      if (!plan.rows.length) throw new Error('Não encontrei lançamentos. A planilha precisa ter as colunas “Nome Completo”, “Início” e “Término”.');
      setRef(plan.titleYear ?? suggestedReferenceYear(plan.rows.find((r) => r.start)?.start));
      setRows(initialInclude(matchPeople(plan.rows, roster), existing));
      setFileName(file.name);
    } catch (error) {
      setReadError((error as Error).message || 'Não foi possível ler a planilha.');
    } finally {
      setReading(false);
      if (input.current) input.current.value = '';
    }
  };

  const update = (key: string, patch: Partial<ImportRow>) => {
    setServerErrors({});
    setRows((list) => list.map((r) => (r.key === key ? { ...r, ...patch } : r)));
  };

  const included = rows.filter((r) => r.include);
  const counts = {
    ok: included.filter((r) => !checks.get(r.key)?.errors.length && !checks.get(r.key)?.warnings.length).length,
    warn: included.filter((r) => !checks.get(r.key)?.errors.length && checks.get(r.key)?.warnings.length).length,
    error: included.filter((r) => checks.get(r.key)?.errors.length || serverErrors[r.key]).length,
    skipped: rows.length - included.length,
  };
  const visible = rows.filter((r) => {
    const c = checks.get(r.key);
    if (filter === 'problemas') return r.include && (c?.errors.length || c?.warnings.length || serverErrors[r.key]);
    if (filter === 'ignorados') return !r.include;
    return true;
  });

  const submit = async () => {
    const batch = included.map((r) => ({ key: r.key, record: checks.get(r.key)?.record }));
    if (batch.some((b) => !b.record)) return;
    setSaving(true);
    setServerErrors({});
    try {
      const result = await api<{ created: number }>('/api/vacation-plan/import', { method: 'POST', body: { periods: batch.map((b) => b.record) } });
      await Promise.all([qc.invalidateQueries({ queryKey: ['vacation-plan'] }), qc.invalidateQueries({ queryKey: ['notices'] })]);
      notifyOk(`${result.created} lançamento(s) de férias importados. Os avisos de início e apresentação foram criados.`);
      close();
    } catch (error) {
      if (error instanceof ApiError && Array.isArray(error.data.errors)) {
        const mapped: Record<string, string> = {};
        for (const e of error.data.errors as { index: number; error: string }[]) if (batch[e.index]) mapped[batch[e.index].key] = e.error;
        setServerErrors(mapped);
        setFilter('problemas');
      } else {
        setServerErrors({ __geral: (error as Error).message });
      }
    } finally {
      setSaving(false);
    }
  };

  const drop = (e: DragEvent) => {
    e.preventDefault();
    setDragging(false);
    load(e.dataTransfer.files?.[0]);
  };

  const status = (r: ImportRow) => {
    const c = checks.get(r.key);
    const server = serverErrors[r.key];
    if (!r.include) return <Badge size="sm" variant="light" color="gray">{c?.duplicate ? 'Já lançado' : 'Ignorado'}</Badge>;
    const errors = [...(c?.errors ?? []), ...(server ? [server] : [])];
    if (errors.length)
      return (
        <Stack gap={2}>
          {errors.map((e) => (
            <Group key={e} gap={4} wrap="nowrap" align="flex-start">
              <IconCircleX size={14} color="var(--mantine-color-red-6)" style={{ flexShrink: 0, marginTop: 2 }} />
              <Text size="xs" c="red.7">
                {e}
              </Text>
            </Group>
          ))}
        </Stack>
      );
    if (c?.warnings.length)
      return (
        <Stack gap={2}>
          {c.warnings.map((w) => (
            <Group key={w} gap={4} wrap="nowrap" align="flex-start">
              <IconAlertTriangle size={14} color="var(--mantine-color-orange-6)" style={{ flexShrink: 0, marginTop: 2 }} />
              <Text size="xs" c="orange.8">
                {w}
              </Text>
            </Group>
          ))}
        </Stack>
      );
    return (
      <Group gap={4} wrap="nowrap">
        <IconCircleCheck size={14} color="var(--mantine-color-sigase-6)" />
        <Text size="xs" c="dimmed">
          Pronto
        </Text>
      </Group>
    );
  };

  let lastSheet = '';
  return (
    <Modal opened={opened} onClose={close} size="min(1280px, 96vw)" closeOnEscape={false} closeOnClickOutside={false} title={<Text fw={800}>Importar plano de férias</Text>}>
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
                  Arquivo .xlsx do plano de férias (abas de Oficiais, ST/Sgt e Cb/Sd)
                </Text>
                <Button mt="xs" leftSection={<IconUpload size={16} />} variant="light">
                  Escolher arquivo
                </Button>
              </>
            )}
          </div>
          <input ref={input} type="file" accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" hidden onChange={(e) => load(e.currentTarget.files?.[0])} data-testid="vacation-import-file" />
          {readError && (
            <Alert color="red" variant="light" icon={<IconCircleX size={18} />}>
              {readError}
            </Alert>
          )}
          <Alert color="gray" variant="light" icon={<IconInfoCircle size={18} />}>
            <Text size="sm">
              A planilha é lida no seu computador e nada é gravado antes da sua conferência. Na próxima etapa você confere cada linha: militar do efetivo, parcela, datas e deslocamento. A apresentação é sempre recalculada pelo SIGASE.
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
            <Group gap="xs">
              <NumberInput size="xs" w={120} label="Referência (REF)" value={ref} onChange={setRef} min={2000} max={2100} />
              <SegmentedControl
                size="xs"
                value={filter}
                onChange={setFilter}
                data={[
                  { value: 'todos', label: `Todos (${rows.length})` },
                  { value: 'problemas', label: `Para conferir (${counts.error + counts.warn})` },
                  { value: 'ignorados', label: `Ignorados (${counts.skipped})` },
                ]}
              />
            </Group>
          </Group>
          <Group gap="xs">
            <Badge variant="light" color="sigase" tt="none">
              {counts.ok} prontos
            </Badge>
            <Badge variant="light" color="orange" tt="none">
              {counts.warn} com aviso
            </Badge>
            <Badge variant="light" color="red" tt="none">
              {counts.error} com erro
            </Badge>
            <Badge variant="light" color="gray" tt="none">
              {counts.skipped} fora da importação
            </Badge>
          </Group>
          {serverErrors.__geral && (
            <Alert color="red" variant="light">
              {serverErrors.__geral}
            </Alert>
          )}
          <ScrollArea.Autosize mah="calc(100vh - 330px)" type="auto">
            <Table striped={false} highlightOnHover verticalSpacing={6} horizontalSpacing="xs" stickyHeader miw={1080}>
              <Table.Thead>
                <Table.Tr>
                  <Table.Th w={34} />
                  <Table.Th>Militar</Table.Th>
                  <Table.Th w={90}>Parcela</Table.Th>
                  <Table.Th w={128}>Início</Table.Th>
                  <Table.Th w={128}>Término</Table.Th>
                  <Table.Th w={50}>Dias</Table.Th>
                  <Table.Th w={60}>Desl.</Table.Th>
                  <Table.Th w={96}>Apresentação</Table.Th>
                  <Table.Th>Conferência</Table.Th>
                </Table.Tr>
              </Table.Thead>
              <Table.Tbody>
                {visible.map((r) => {
                  const c = checks.get(r.key);
                  const header = r.sheet !== lastSheet;
                  lastSheet = r.sheet;
                  const parcel = c?.periodNumber && c?.periodTotal ? `${c.periodNumber}/${c.periodTotal}` : null;
                  return [
                    header && (
                      <Table.Tr key={`${r.sheet}-h`}>
                        <Table.Td colSpan={9} bg="var(--mantine-color-default-hover)">
                          <Text size="xs" fw={800} tt="uppercase" c="dimmed" style={{ letterSpacing: 1 }}>
                            {r.sheet}
                          </Text>
                        </Table.Td>
                      </Table.Tr>
                    ),
                    <Table.Tr key={r.key} style={{ opacity: r.include ? 1 : 0.55 }}>
                      <Table.Td>
                        <Checkbox size="xs" checked={r.include} onChange={(e) => update(r.key, { include: e.currentTarget.checked })} aria-label="Incluir na importação" />
                      </Table.Td>
                      <Table.Td>
                        <Select
                          size="xs"
                          searchable
                          clearable
                          placeholder="Escolha o militar"
                          data={people}
                          value={r.personId ? String(r.personId) : null}
                          onChange={(v) => update(r.key, { personId: v ? Number(v) : null, match: v ? 'manual' : 'nenhum' })}
                          error={r.include && !r.personId}
                          comboboxProps={{ withinPortal: true }}
                          maxDropdownHeight={260}
                        />
                        <Text size="10px" c="dimmed" mt={2} truncate title={`${r.block} · linha ${r.row}`}>
                          Planilha: {r.rankText} {r.nameText}
                          {r.match === 'aproximado' ? ' · nome parecido' : ''}
                          {r.notes ? ` · ${r.notes}` : ''}
                        </Text>
                      </Table.Td>
                      <Table.Td>
                        <Select
                          size="xs"
                          data={PARCELS}
                          value={parcel}
                          onChange={(v) => {
                            const [n, t] = (v ?? '').split('/').map(Number);
                            update(r.key, { periodNumber: n || null, periodTotal: t || null });
                          }}
                          allowDeselect={false}
                          comboboxProps={{ withinPortal: true }}
                          styles={{ input: c?.periodInferred ? { borderColor: 'var(--mantine-color-orange-5)' } : undefined }}
                        />
                      </Table.Td>
                      <Table.Td>
                        <DateInput size="xs" valueFormat="DD/MM/YYYY" value={r.start} onChange={(v) => update(r.key, { start: toIso(v) })} popoverProps={{ withinPortal: true }} error={r.include && !r.start} />
                      </Table.Td>
                      <Table.Td>
                        <DateInput size="xs" valueFormat="DD/MM/YYYY" value={r.end} onChange={(v) => update(r.key, { end: toIso(v) })} popoverProps={{ withinPortal: true }} error={r.include && !r.end} />
                      </Table.Td>
                      <Table.Td>
                        <Text size="sm" fw={600}>
                          {c?.days ?? '—'}
                        </Text>
                      </Table.Td>
                      <Table.Td>
                        <Switch size="xs" checked={r.travel} onChange={(e) => update(r.key, { travel: e.currentTarget.checked })} aria-label="2 dias de deslocamento" />
                      </Table.Td>
                      <Table.Td>
                        <Text size="xs">{c?.presentation ? fmtDate(c.presentation) : '—'}</Text>
                      </Table.Td>
                      <Table.Td>{status(r)}</Table.Td>
                    </Table.Tr>,
                  ];
                })}
              </Table.Tbody>
            </Table>
          </ScrollArea.Autosize>
          <Group justify="space-between">
            <Text size="xs" c="dimmed">
              Linhas já lançadas no SIGASE ficam fora da importação. Corrija ou desmarque as linhas com erro para continuar.
            </Text>
            <Group gap="xs">
              <Button variant="default" onClick={close}>
                Cancelar
              </Button>
              <Button leftSection={<IconUpload size={16} />} loading={saving} disabled={!included.length || counts.error > 0} onClick={submit}>
                Importar {included.length} lançamento(s)
              </Button>
            </Group>
          </Group>
        </Stack>
      )}
    </Modal>
  );
}
