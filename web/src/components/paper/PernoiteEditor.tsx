import { Alert, Badge, Button, Group, Select, SimpleGrid, Switch, Text } from '@mantine/core';
import { IconCopy, IconRefresh, IconX } from '@tabler/icons-react';
import dayjs from 'dayjs';
import { Fragment, useEffect, useMemo, useRef, useState } from 'react';
import { type DocumentRecord, useDocuments } from '../../data/documents';
import { useSaveDocument } from '../docs/editSession';
import { notifyError, notifyOk } from '../../lib/confirm';
import { fmtDate } from '../../lib/format';
import { aditRanks, normalizeAditDays, pernoiteGroups, pernoiteRankDefaults, pernoiteServiceChoices, splitPernoitePersonnel } from '../../print/legacy';
import { DocEditorShell, SideCard } from './DocEditorShell';
import { InlineDate, InlineInput, InlineSuggest, InlineTextarea, RowTool, countNames } from './Inline';

interface ServiceRow { description: string; rankPrefix: string; personnelNames: string; count: number; manual?: boolean }
interface MedicalRow { rankLabel: string; personnel: string }
interface PGroup { rank: string; services: (ServiceRow | MedicalRow)[] }
interface AditDay { date: string; groups: { name: string; rows: { service: string; rank: string; personnel: string }[] }[] }

interface Props {
  opened: boolean;
  onClose: () => void;
  existing: DocumentRecord | null;
  saved: DocumentRecord[];
}

const MEDICAL = 'DISPENSA MÉDICA';
const SUGGESTIONS = (pernoiteServiceChoices as string[]).filter((s) => s !== 'Outros');
const RANK_DEFAULTS = pernoiteRankDefaults as Record<string, string>;
const ADIT_RANKS = aditRanks as Record<string, string>;
const isMedical = (g: PGroup) => g.rank === MEDICAL;
const emptyService = (rank: string): ServiceRow => ({ description: '', rankPrefix: RANK_DEFAULTS[rank] || '', personnelNames: '', count: 0 });
const emptyMedical = (): MedicalRow => ({ rankLabel: '', personnel: '' });
const DEFAULT_FORMATION = (): PGroup[] => ['SARGENTOS', 'CABOS', 'SOLDADOS'].map((rank) => ({ rank, services: [emptyService(rank)] }));
const DEFAULT_DESTINATIONS = (): PGroup[] => [{ rank: 'CABOS', services: [emptyService('CABOS')] }, { rank: 'SOLDADOS', services: [emptyService('SOLDADOS')] }, { rank: MEDICAL, services: [emptyMedical()] }];

/** Converte o formato salvo (inclusive o antigo) para o editor. */
function toEditor(groups: PGroup[]): PGroup[] {
  return groups.map((g) => ({
    rank: g.rank,
    services: (g.services || []).map((row) => {
      if (isMedical(g)) {
        const r = row as MedicalRow & { description?: string };
        return { rankLabel: r.rankLabel || r.description || '', personnel: r.personnel || '' };
      }
      const r = row as ServiceRow;
      const parts = splitPernoitePersonnel(r, g.rank);
      const count = Number(r.count) || 0;
      return { description: String(r.description || '').replace(/:$/, ''), rankPrefix: parts.rankPrefix, personnelNames: parts.personnelNames, count, manual: count !== countNames(parts.personnelNames) };
    }),
  }));
}

const groupSum = (g: PGroup) =>
  isMedical(g) ? g.services.filter((r) => (r as MedicalRow).rankLabel.trim() && (r as MedicalRow).personnel.trim()).length : g.services.reduce((n, r) => n + ((r as ServiceRow).description.trim() ? Number((r as ServiceRow).count) || 0 : 0), 0);

