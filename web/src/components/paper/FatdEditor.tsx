import { Alert, Button, Select, Text } from '@mantine/core';
import { IconCopy, IconUser, IconUserSearch } from '@tabler/icons-react';
import dayjs from 'dayjs';
import { useEffect, useMemo, useState } from 'react';
import { type DocumentRecord, useSaveDocument } from '../../data/documents';
import { type UnitPerson, useUnitPersonnel } from '../../data/unit';
import { notifyError, notifyOk } from '../../lib/confirm';
import { reqRank, richPersonName, splitWarName } from '../../print/legacy';
import { DocEditorShell, SideCard } from './DocEditorShell';
import { InlineDate, InlineInput, InlinePerson, InlineSelect, InlineTextarea } from './Inline';
import { useDirty } from './useDirty';

interface Props {
  opened: boolean;
  onClose: () => void;
  existing: DocumentRecord | null;
  saved: DocumentRecord[];
}

const SUBUNITS = ['3ª Bia O', '2ª Bia O', '1ª Bia O', 'BC', 'Estado maior'];
const REQUIRED = ['process_number', 'date', 'militaryPersonId', 'militaryRank', 'militaryId', 'militaryName', 'militarySubunit', 'participantRank', 'participantId', 'participantName', 'participantSubunit', 'report', 'authorityRank', 'authorityName'] as const;
const num = (d: DocumentRecord) => Number(String(d.bulletin_number || '').match(/^([0-9]+)/)?.[1] || 0);
/** "24 NOV 2026", como no formulário impresso. */
const shortDate = (iso: string) => new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: 'short', year: 'numeric' }).format(dayjs(iso).toDate()).replace(/\sde\s/g, ' ').replace(/\./g, '').toUpperCase();

const blank = {
  process_number: '', date: '', militaryPersonId: '', militaryRank: '', militaryId: '', militaryName: '', militaryWarName: '', militarySubunit: '3ª Bia O',
  participantRank: '', participantId: '', participantName: '', participantSubunit: '3ª Bia O', report: '', authorityRank: '', authorityName: '', authoritySubunit: '', authorityRole: '',
};
type FatdData = typeof blank;
const lastParts = (prev: DocumentRecord[]) => {
  const last = [...prev].sort((a, b) => num(b) - num(a))[0]?.data || {};
  return {
    participantRank: last.participantRank || '', participantId: last.participantId || '', participantName: last.participantName || '', participantSubunit: last.participantSubunit || '3ª Bia O',
    authorityRank: last.authorityRank || '', authorityName: last.authorityName || '', authoritySubunit: last.authoritySubunit || '', authorityRole: last.authorityRole || '',
  };
};

