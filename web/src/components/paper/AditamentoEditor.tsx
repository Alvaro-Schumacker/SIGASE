import { ActionIcon, Alert, Badge, Button, Group, Menu, Select, Stack, Switch, Text, Tooltip, UnstyledButton } from '@mantine/core';
import { modals } from '@mantine/modals';
import { IconCalendarPlus, IconCopy, IconLink, IconLinkOff, IconListDetails, IconTrash, IconUsersPlus, IconWand, IconX } from '@tabler/icons-react';
import dayjs from 'dayjs';
import { Fragment, useEffect, useMemo, useRef, useState } from 'react';
import { type DocumentRecord } from '../../data/documents';
import { useSaveDocument } from '../docs/editSession';
import { type DutyScale, useScales } from '../../data/scales';
import { notifyError, notifyOk } from '../../lib/confirm';
import { fmtDate } from '../../lib/format';
import { aditEmptyRow, aditGroups, aditServiceChoices, normalizeAditDays } from '../../print/legacy';
import { DocEditorShell, SideCard } from './DocEditorShell';
import { InlineDate, InlineInput, InlineSuggest, InlineTextarea, RowTool } from './Inline';

interface Row { service: string; rank: string; personnel: string; scaleService: string }
interface Group { name: string; rows: Row[] }
interface Day { date: string; paradeTime: string; paradeLocation: string; groups: Group[] }
interface Notice { title: string; body: string }
type PartKey = 'instruction' | 'general' | 'discipline';
type Notices = Record<PartKey, Notice[]>;

interface Props {
  opened: boolean;
  onClose: () => void;
  existing: DocumentRecord | null;
  saved: DocumentRecord[];
}

const PARADE_TIME = '7 horas e 50 minutos';
const PARADE_PLACE = 'A Retaguarda Pavilhão de Comando';
const PARTS: [PartKey, string][] = [
  ['instruction', '2ª PARTE – INSTRUÇÃO'],
  ['general', '3ª PARTE – ASSUNTOS GERAIS E ADMINISTRATIVOS'],
  ['discipline', '4ª PARTE – JUSTIÇA E DISCIPLINA'],
];
const SUGGESTIONS = (aditServiceChoices as string[]).filter((s) => s !== 'Outros:');
const GROUPS = aditGroups as string[];
const num = (d: DocumentRecord) => Number(String(d.bulletin_number || '').match(/\d+/)?.[0] || 0);
const newDay = (date = ''): Day => ({ date, paradeTime: PARADE_TIME, paradeLocation: PARADE_PLACE, groups: GROUPS.map((name) => ({ name, rows: [aditEmptyRow(name)] })) });
const norm = (s: string) => s.toLocaleLowerCase('pt-BR').replace(/:\s*$/, '').trim();
const emptyNotices = (): Notices => ({ instruction: [], general: [], discipline: [] });

/**
 * Preenche os nomes das linhas vinculadas à escala. Linhas sem vínculo cujo serviço tem o mesmo
 * nome de um serviço de escala são vinculadas automaticamente.
 */
function fillFromScales(days: Day[], scales: DutyScale[]) {
  let filled = 0;
  let linked = 0;
  let empty = 0;
  const next = days.map((day) => ({
    ...day,
    groups: day.groups.map((g) => ({
      ...g,
      rows: g.rows.map((row) => {
        let r = row;
        if (!r.scaleService && r.service.trim()) {
          for (const s of scales) {
            const match = s.services.find((sv) => norm(sv.name) === norm(r.service));
            if (match) {
              r = { ...r, scaleService: `${s.id}|${match.name}` };
              linked++;
              break;
            }
          }
        }
        if (!r.scaleService || !day.date) return r;
        const [id, ...parts] = r.scaleService.split('|');
        const service = parts.join('|');
        const scale = scales.find((s) => s.id === Number(id));
        if (!scale) return r;
        const people = Object.entries(scale.assignments || {})
          .filter(([key, value]) => key.endsWith(`|${day.date}`) && value === service)
          .map(([key]) => scale.participants.find((p) => p.id === Number(key.split('|')[0])))
          .filter(Boolean) as DutyScale['participants'];
        if (!people.length) {
          empty++;
          return r;
        }
        filled++;
        return {
          ...r,
          personnel: people.map((p) => (p.rank === 'Sd EV' && p.military_number ? `${p.military_number} ${p.war_name}` : p.war_name)).join(', '),
          rank: people.every((p) => p.rank === people[0].rank) ? people[0].rank : r.rank,
        };
      }),
    })),
  }));
  return { days: next, filled, linked, empty };
}