export function PernoiteEditor({ opened, onClose, existing, saved }: Props) {
  const save = useSaveDocument();
  const { data: aditamentos = [] } = useDocuments('aditamento');
  const [serviceDate, setServiceDate] = useState<string | null>(null);
  const [signatureDate, setSignatureDate] = useState<string | null>(null);
  const [commander, setCommander] = useState('');
  const [commanderActing, setCommanderActing] = useState(false);
  const [mainSigner, setMainSigner] = useState('');
  const [mainResponding, setMainResponding] = useState(false);
  const [sergeantOfDay, setSergeantOfDay] = useState('');
  const [formation, setFormation] = useState<PGroup[]>([]);
  const [destinations, setDestinations] = useState<PGroup[]>([]);
  const [city, setCity] = useState('Bagé-RS');
  const [syncSource, setSyncSource] = useState<Record<string, unknown> | null>(null);
  const [sourceId, setSourceId] = useState<string | null>(null);
  const [sourceDay, setSourceDay] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState(false);
  const snapshot = useRef('');

  const out = (groups: PGroup[]) =>
    groups.map((g) => ({
      rank: g.rank,
      services: g.services.map((row) => {
        if (isMedical(g)) {
          const r = row as MedicalRow;
          return { rankLabel: r.rankLabel.trim(), personnel: r.personnel.trim(), count: r.rankLabel.trim() && r.personnel.trim() ? 1 : 0 };
        }
        const r = row as ServiceRow;
        const description = r.description.trim();
        return { description, rankPrefix: r.rankPrefix.trim(), personnelNames: r.personnelNames.trim(), count: description ? Number(r.count) || 0 : 0, personnel: description ? [r.rankPrefix.trim(), r.personnelNames.trim()].filter(Boolean).join(' ') : '' };
      }),
    }));
  const content = () => ({ serviceDate, signatureDate, commander: commander.trim(), commanderActing, formationGroups: out(formation), destinationGroups: out(destinations), mainSigner: mainSigner.trim(), mainResponding, sergeantOfDay: sergeantOfDay.trim(), city, syncSource });

  useEffect(() => {
    if (!opened) return;
    const d = existing?.data || {};
    const today = dayjs().format('YYYY-MM-DD');
    setSubmitted(false);
    setServiceDate(d.serviceDate || existing?.document_date || today);
    setSignatureDate(d.signatureDate || d.serviceDate || today);
    setCommander(d.commander || '');
    setCommanderActing(!!d.commanderActing);
    setMainSigner(d.mainSigner || '');
    setMainResponding(!!d.mainResponding);
    setSergeantOfDay(d.sergeantOfDay || '');
    setFormation(existing ? toEditor(pernoiteGroups(d, 'formation')) : DEFAULT_FORMATION());
    setDestinations(existing ? toEditor(pernoiteGroups(d, 'destinations')) : DEFAULT_DESTINATIONS());
    setCity(d.city || 'Bagé-RS');
    setSyncSource(d.syncSource || null);
    setSourceId(d.syncSource?.documentId ? String(d.syncSource.documentId) : null);
    setSourceDay(d.syncSource?.dayIndex != null ? String(d.syncSource.dayIndex) : null);
  }, [opened, existing]);

  const loaded = formation.length > 0;
  useEffect(() => {
    if (opened && loaded && !snapshot.current) snapshot.current = JSON.stringify(content());
    if (!opened) snapshot.current = '';
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [opened, loaded]);
  const dirty = !!snapshot.current && JSON.stringify(content()) !== snapshot.current;

  const source = aditamentos.find((a) => a.id === Number(sourceId));
  const sourceDays = source ? (normalizeAditDays(source.data || {}) as AditDay[]) : [];

  // Sugere sozinho o aditamento que cobre a data da revista.
  const coveringDate = useMemo(() => {
    if (!serviceDate) return null;
    const n = (d: DocumentRecord) => Number(String(d.bulletin_number || '').match(/\d+/)?.[0] || 0);
    for (const a of [...aditamentos].sort((x, y) => y.document_date.localeCompare(x.document_date) || n(y) - n(x))) {
      const i = (normalizeAditDays(a.data || {}) as AditDay[]).findIndex((d) => d.date === serviceDate);
      if (i >= 0) return { id: String(a.id), day: String(i), number: a.bulletin_number };
    }
    return null;
  }, [aditamentos, serviceDate]);
  useEffect(() => {
    if (opened && !existing?.data?.syncSource && coveringDate && !sourceId) {
      setSourceId(coveringDate.id);
      setSourceDay(coveringDate.day);
    }
  }, [opened, coveringDate, existing, sourceId]);

  // ---------- automações ----------
  /** Sargentos/Cabos/Soldados vão para “Em forma”; Vila Militar e CIMBA para “Outros destinos”. */
  const syncFromAditamento = () => {
    const day = sourceDays[Number(sourceDay)];
    if (!source || !day) return notifyError(new Error('Selecione um aditamento e um dia válido.'), 'Dados incompletos');
    const mapped: Record<string, ServiceRow[]> = { SARGENTOS: [], CABOS: [], SOLDADOS: [] };
    const dest: Record<string, ServiceRow[]> = { CABOS: [], SOLDADOS: [] };
    let sgtOfDay = '';
    for (const group of day.groups || []) {
      const def = group.name === 'Sargentos' ? 'SARGENTOS' : group.name === 'Cabos' ? 'CABOS' : ['Soldados EP', 'Soldados EV'].includes(group.name) ? 'SOLDADOS' : null;
      if (!def) continue;
      for (const row of group.rows || []) {
        const description = String(row.service || '').replace(/:$/, '').trim();
        const lower = description.toLocaleLowerCase('pt-BR');
        const personnelNames = String(row.personnel || '').trim();
        let target = def;
        let destRank = '';
        if (lower.includes('comandante da vila militar')) [target, destRank] = ['DEST_CABOS', 'Cb EP'];
        else if (lower.includes('permanência ao cimba')) [target, destRank] = ['DEST_SOLDADOS', 'Sd EP'];
        else if (lower.includes('guarda a vila militar')) [target, destRank] = ['DEST_SOLDADOS', 'Sd EV'];
        if (!description && !personnelNames) continue;
        const rankPrefix = destRank || String(row.rank || '').trim() || ADIT_RANKS[group.name] || '';
        const item: ServiceRow = { description, rankPrefix, personnelNames, count: countNames(personnelNames) };
        if (target === 'DEST_CABOS') dest.CABOS.push(item);
        else if (target === 'DEST_SOLDADOS') dest.SOLDADOS.push(item);
        else mapped[target].push(item);
        if (group.name === 'Sargentos' && !sgtOfDay && /sargento de dia/i.test(description) && personnelNames) sgtOfDay = [rankPrefix, personnelNames].filter(Boolean).join(' ');
      }
    }
    const medical = destinations.find(isMedical)?.services ?? [emptyMedical()];
    setFormation(['SARGENTOS', 'CABOS', 'SOLDADOS'].map((rank) => ({ rank, services: mapped[rank].length ? mapped[rank] : [emptyService(rank)] })));
    setDestinations([
      { rank: 'CABOS', services: dest.CABOS.length ? dest.CABOS : [emptyService('CABOS')] },
      { rank: 'SOLDADOS', services: dest.SOLDADOS.length ? dest.SOLDADOS : [emptyService('SOLDADOS')] },
      { rank: MEDICAL, services: medical },
    ]);
    if (day.date) changeServiceDate(day.date);
    if (sgtOfDay) setSergeantOfDay(sgtOfDay);
    const dayIndex = Number(sourceDay);
    setSyncSource({ documentId: source.id, bulletinNumber: source.bulletin_number, date: day.date || '', dayIndex, dayNumber: dayIndex + 1 });
    notifyOk(`Escala copiada do aditamento Nr ${source.bulletin_number}, dia ${dayIndex + 1}. Tudo continua editável.`);
  };

  /** Dispensas médicas e assinantes do pernoite anterior mais recente. */
  const copyPrevious = () => {
    const previous = saved
      .filter((x) => x.id !== existing?.id)
      .map((item) => ({ item, date: item.data?.serviceDate || item.document_date || '' }))
      .filter((e) => e.date && (!serviceDate || e.date < serviceDate))
      .sort((a, b) => b.date.localeCompare(a.date))[0]?.item;
    if (!previous) return notifyError(new Error('Não há pernoite anterior a esta data para copiar.'), 'Nada para copiar');
    const group = (pernoiteGroups(previous.data || {}, 'destinations') as PGroup[]).find(isMedical);
    const rows = ((group?.services || []) as (MedicalRow & { description?: string })[]).filter((r) => (r.rankLabel || r.description || '').trim() && (r.personnel || '').trim());
    if (rows.length) setDestinations((list) => list.map((g) => (isMedical(g) ? { ...g, services: rows.map((r) => ({ rankLabel: r.rankLabel || r.description || '', personnel: r.personnel })) } : g)));
    setCommander(previous.data?.commander || commander);
    setCommanderActing(!!previous.data?.commanderActing);
    setMainSigner(previous.data?.mainSigner || mainSigner);
    setMainResponding(!!previous.data?.mainResponding);
    notifyOk(`${rows.length ? `${rows.length} dispensa(s) médica(s) e ` : ''}assinantes copiados do pernoite de ${fmtDate(previous.data?.serviceDate || previous.document_date)}.`);
  };

  const submit = () => {
    setSubmitted(true);
    if (!serviceDate || !signatureDate || !commander.trim() || !mainSigner.trim()) return notifyError(new Error('Preencha os campos destacados em vermelho.'), 'Campos obrigatórios');
    save.mutate(
      { id: existing?.id, kind: 'pernoite', bulletin_number: `P-${serviceDate}`, document_date: serviceDate, data: content() },
      {
        onSuccess: () => {
          notifyOk(existing ? 'Pernoite atualizado.' : 'Pernoite salvo no arquivo.');
          onClose();
        },
        onError: (e) => notifyError(e),
      },
    );
  };

  // A data da assinatura acompanha a da revista enquanto as duas forem iguais.
  const changeServiceDate = (v: string | null) => {
    if (!signatureDate || signatureDate === serviceDate) setSignatureDate(v);
    setServiceDate(v);
  };

  const req = (v: string | null) => submitted && !String(v || '').trim();
  const inTotal = formation.reduce((n, g) => n + groupSum(g), 0);
  const outTotal = destinations.reduce((n, g) => n + groupSum(g), 0);

  // ---------- tabelas ----------
  const groupRows = (groups: PGroup[], setGroups: React.Dispatch<React.SetStateAction<PGroup[]>>) =>
    groups.map((g, gi) => {
      const medical = isMedical(g);
      const setRow = (ri: number, patch: Partial<ServiceRow & MedicalRow>) => setGroups((l) => l.map((x, i) => (i !== gi ? x : { ...x, services: x.services.map((r, j) => (j === ri ? { ...r, ...patch } : r)) })));
      const removeRow = (ri: number) => setGroups((l) => l.map((x, i) => (i !== gi ? x : { ...x, services: x.services.length > 1 ? x.services.filter((_, j) => j !== ri) : [medical ? emptyMedical() : emptyService(g.rank)] })));
      const sum = groupSum(g);
      return (
        <tr key={g.rank}>
          <th>{g.rank}</th>
          <td style={{ textAlign: 'left' }}>
            {g.services.map((row, ri) => (
              <div key={ri} className="doc-row doc-tools-host" style={{ display: 'flex', alignItems: 'baseline', gap: 4, marginBottom: '1mm' }}>
                {medical ? (
                  <>
                    <div style={{ width: '24mm', fontWeight: 'bold' }}>
                      <InlineInput value={(row as MedicalRow).rankLabel} onChange={(v) => setRow(ri, { rankLabel: v })} placeholder="Sd EP" />
                    </div>
                    <b>:</b>
                    <div style={{ flex: 1 }}>
                      <InlineInput value={(row as MedicalRow).personnel} onChange={(v) => setRow(ri, { personnel: v })} placeholder="nome" />
                    </div>
                  </>
                ) : (
                  <>
                    <InlineSuggest
                      autoWidth
                      bold
                      value={(row as ServiceRow).description}
                      onChange={(v) => setRow(ri, { description: v, ...(!(row as ServiceRow).manual && v.trim() && !(row as ServiceRow).count ? { count: 1 } : {}) })}
                      data={SUGGESTIONS}
                      placeholder="Serviço"
                    />
                    <b>:</b>
                    <InlineInput value={(row as ServiceRow).rankPrefix} onChange={(v) => setRow(ri, { rankPrefix: v })} inlineWidth={6} placeholder="P/G" />
                    <div style={{ flex: 1 }}>
                      <InlineTextarea
                        value={(row as ServiceRow).personnelNames}
                        onChange={(v) => setRow(ri, (row as ServiceRow).manual ? { personnelNames: v } : { personnelNames: v, count: countNames(v) })}
                        placeholder="nome(s) de guerra"
                      />
                    </div>
                  </>
                )}
                <div className="doc-row-tools">
                  {!medical && (
                    <span title="Quantidade deste serviço (calculada pelos nomes; pode ajustar)">
                      <input
                        className="doc-field"
                        type="number"
                        min={0}
                        max={999}
                        value={(row as ServiceRow).count}
                        onChange={(e) => setRow(ri, { count: Number(e.currentTarget.value) || 0, manual: true })}
                        style={{ width: 44, background: '#fff', boxShadow: '0 0 0 1px #c9d3c9', borderRadius: 4, fontFamily: 'var(--mantine-font-family)', fontSize: 12, textAlign: 'center' }}
                      />
                    </span>
                  )}
                  <RowTool label="Remover linha" color="red" onClick={() => removeRow(ri)}>
                    <IconX size={14} />
                  </RowTool>
                </div>
              </div>
            ))}
            <button type="button" className="doc-add" onClick={() => setGroups((l) => l.map((x, i) => (i === gi ? { ...x, services: [...x.services, medical ? emptyMedical() : emptyService(g.rank)] } : x)))}>
              + {medical ? 'militar' : 'serviço'}
            </button>
          </td>
          <td className="doc-num">{sum || '-'}</td>
        </tr>
      );
    });

  const sidebar = (
    <>
      <SideCard title="Sincronizar com aditamento" icon={<IconRefresh size={16} />}>
        <Text size="xs" c="dimmed">
          Copia serviços e militares do dia escolhido. Vila Militar e CIMBA vão para “Outros destinos”.
        </Text>
        {coveringDate && (
          <Badge variant="light" color="sigase" style={{ whiteSpace: 'normal', height: 'auto' }} py={4}>
            Aditamento Nr {coveringDate.number} cobre esta data
          </Badge>
        )}
        <Select
          size="xs"
          label="Aditamento"
          placeholder="Escolha o aditamento"
          searchable
          comboboxProps={{ zIndex: 400 }}
          data={[...aditamentos]
            .sort((a, b) => b.document_date.localeCompare(a.document_date))
            .map((a) => ({ value: String(a.id), label: `Nr ${a.bulletin_number} · ${fmtDate(a.document_date)}` }))}
          value={sourceId}
          onChange={(v) => {
            setSourceId(v);
            setSourceDay(null);
          }}
        />
        <Select
          size="xs"
          label="Dia"
          placeholder={source ? 'Escolha o dia' : '—'}
          disabled={!source}
          comboboxProps={{ zIndex: 400 }}
          data={sourceDays.map((d, i) => ({ value: String(i), label: `${d.date ? fmtDate(d.date) : 'sem data'} — dia ${i + 1}` }))}
          value={sourceDay}
          onChange={setSourceDay}
        />
        <Button leftSection={<IconRefresh size={16} />} disabled={!source || sourceDay == null} onClick={syncFromAditamento}>
          Copiar escala para a folha
        </Button>
        {syncSource && (
          <Text size="xs" c="dimmed">
            Última sincronização: aditamento Nr {String(syncSource.bulletinNumber)}, dia {String(syncSource.dayNumber)}.
          </Text>
        )}
      </SideCard>

      <SideCard title="Copiar do pernoite anterior" icon={<IconCopy size={16} />}>
        <Text size="xs" c="dimmed">
          Traz as dispensas médicas e os assinantes do pernoite mais recente antes desta data.
        </Text>
        <Button variant="light" leftSection={<IconCopy size={16} />} onClick={copyPrevious}>
          Copiar dispensas e assinantes
        </Button>
      </SideCard>

      <SideCard title="Resumo">
        <SimpleGrid cols={3} spacing="xs">
          {[
            ['Em forma', inTotal],
            ['Outros', outTotal],
            ['Efetivo', inTotal + outTotal],
          ].map(([label, value]) => (
            <div key={label} style={{ textAlign: 'center' }}>
              <Text fw={800} size="xl" ff="heading">
                {value}
              </Text>
              <Text size="xs" c="dimmed">
                {label}
              </Text>
            </div>
          ))}
        </SimpleGrid>
      </SideCard>

      <Alert variant="light" color="gray" p="xs">
        <Text size="xs">A soma de cada serviço é contada pelos nomes (separados por vírgula ou “e”). Passe o mouse na linha para ajustar o número ou removê-la.</Text>
      </Alert>
    </>
  );

  const box = { border: '1px solid #222' };
  return (
    <DocEditorShell
      opened={opened}
      eyebrow="Área documental · Pernoite"
      title={`${existing ? 'Editar' : 'Novo'} pernoite${serviceDate ? ` · ${fmtDate(serviceDate)}` : ''}`}
      dirty={dirty}
      saving={save.isPending}
      submitLabel={existing ? 'Salvar alterações' : 'Salvar pernoite'}
      onCancel={onClose}
      onSave={submit}
      sidebar={sidebar}
    >
      <div className="doc-sheet" style={{ fontSize: '9.5pt' }}>
        <div style={{ ...box, display: 'grid', gridTemplateColumns: '34mm 1fr', minHeight: '44mm' }}>
          <aside style={{ borderRight: '1px solid #222', textAlign: 'center', padding: '2mm', display: 'flex', flexDirection: 'column', justifyContent: 'space-around', fontSize: '9pt' }}>
            <i>VISTO:</i>
            <div style={{ borderBottom: '1px solid #222', height: '8mm' }} />
            <InlineInput value={commander} onChange={setCommander} bold placeholder="Comandante" invalid={req(commander)} />
            <small>{commanderActing ? 'Resp. Cmt 3ª BO' : 'Cmt da 3ª BO'}</small>
            <Group justify="center">
              <Switch size="xs" label={<span className="doc-ghost">resp.</span>} checked={commanderActing} onChange={(e) => setCommanderActing(e.currentTarget.checked)} />
            </Group>
          </aside>
          <div className="doc-header" style={{ justifyContent: 'center', fontSize: '9.5pt' }}>
            <span>MINISTÉRIO DA DEFESA</span>
            <span>EXÉRCITO BRASILEIRO</span>
            <span>25º GRUPO DE ARTILHARIA DE CAMPANHA</span>
            <span>(Corpo de Artilharia a Cavalo/1831)</span>
            <span>GRUPO LEITE DE CASTRO</span>
            <span>3ª BATERIA DE OBUSES</span>
          </div>
        </div>
        <div style={{ ...box, borderTop: 0, textAlign: 'center', fontWeight: 'bold', fontSize: '11pt', padding: '2mm' }}>3ª BATERIA DE OBUSES</div>
        <div style={{ ...box, borderTop: 0, textAlign: 'center', fontWeight: 'bold', fontSize: '12pt', padding: '2mm' }}>
          REVISTA DO RECOLHER DO DIA <InlineDate value={serviceDate} onChange={changeServiceDate} invalid={req(serviceDate)} />
        </div>

        <table className="doc-table" style={{ margin: 0 }}>
          <thead>
            <tr>
              <th style={{ width: '21%' }}>GRADUAÇÃO</th>
              <th>EM FORMA</th>
              <th style={{ width: '12%' }}>SOMA</th>
            </tr>
          </thead>
          <tbody>
            {groupRows(formation, setFormation)}
            <tr>
              <th colSpan={2}>TOTAL</th>
              <td className="doc-num">{inTotal || '-'}</td>
            </tr>
          </tbody>
        </table>

        <table className="doc-table" style={{ marginTop: '5mm' }}>
          <thead>
            <tr>
              <th style={{ width: '21%' }}>GRADUAÇÃO</th>
              <th>OUTROS DESTINOS</th>
              <th style={{ width: '12%' }}>SOMA</th>
            </tr>
          </thead>
          <tbody>
            {groupRows(destinations, setDestinations)}
            <tr>
              <th colSpan={2}>TOTAL</th>
              <td className="doc-num">{outTotal || '-'}</td>
            </tr>
            <tr>
              <th colSpan={2}>ESTADO DO EFETIVO</th>
              <td className="doc-num">
                <b>{inTotal + outTotal || '-'}</b>
              </td>
            </tr>
          </tbody>
        </table>

        <p className="doc-center" style={{ margin: '2mm 0 0' }}>
          <InlineInput value={city} onChange={setCity} inlineWidth={8} />, <InlineDate value={signatureDate} onChange={setSignatureDate} weekday={false} invalid={req(signatureDate)} />.
        </p>

        <div className="doc-sign" style={{ marginTop: '11mm' }}>
          <InlineInput value={mainSigner} onChange={setMainSigner} placeholder="Nome do sargenteante" invalid={req(mainSigner)} />
          <div className="doc-role">{mainResponding ? 'Resp. Sargenteante da 3ªBia O' : 'Sargenteante da 3ª Bateria de Obuses'}</div>
          <Group justify="center" mt={4}>
            <Switch size="xs" label={<span className="doc-ghost">respondendo</span>} checked={mainResponding} onChange={(e) => setMainResponding(e.currentTarget.checked)} />
          </Group>
        </div>

        <table className="doc-table" style={{ marginTop: '10mm' }}>
          <tbody>
            <tr>
              <th colSpan={2}>REVISTA DO RECOLHER ______ ALTERAÇÃO</th>
            </tr>
            <tr>
              <td rowSpan={2} style={{ width: '22%', textAlign: 'center', verticalAlign: 'top' }}>
                Visto:
                <div style={{ borderBottom: '1px solid #222', height: '13mm', margin: '0 auto 1mm', width: '85%' }} />
                <b>OF DE DIA</b>
              </td>
              <td>
                Quartel em {city || 'Bagé-RS'}, ____ de ______________ de ____.
              </td>
            </tr>
            <tr>
              <td style={{ textAlign: 'center' }}>
                <div style={{ borderBottom: '1px solid #222', height: '8mm', width: '70%', margin: '0 auto 1mm' }} />
                <Group justify="center" gap={4} wrap="nowrap">
                  <span>Sgt de Dia -</span>
                  <InlineInput value={sergeantOfDay} onChange={setSergeantOfDay} inlineWidth={18} placeholder="graduação e nome" />
                </Group>
              </td>
            </tr>
            <tr>
              <td style={{ textAlign: 'center', fontWeight: 'bold', fontSize: '9pt' }}>OBS: Havendo alterações, deverão ser lançadas ao lado.</td>
              <td>
                {[0, 1, 2].map((i) => (
                  <Fragment key={i}>
                    <div style={{ height: '6mm', borderBottom: '1px solid #222' }} />
                  </Fragment>
                ))}
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </DocEditorShell>
  );
}