export function FatdEditor({ opened, onClose, existing, saved }: Props) {
  const { data: roster = [] } = useUnitPersonnel();
  const save = useSaveDocument();
  const [v, setV] = useState<FatdData>(blank);
  const [submitted, setSubmitted] = useState(false);
  const set = (patch: Partial<FatdData>) => setV((cur) => ({ ...cur, ...patch }));
  const previous = useMemo(() => saved.filter((d) => d.id !== existing?.id), [saved, existing]);

  useEffect(() => {
    if (!opened) return;
    setSubmitted(false);
    if (existing) {
      const d = existing.data || {};
      const split = splitWarName(d.militaryName);
      const matched = Number(d.militaryPersonId) || roster.find((p) => String(d.militaryName || '').toLocaleLowerCase('pt-BR').includes(String(p.full_name || '').toLocaleLowerCase('pt-BR')))?.id || '';
      setV({ ...blank, ...d, process_number: existing.bulletin_number || d.process_number, date: d.date || existing.document_date, militaryPersonId: matched ? String(matched) : '', militaryName: split.full, militaryWarName: d.militaryWarName || split.war });
    } else {
      const year = dayjs().year();
      setV({ ...blank, ...lastParts(saved), process_number: `${String(saved.reduce((n, d) => Math.max(n, num(d)), 0) + 1).padStart(3, '0')}/${year}`, date: dayjs().format('YYYY-MM-DD') });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [opened, existing]);

  const dirty = useDirty(opened, !!v.process_number, v);
  const options = roster.map((p) => ({ value: String(p.id), label: `${reqRank(p)} · ${p.war_name || p.full_name} — ${p.full_name}` }));
  const pickMilitary = (id: string | null) => {
    const p = roster.find((r) => r.id === Number(id));
    if (p) set({ militaryPersonId: String(p.id), militaryRank: reqRank(p), militaryId: p.military_id || p.cpf || '', militaryName: p.full_name || '', militaryWarName: p.war_name || '' });
  };
  const pickParticipant = (id: string | null) => {
    const p: UnitPerson | undefined = roster.find((r) => r.id === Number(id));
    if (p) set({ participantRank: reqRank(p), participantId: p.military_id || p.military_number || p.cpf || '', participantName: p.full_name, participantSubunit: v.participantSubunit || '3ª Bia O' });
  };

  const bad = (k: keyof FatdData) => submitted && REQUIRED.includes(k as (typeof REQUIRED)[number]) && !String(v[k] || '').trim();
  const field = (k: keyof FatdData, placeholder: string, width?: number) => <InlineInput value={v[k]} onChange={(x) => set({ [k]: x } as Partial<FatdData>)} placeholder={placeholder} invalid={bad(k)} inlineWidth={width} />;

  const submit = () => {
    setSubmitted(true);
    const content: Record<string, unknown> = Object.fromEntries(Object.entries(v).map(([k, val]) => [k, typeof val === 'string' ? val.trim() : val]));
    if (REQUIRED.some((k) => !String(content[k] || ''))) return notifyError(new Error('Preencha os campos destacados em vermelho.'), 'Campos obrigatórios');
    content.militaryPersonId = Number(content.militaryPersonId) || null;
    save.mutate(
      { id: existing?.id, kind: 'fatd', bulletin_number: String(content.process_number), document_date: String(content.date), data: content },
      {
        onSuccess: () => {
          notifyOk(existing ? 'FATD atualizado.' : 'FATD salvo no arquivo.');
          onClose();
        },
        onError: (e) => notifyError(e),
      },
    );
  };

  const military = v.militaryName ? `${richPersonName(v.militaryName, v.militaryWarName)}${v.militaryRank ? ` - ${v.militaryRank}` : ''}` : '';
  const participant = v.participantName ? `${richPersonName(v.participantName)}${v.participantRank ? ` — ${v.participantRank}` : ''}` : '';
  const year = (v.date || '').slice(0, 4);
  const lines = (n: number) => Array.from({ length: n }, (_, i) => <div key={i} className="fatd-line" />);

  const sidebar = (
    <>
      <SideCard title="Militar arrolado" icon={<IconUser size={16} />}>
        <Select size="xs" searchable placeholder="Buscar no efetivo" data={options} value={v.militaryPersonId || null} onChange={pickMilitary} comboboxProps={{ zIndex: 400 }} />
        <Text size="xs" c="dimmed">
          Preenche graduação, IDT (ou CPF) e nome completo. Também dá para clicar no nome direto na folha.
        </Text>
      </SideCard>
      <SideCard title="Participante do efetivo" icon={<IconUserSearch size={16} />}>
        <Select size="xs" searchable placeholder="Buscar no efetivo" data={options} value={null} onChange={pickParticipant} comboboxProps={{ zIndex: 400 }} />
        <Text size="xs" c="dimmed">
          Opcional: o participante também pode ser digitado na folha.
        </Text>
      </SideCard>
      <SideCard title="Repetir do FATD anterior" icon={<IconCopy size={16} />}>
        <Button variant="light" leftSection={<IconCopy size={16} />} disabled={!previous.length} onClick={() => (set(lastParts(previous)), notifyOk('Participante e autoridade copiados do último FATD.'))}>
          Copiar participante e autoridade
        </Button>
      </SideCard>
      <Alert variant="light" color="gray" p="xs">
        <Text size="xs">Justificativas, datas manuscritas e o número do BI ficam em branco, como no modelo, para preenchimento à caneta.</Text>
      </Alert>
    </>
  );

  return (
    <DocEditorShell
      opened={opened}
      eyebrow="Área documental · FATD"
      title={`${existing ? 'Editar' : 'Novo'} FATD${v.process_number ? ` · Processo ${v.process_number}` : ''}`}
      dirty={dirty}
      saving={save.isPending}
      submitLabel={existing ? 'Salvar alterações' : 'Salvar FATD'}
      onCancel={onClose}
      onSave={submit}
      sidebar={sidebar}
    >
      <div className="doc-sheet" style={{ border: '1px solid #222', padding: '3mm 3mm 2mm' }}>
        <div className="req-head" style={{ fontWeight: 'bold' }}>
          <img src="/assets/documents/fatd-emblem.png" alt="" style={{ width: '40mm', height: '37mm', marginBottom: '1mm' }} />
          <span>MINISTÉRIO DA DEFESA</span>
          <span>EXÉRCITO BRASILEIRO</span>
          <span>25º GRUPO DE ARTILHARIA DE CAMPANHA</span>
          <span>(Corpo de Artilharia a Cavalo/1831)</span>
          <span>GRUPO LEITE DE CASTRO</span>
        </div>
        <h2 style={{ textAlign: 'center', fontSize: '11pt', margin: '5mm 0 4mm' }}>FORMULÁRIO DE APURAÇÃO DE TRANSGRESSÃO DISCIPLINAR</h2>
        <div style={{ borderTop: '1px solid #222', borderBottom: '1px solid #222', display: 'flex', justifyContent: 'space-between', padding: '1mm 2mm' }}>
          <span>
            <b>PROCESSO Nº:</b> {field('process_number', '000/0000', 9)}
          </span>
          <span>
            <b>DATA:</b> <InlineDate value={v.date || null} onChange={(x) => set({ date: x })} format={shortDate} invalid={bad('date')} />
          </span>
        </div>

        <section className="fatd-box">
          <h3>IDENTIFICAÇÃO DO MILITAR</h3>
          <div>
            <b>Grau Hierárquico:</b> {field('militaryRank', 'graduação', 8)} <b style={{ marginLeft: '12mm' }}>IDT/CPF:</b> {field('militaryId', 'identidade', 14)}
          </div>
          <div>
            <b>Nome Completo:</b> <InlinePerson html={v.militaryName ? richPersonName(v.militaryName, v.militaryWarName) : ''} options={options} onPick={pickMilitary} invalid={bad('militaryPersonId') || bad('militaryName')} />
          </div>
          <div>
            <b>Subunidade/OM:</b> <InlineSelect value={v.militarySubunit} onChange={(x) => set({ militarySubunit: x })} data={SUBUNITS} invalid={bad('militarySubunit')} />
          </div>
        </section>

        <section className="fatd-box">
          <h3>IDENTIFICAÇÃO DO PARTICIPANTE</h3>
          <div>
            <b>Grau Hierárquico:</b> {field('participantRank', 'graduação', 8)} <b style={{ marginLeft: '12mm' }}>NR/IDT:</b> {field('participantId', 'identidade', 14)}
          </div>
          <div style={{ display: 'flex', gap: 4 }}>
            <b style={{ whiteSpace: 'nowrap' }}>Nome Completo:</b> {field('participantName', 'nome completo do participante')}
          </div>
          <div>
            <b>Subunidade/OM:</b> {field('participantSubunit', 'subunidade', 10)}
          </div>
        </section>

        <section className="fatd-box" style={{ minHeight: '39mm', display: 'flex', flexDirection: 'column' }}>
          <h3>RELATO DO FATO</h3>
          <div style={{ textAlign: 'justify' }}>
            <InlineTextarea value={v.report} onChange={(x) => set({ report: x })} placeholder="Descreva o fato…" invalid={bad('report')} />
          </div>
          <div style={{ textAlign: 'center', marginTop: 'auto', paddingTop: '3mm' }} dangerouslySetInnerHTML={{ __html: participant || '<span class="doc-ghost">assinatura do participante</span>' }} />
        </section>

        <section className="fatd-box" style={{ paddingBottom: '6mm' }}>
          <h3>CIENTE DO MILITAR ARROLADO</h3>
          <p style={{ textAlign: 'center', margin: '1mm 4mm' }}>
            Declaro que tenho conhecimento de que me está sendo imputada a autoria do fato acima e me foi concedido o prazo de três dias úteis, para apresentar, por escrito, as minhas justificativas ou razões de defesa.
          </p>
          <div style={{ textAlign: 'center', marginTop: '4mm' }}>
            <b>Data:</b> &nbsp; ____ &nbsp; de &nbsp; ______________ &nbsp; de {year}
          </div>
          <div style={{ textAlign: 'center', marginTop: '12mm' }} dangerouslySetInnerHTML={{ __html: military || '<span class="doc-ghost">assinatura do militar</span>' }} />
        </section>
      </div>

      <div className="doc-sheet" style={{ border: '1px solid #222', padding: 0 }}>
        <section style={{ borderBottom: '1px solid #222', padding: '2mm' }}>
          <h3 style={{ textAlign: 'center', fontSize: '10pt', margin: '0 0 5mm' }}>JUSTIFICATIVAS / RAZÕES DE DEFESA</h3>
          {lines(13)}
          <p style={{ margin: '10mm 0 0' }}>DATA: &nbsp;____ / ____ / ______</p>
          <div style={{ textAlign: 'center', margin: '6mm 0 2mm' }} dangerouslySetInnerHTML={{ __html: military || '<span class="doc-ghost">assinatura do militar</span>' }} />
        </section>
        <section style={{ padding: '2mm' }}>
          <h3 style={{ textAlign: 'center', fontSize: '10pt', margin: '0 0 5mm' }}>DECISÃO DA AUTORIDADE COMPETENTE PARA APLICAR A PUNIÇÃO DISCIPLINAR.</h3>
          {lines(8)}
          <p style={{ margin: '1mm 0 0' }}>DATA: ____ / ____ / ______</p>
          <div style={{ textAlign: 'center', marginTop: '10mm', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
            <div style={{ fontWeight: 'bold' }}>
              {field('authorityRank', 'graduação', 6)} {field('authorityName', 'nome completo da autoridade', 30)}
            </div>
            <div style={{ width: '70%' }}>{field('authorityRole', 'função / cargo (opcional)')}</div>
            <div style={{ width: '50%' }}>{field('authoritySubunit', 'subunidade (opcional)')}</div>
          </div>
          <p style={{ margin: '7mm 0 2mm', fontSize: '9.5pt' }}>PUNIÇÃO PUBLICADA NO BI nº ________, de ______ de __________________ de __________.</p>
        </section>
      </div>
    </DocEditorShell>
  );
}