export function AditamentoEditor({ opened, onClose, existing, saved }: Props) {
  const save = useSaveDocument();
  const { data: scales = [] } = useScales();
  const [bulletin, setBulletin] = useState('');
  const [bulletinDate, setBulletinDate] = useState<string | null>(null);
  const [days, setDays] = useState<Day[]>([]);
  const [notices, setNotices] = useState<Notices>(emptyNotices());
  const [mainSigner, setMainSigner] = useState('');
  const [mainResponding, setMainResponding] = useState(false);
  const [commander, setCommander] = useState('');
  const [commanderResponding, setCommanderResponding] = useState(false);
  const [copyFrom, setCopyFrom] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState(false);
  const snapshot = useRef('');

  const previous = useMemo(() => [...saved].filter((d) => d.id !== existing?.id).sort((a, b) => num(b) - num(a) || b.document_date.localeCompare(a.document_date)), [saved, existing]);

  const content = () => ({
    bulletinDate,
    aditDays: days.map((d) => ({ date: d.date, paradeTime: d.paradeTime.trim(), paradeLocation: d.paradeLocation.trim(), groups: d.groups.map((g) => ({ name: g.name, rows: g.rows.map((r) => ({ service: r.service.trim(), rank: r.rank.trim(), personnel: r.personnel.trim(), scaleService: r.scaleService })) })) })),
    notices: Object.fromEntries(PARTS.map(([key]) => [key, notices[key].map((n) => ({ title: n.title.trim(), body: n.body.trim() })).filter((n) => n.title || n.body)])),
    mainSigner: mainSigner.trim(),
    mainResponding,
    commander: commander.trim(),
    commanderResponding,
  });

  useEffect(() => {
    if (!opened) return;
    setSubmitted(false);
    setCopyFrom(previous[0] ? String(previous[0].id) : null);
    const d = existing?.data;
    const prior = previous[0]?.data || {};
    if (d) {
      setBulletin(existing!.bulletin_number);
      setBulletinDate(d.bulletinDate || existing!.document_date);
      setDays(normalizeAditDays(d) as Day[]);
      setNotices({ ...emptyNotices(), ...(d.notices || {}) });
      setMainSigner(d.mainSigner || '');
      setMainResponding(!!d.mainResponding);
      setCommander(d.commander || '');
      setCommanderResponding(!!d.commanderResponding);
    } else {
      setBulletin(String(saved.reduce((n, x) => Math.max(n, num(x)), 0) + 1).padStart(3, '0'));
      setBulletinDate(dayjs().format('YYYY-MM-DD'));
      setDays([newDay(dayjs().add(1, 'day').format('YYYY-MM-DD'))]);
      setNotices(emptyNotices());
      setMainSigner(prior.mainSigner || '');
      setMainResponding(!!prior.mainResponding);
      setCommander(prior.commander || '');
      setCommanderResponding(!!prior.commanderResponding);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [opened, existing]);

  // Marca o estado inicial (depois da carga) para saber se há alterações não salvas.
  const loaded = days.length > 0;
  useEffect(() => {
    if (opened && loaded && !snapshot.current) snapshot.current = JSON.stringify(content());
    if (!opened) snapshot.current = '';
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [opened, loaded]);
  const dirty = !!snapshot.current && JSON.stringify(content()) !== snapshot.current;

  // ---------- edição ----------
  const updateDay = (di: number, patch: Partial<Day>) => setDays((l) => l.map((d, i) => (i === di ? { ...d, ...patch } : d)));
  const setRows = (di: number, gi: number, fn: (rows: Row[]) => Row[]) =>
    setDays((l) => l.map((d, i) => (i !== di ? d : { ...d, groups: d.groups.map((g, j) => (j === gi ? { ...g, rows: fn(g.rows) } : g)) })));
  const updateRow = (di: number, gi: number, ri: number, patch: Partial<Row>) => setRows(di, gi, (rows) => rows.map((r, k) => (k === ri ? { ...r, ...patch } : r)));
  const setNotice = (key: PartKey, i: number, patch: Partial<Notice>) => setNotices((n) => ({ ...n, [key]: n[key].map((x, j) => (j === i ? { ...x, ...patch } : x)) }));

  const fillRow = (di: number, gi: number, ri: number) => {
    const single: Day[] = [{ ...days[di], groups: [{ ...days[di].groups[gi], rows: [days[di].groups[gi].rows[ri]] }] }];
    const result = fillFromScales(single, scales);
    if (!result.filled) return notifyError(new Error('Não há militares desse serviço na escala para a data do dia.'), 'Nada encontrado');
    updateRow(di, gi, ri, result.days[0].groups[0].rows[0]);
  };

  const fillAll = () => {
    const result = fillFromScales(days, scales);
    setDays(result.days);
    if (!result.filled && !result.linked) return notifyError(new Error('Nenhuma linha está vinculada à escala. Passe o mouse sobre uma linha e use o ícone de corrente, ou dê ao serviço o mesmo nome do serviço da escala.'), 'Nada para preencher');
    notifyOk(
      `${result.filled} ${result.filled === 1 ? 'linha preenchida' : 'linhas preenchidas'} pela escala` +
        (result.linked ? ` · ${result.linked} vinculada(s) automaticamente pelo nome` : '') +
        (result.empty ? ` · ${result.empty} sem militar escalado na data` : ''),
    );
  };

  const copyPrevious = () => {
    const source = previous.find((d) => String(d.id) === copyFrom);
    if (!source) return;
    const run = () => {
      const srcDays = normalizeAditDays(source.data || {}) as Day[];
      const start = dayjs(bulletinDate || undefined).add(1, 'day');
      const copied = srcDays.map((day, i) => ({ ...day, date: start.add(i, 'day').format('YYYY-MM-DD') }));
      const result = fillFromScales(copied, scales);
      setDays(result.days);
      setMainSigner(source.data?.mainSigner || mainSigner);
      setMainResponding(!!source.data?.mainResponding);
      setCommander(source.data?.commander || commander);
      setCommanderResponding(!!source.data?.commanderResponding);
      notifyOk(`Serviços copiados do aditamento Nr ${source.bulletin_number}${result.filled ? `; ${result.filled} linha(s) atualizada(s) pela escala` : ''}. Confira as datas dos dias.`);
    };
    const hasContent = days.some((d) => d.groups.some((g) => g.rows.some((r) => r.service || r.personnel)));
    if (!hasContent) return run();
    modals.openConfirmModal({
      title: 'Substituir a escala do documento?',
      children: <Text size="sm">Os dias e serviços preenchidos aqui serão trocados pelos do aditamento Nr {source.bulletin_number}. Os avisos das partes 2 a 4 são mantidos.</Text>,
      labels: { confirm: 'Copiar', cancel: 'Cancelar' },
      onConfirm: run,
    });
  };

  const addDay = () => {
    const last = days[days.length - 1]?.date;
    setDays((l) => [...l, newDay(last ? dayjs(last).add(1, 'day').format('YYYY-MM-DD') : '')]);
    window.setTimeout(() => document.getElementById(`adit-day-${days.length}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 80);
  };

  // ---------- salvar ----------
  const submit = () => {
    setSubmitted(true);
    if (!bulletin.trim() || !bulletinDate || !mainSigner.trim() || !commander.trim() || days.some((d) => !d.date)) return notifyError(new Error('Preencha os campos destacados em vermelho.'), 'Campos obrigatórios');
    save.mutate(
      { id: existing?.id, kind: 'aditamento', bulletin_number: bulletin.trim(), document_date: bulletinDate, data: content() },
      {
        onSuccess: () => {
          notifyOk(existing ? 'Aditamento atualizado.' : 'Aditamento salvo no arquivo.');
          onClose();
        },
        onError: (e) => notifyError(e),
      },
    );
  };

  const req = (v: string | null) => submitted && !String(v || '').trim();
  const linkedCount = days.reduce((n, d) => n + d.groups.reduce((m, g) => m + g.rows.filter((r) => r.scaleService).length, 0), 0);
  const scaleLabel = (link: string) => {
    const [id, ...parts] = link.split('|');
    return `${parts.join('|')} · ${scales.find((s) => s.id === Number(id))?.name ?? 'escala removida'}`;
  };

  // ---------- folha ----------
  const header = (
    <div className="doc-header">
      <span>MINISTÉRIO DA DEFESA</span>
      <span>EXÉRCITO BRASILEIRO</span>
      <span>25º GRUPO DE ARTILHARIA DE CAMPANHA</span>
      <span>(C Art Cav/1831)</span>
      <span>GRUPO LEITE DE CASTRO</span>
      <span>3ª BATERIA DE OBUSES</span>
    </div>
  );

  const title = (editable: boolean) => (
    <>
      <div className="doc-title">
        ADITAMENTO AO BOLETIM INTERNO Nr{' '}
        {editable ? <InlineInput value={bulletin} onChange={setBulletin} inlineWidth={4} invalid={req(bulletin)} placeholder="000" maxLength={30} /> : bulletin} DE{' '}
        {editable ? <InlineDate value={bulletinDate} onChange={setBulletinDate} weekday={false} upper invalid={req(bulletinDate)} /> : bulletinDate ? fmtDate(bulletinDate) : ''}
      </div>
      <div className="doc-intro">Para conhecimento desta bateria e devida execução publico o seguinte:</div>
      <div className="doc-part">1ª PARTE – SERVIÇOS DIÁRIOS</div>
    </>
  );

  const dayBlock = (day: Day, di: number) => (
    <section key={di} id={`adit-day-${di}`} style={{ breakInside: 'avoid' }}>
      <div className="doc-subtitle doc-row doc-tools-host" style={{ position: 'relative' }}>
        Para o dia <InlineDate value={day.date || null} onChange={(v) => updateDay(di, { date: v })} invalid={req(day.date)} />
        {days.length > 1 && (
          <div className="doc-row-tools">
            <RowTool label="Remover este dia" color="red" onClick={() => setDays((l) => l.filter((_, i) => i !== di))}>
              <IconTrash size={14} />
            </RowTool>
          </div>
        )}
      </div>
      <table className="doc-table" style={{ textAlign: 'center' }}>
        <colgroup>
          <col style={{ width: '35%' }} />
          <col style={{ width: '65%' }} />
        </colgroup>
        <thead>
          <tr>
            <th>Serviço</th>
            <th>Militar(es)</th>
          </tr>
        </thead>
        <tbody>
          {day.groups.map((g, gi) => (
            <Fragment key={g.name}>
              <tr className="doc-ghost-row">
                <td colSpan={2}>
                  <Group justify="space-between" gap={4}>
                    <span className="doc-ghost">{g.name}</span>
                    <button type="button" className="doc-add" onClick={() => setRows(di, gi, (rows) => [...rows, aditEmptyRow(g.name)])}>
                      + serviço
                    </button>
                  </Group>
                </td>
              </tr>
              {g.rows.map((r, ri) => (
                <tr key={ri} className="doc-tools-host">
                  <td>
                    <InlineSuggest value={r.service} onChange={(v) => updateRow(di, gi, ri, { service: v })} data={SUGGESTIONS} placeholder="Serviço" />
                    {r.scaleService && (
                      <Tooltip label={`Vinculado à escala: ${scaleLabel(r.scaleService)}`} withArrow zIndex={400}>
                        <span className="doc-link-dot" style={{ position: 'absolute', right: 4, top: 4 }}>
                          <IconLink size={12} />
                        </span>
                      </Tooltip>
                    )}
                  </td>
                  <td>
                    <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'center', gap: 4 }}>
                      <InlineInput value={r.rank} onChange={(v) => updateRow(di, gi, ri, { rank: v })} inlineWidth={6} placeholder="P/G" />
                      <div style={{ flex: 1 }}>
                        <InlineTextarea value={r.personnel} onChange={(v) => updateRow(di, gi, ri, { personnel: v })} placeholder="nome(s) de guerra" />
                      </div>
                    </div>
                    <div className="doc-row-tools">
                      <Menu position="bottom-end" withinPortal zIndex={400} shadow="md">
                        <Menu.Target>
                          <ActionIcon size="sm" variant="light" color={r.scaleService ? 'sigase' : 'gray'} aria-label="Vincular à escala" title="Vincular à escala">
                            <IconLink size={14} />
                          </ActionIcon>
                        </Menu.Target>
                        <Menu.Dropdown>
                          {!scales.length && <Menu.Label>Nenhuma escala criada</Menu.Label>}
                          {scales.map((s) => (
                            <Fragment key={s.id}>
                              <Menu.Label>{s.name}</Menu.Label>
                              {s.services.map((sv) => (
                                <Menu.Item key={sv.name} onClick={() => updateRow(di, gi, ri, { scaleService: `${s.id}|${sv.name}`, service: r.service.trim() ? r.service : sv.name })}>
                                  {sv.name}
                                </Menu.Item>
                              ))}
                            </Fragment>
                          ))}
                          {r.scaleService && (
                            <>
                              <Menu.Divider />
                              <Menu.Item color="red" leftSection={<IconLinkOff size={14} />} onClick={() => updateRow(di, gi, ri, { scaleService: '' })}>
                                Remover vínculo
                              </Menu.Item>
                            </>
                          )}
                        </Menu.Dropdown>
                      </Menu>
                      <RowTool label="Preencher nomes pela escala" color="sigase" disabled={!r.scaleService} onClick={() => fillRow(di, gi, ri)}>
                        <IconUsersPlus size={14} />
                      </RowTool>
                      <RowTool label="Remover linha" color="red" disabled={g.rows.length <= 1} onClick={() => setRows(di, gi, (rows) => rows.filter((_, k) => k !== ri))}>
                        <IconX size={14} />
                      </RowTool>
                    </div>
                  </td>
                </tr>
              ))}
            </Fragment>
          ))}
          <tr>
            <td>
              <b>Parada Diária</b>
            </td>
            <td>
              <div>
                <b>Horário:</b> <InlineInput value={day.paradeTime} onChange={(v) => updateDay(di, { paradeTime: v })} inlineWidth={18} />
              </div>
              <div>
                <b>Local:</b> <InlineInput value={day.paradeLocation} onChange={(v) => updateDay(di, { paradeLocation: v })} inlineWidth={30} />
              </div>
            </td>
          </tr>
        </tbody>
      </table>
    </section>
  );

  const parts = (
    <>
      {PARTS.map(([key, label]) => (
        <section key={key}>
          <div className="doc-part">{label}</div>
          {notices[key].map((n, i) => (
            <div key={i} className="doc-row doc-tools-host" style={{ textAlign: 'center', margin: '0 auto 3mm', width: '88%' }}>
              <InlineInput value={n.title} onChange={(v) => setNotice(key, i, { title: v })} bold placeholder="TÍTULO DO AVISO" />
              <InlineTextarea value={n.body} onChange={(v) => setNotice(key, i, { body: v })} placeholder="Texto do aviso" />
              <div className="doc-row-tools">
                <RowTool label="Remover aviso" color="red" onClick={() => setNotices((all) => ({ ...all, [key]: all[key].filter((_, j) => j !== i) }))}>
                  <IconX size={14} />
                </RowTool>
              </div>
            </div>
          ))}
          {!notices[key].length && <p className="doc-center" style={{ margin: '0 0 2mm' }}>Sem Alteração</p>}
          <div className="doc-center">
            <button type="button" className="doc-add" onClick={() => setNotices((all) => ({ ...all, [key]: [...all[key], { title: '', body: '' }] }))}>
              + aviso
            </button>
          </div>
        </section>
      ))}
      <div className="doc-sign">
        <InlineInput value={mainSigner} onChange={setMainSigner} placeholder="Nome / posto do sargenteante" invalid={req(mainSigner)} />
        <div className="doc-role">{mainResponding ? 'Resp. Sargenteante da 3ª Bateria de Obuses' : 'Sargenteante da 3ª Bateria de Obuses'}</div>
        <Group justify="center" mt={4}>
          <Switch size="xs" label={<span className="doc-ghost">respondendo</span>} checked={mainResponding} onChange={(e) => setMainResponding(e.currentTarget.checked)} />
        </Group>
      </div>
      <div className="doc-sign" style={{ marginTop: '13mm' }}>
        <InlineInput value={commander} onChange={setCommander} placeholder="Nome / posto do comandante" invalid={req(commander)} />
        <div className="doc-role">{commanderResponding ? 'Resp. Comandante da 3ª Bateria de Obuses' : 'Comandante da 3ª Bateria de Obuses'}</div>
        <Group justify="center" mt={4}>
          <Switch size="xs" label={<span className="doc-ghost">respondendo</span>} checked={commanderResponding} onChange={(e) => setCommanderResponding(e.currentTarget.checked)} />
        </Group>
      </div>
    </>
  );

  // Dois dias por folha, como na impressão; partes e assinaturas na última.
  const chunks: number[][] = [];
  for (let i = 0; i < days.length; i += 2) chunks.push([i, i + 1].filter((x) => x < days.length));
  if (!chunks.length) chunks.push([]);

  const sidebar = (
    <>
      <SideCard title="Automação pela escala" icon={<IconWand size={16} />}>
        <Text size="xs" c="dimmed">
          Vincule cada serviço a uma escala (ícone de corrente ao passar o mouse na linha). Serviços com o mesmo nome do serviço da escala são vinculados sozinhos.
        </Text>
        <Button leftSection={<IconUsersPlus size={16} />} onClick={fillAll} disabled={!scales.length}>
          Preencher nomes pela escala
        </Button>
        <Text size="xs" c="dimmed">
          {linkedCount} {linkedCount === 1 ? 'linha vinculada' : 'linhas vinculadas'}
        </Text>
      </SideCard>

      <SideCard title="Copiar do aditamento anterior" icon={<IconCopy size={16} />}>
        {previous.length ? (
          <>
            <Select
              size="xs"
              allowDeselect={false}
              comboboxProps={{ zIndex: 400 }}
              data={previous.slice(0, 30).map((d) => ({ value: String(d.id), label: `Nr ${d.bulletin_number} · ${fmtDate(d.document_date)} · ${(normalizeAditDays(d.data || {}) as Day[]).length} dia(s)` }))}
              value={copyFrom}
              onChange={setCopyFrom}
            />
            <Button variant="light" leftSection={<IconCopy size={16} />} onClick={copyPrevious}>
              Copiar serviços e assinaturas
            </Button>
            <Text size="xs" c="dimmed">
              Os dias recebem as datas seguintes à do boletim e os nomes são atualizados pela escala quando houver vínculo.
            </Text>
          </>
        ) : (
          <Text size="xs" c="dimmed">
            Ainda não há aditamentos anteriores.
          </Text>
        )}
      </SideCard>

      <SideCard title="Dias deste aditamento" icon={<IconListDetails size={16} />}>
        <Stack gap={4}>
          {days.map((d, i) => (
            <UnstyledButton key={i} onClick={() => document.getElementById(`adit-day-${i}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' })}>
              <Group gap="xs" wrap="nowrap">
                <Badge variant="light" circle>
                  {i + 1}
                </Badge>
                <Text size="sm" c={d.date ? undefined : 'red'}>
                  {d.date ? dayjs(d.date).format('ddd, DD/MM/YYYY') : 'Data não definida'}
                </Text>
              </Group>
            </UnstyledButton>
          ))}
        </Stack>
        <Button variant="default" size="xs" leftSection={<IconCalendarPlus size={14} />} onClick={addDay}>
          Adicionar dia
        </Button>
      </SideCard>

      <Alert variant="light" color="gray" p="xs">
        <Text size="xs">
          Clique em qualquer texto sublinhado para editar. Elementos em verde-claro (grupos, botões “+”) servem só para a edição e não saem na impressão.
        </Text>
      </Alert>
    </>
  );

  return (
    <DocEditorShell
      opened={opened}
      eyebrow="Área documental · Aditamento"
      title={`${existing ? 'Editar' : 'Novo'} aditamento${bulletin ? ` · Nr ${bulletin}` : ''}`}
      dirty={dirty}
      saving={save.isPending}
      submitLabel={existing ? 'Salvar alterações' : 'Salvar aditamento'}
      onCancel={onClose}
      onSave={submit}
      sidebar={sidebar}
    >
      {chunks.map((chunk, ci) => (
        <div key={ci} className="doc-sheet">
          {header}
          {title(ci === 0)}
          {chunk.map((di) => dayBlock(days[di], di))}
          {ci === chunks.length - 1 && (
            <>
              <div className="doc-center" style={{ margin: '1mm 0 3mm' }}>
                <button type="button" className="doc-add" onClick={addDay}>
                  + adicionar dia
                </button>
              </div>
              {parts}
            </>
          )}
        </div>
      ))}
    </DocEditorShell>
  );
}
