import { Alert, Button, Group, Select, Switch, Text } from '@mantine/core';
import { DateInput } from '@mantine/dates';
import { IconBeach, IconBold, IconCalendar, IconUser } from '@tabler/icons-react';
import dayjs from 'dayjs';
import { useEffect, useMemo, useState } from 'react';
import { type DocumentRecord } from '../../data/documents';
import { useSaveDocument } from '../docs/editSession';
import { useUnitPersonnel } from '../../data/unit';
import { useVacationPlan } from '../../data/vacation';
import { notifyError, notifyOk } from '../../lib/confirm';
import { capitalize, fmtDate } from '../../lib/format';
import { reqExpandedRank, reqRank, reqRichName } from '../../print/legacy';
import { DocEditorShell, SideCard } from './DocEditorShell';
import { InlineInput, InlinePerson, InlineSelect } from './Inline';
import { useDirty } from './useDirty';
import { BoldWordsPicker } from './bold';

interface Props {
  opened: boolean;
  onClose: () => void;
  existing: DocumentRecord | null;
  saved: DocumentRecord[];
}

type Profile = Record<string, string>;
const MONTHS = Array.from({ length: 12 }, (_, i) => ({ value: String(i + 1), label: new Intl.DateTimeFormat('pt-BR', { month: 'long' }).format(new Date(2026, i, 1)) }));
const YEARS = Array.from({ length: 16 }, (_, i) => String(new Date().getFullYear() - 5 + i));
const DEFAULT_COMMANDER = 'LEANDRO ANDRE PEDROSO DA SILVA - Ten Cel';
/** "NOME - Posto" com o primeiro nome e o posto em negrito, como na assinatura impressa. */
const commanderHtml = (value: string) => {
  const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
  const m = value.trim().match(/^(\S+)(.*?)(\s-\s)(.+)$/);
  return m ? `<b>${esc(m[1])}</b>${esc(m[2])}${esc(m[3])}<b>${esc(m[4])}</b>` : esc(value);
};

export function AdiantamentoEditor({ opened, onClose, existing, saved }: Props) {
  const { data: roster = [] } = useUnitPersonnel();
  const { data: periods = [] } = useVacationPlan();
  const save = useSaveDocument();
  const [personId, setPersonId] = useState('');
  const [profile, setProfile] = useState<Profile>({});
  const [f, setF] = useState({ ebNumber: '', issueDate: '', installment: 'Primeira', vacationYear: YEARS[5], vacationMonth: '1', vacationMonthYear: YEARS[5], commanderName: DEFAULT_COMMANDER, commanderResponding: false });
  const [submitted, setSubmitted] = useState(false);
  const set = (patch: Partial<typeof f>) => setF((c) => ({ ...c, ...patch }));
  const last = useMemo(() => [...saved].filter((d) => d.id !== existing?.id).sort((a, b) => b.document_date.localeCompare(a.document_date))[0], [saved, existing]);

  useEffect(() => {
    if (!opened) return;
    const d = existing?.data || {};
    const now = new Date();
    setSubmitted(false);
    setPersonId(d.personId ? String(d.personId) : '');
    setProfile(d.profile || {});
    setF({
      ebNumber: existing?.bulletin_number || d.ebNumber || '',
      issueDate: existing?.document_date || dayjs().format('YYYY-MM-DD'),
      installment: d.installment || 'Primeira',
      vacationYear: String(d.vacationYear || now.getFullYear()),
      vacationMonth: String(d.vacationMonth || now.getMonth() + 1),
      vacationMonthYear: String(d.vacationMonthYear || now.getFullYear()),
      commanderName: existing ? d.commanderName || '' : last?.data?.commanderName || DEFAULT_COMMANDER,
      commanderResponding: existing ? !!d.commanderResponding : !!last?.data?.commanderResponding,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [opened, existing]);

  const dirty = useDirty(opened, !!f.issueDate, { personId, f });
  const options = roster.map((p) => ({ value: String(p.id), label: `${reqRank(p)} · ${p.war_name} · ${p.full_name}` }));

  /** Próximo período de férias do militar no Plano de férias. */
  const nextVacation = (id: string) =>
    periods
      .filter((p) => String(p.person_id) === id && p.end_date >= dayjs().format('YYYY-MM-DD'))
      .sort((a, b) => a.start_date.localeCompare(b.start_date))[0];

  const applyVacation = (id: string, quiet = false) => {
    const v = nextVacation(id);
    if (!v) {
      if (!quiet) notifyError(new Error('Este militar não tem férias futuras no Plano de férias.'), 'Nada encontrado');
      return;
    }
    set({ vacationMonth: String(dayjs(v.start_date).month() + 1), vacationMonthYear: String(dayjs(v.start_date).year()), vacationYear: String(v.reference_year) });
    notifyOk(`Mês das férias preenchido pelo Plano de férias (início em ${fmtDate(v.start_date)}, REF ${v.reference_year}).`);
  };

  const pickPerson = (id: string | null) => {
    const p = roster.find((r) => String(r.id) === id);
    if (!p) return;
    setPersonId(String(p.id));
    setProfile({ rank: p.rank, war_name: p.war_name, full_name: p.full_name, prec_cp: p.prec_cp || '', military_number: p.military_number || '' });
    applyVacation(String(p.id), true);
  };

  const rank = reqRank(profile);
  const name = profile.full_name ? reqRichName(profile.full_name, profile.war_name) : '';
  const errors = { person: !personId || !profile.full_name, eb: !f.ebNumber.trim(), commander: !f.commanderName.trim(), date: !f.issueDate };
  const bad = (k: keyof typeof errors) => submitted && errors[k];
  const upcoming = personId ? nextVacation(personId) : undefined;

  const submit = () => {
    setSubmitted(true);
    if (Object.values(errors).some(Boolean)) return notifyError(new Error('Preencha os campos destacados em vermelho.'), 'Campos obrigatórios');
    const person = roster.find((r) => String(r.id) === personId);
    const snapshot = person ? { rank: person.rank, war_name: profile.war_name || person.war_name, full_name: person.full_name, prec_cp: person.prec_cp || '', military_number: person.military_number || '' } : profile;
    const content = { personId: Number(personId), profile: snapshot, ebNumber: f.ebNumber.trim(), installment: f.installment, vacationYear: f.vacationYear, vacationMonth: Number(f.vacationMonth), vacationMonthYear: f.vacationMonthYear, commanderName: f.commanderName.trim(), commanderResponding: f.commanderResponding };
    save.mutate(
      { id: existing?.id, kind: 'adiantamento13', bulletin_number: f.ebNumber.trim(), document_date: f.issueDate, data: content },
      {
        onSuccess: () => {
          notifyOk(existing ? 'Requerimento atualizado.' : 'Requerimento salvo no arquivo.');
          onClose();
        },
        onError: (err) =>
          notifyError(/tipo documental inválido/i.test(err.message) ? new Error('O Supabase ainda não aceita este requerimento. Execute supabase/migration_adiantamento13_documents.sql e reinicie o SIGASE.') : err),
      },
    );
  };

  const personBold = { full: profile.full_name || '', war: profile.war_name || '', onChange: (w: string) => setProfile((p) => ({ ...p, war_name: w })) };
  const person = <InlinePerson html={name} options={options} onPick={pickPerson} invalid={bad('person')} bold={profile.full_name ? personBold : undefined} />;
  const sidebar = (
    <>
      <SideCard title="Militar" icon={<IconUser size={16} />}>
        <Select size="xs" searchable placeholder="Buscar no efetivo" data={options} value={personId || null} onChange={pickPerson} comboboxProps={{ zIndex: 400 }} />
        <Text size="xs" c="dimmed">
          Graduação, nome e PREC-CP vêm da ficha do efetivo.
        </Text>
      </SideCard>
      {profile.full_name && (
        <SideCard title="Negrito do nome de guerra" icon={<IconBold size={16} />}>
          <BoldWordsPicker label="Militar" {...personBold} />
          <Text size="xs" c="dimmed">
            Ou selecione parte do nome na folha e aperte Ctrl+B.
          </Text>
        </SideCard>
      )}
      <SideCard title="Férias do militar" icon={<IconBeach size={16} />}>
        {upcoming ? (
          <Alert variant="light" color="blue" p="xs">
            <Text size="xs">
              Próximas férias: <b>{fmtDate(upcoming.start_date)}</b> a <b>{fmtDate(upcoming.end_date)}</b> · REF {upcoming.reference_year}
            </Text>
          </Alert>
        ) : (
          <Text size="xs" c="dimmed">
            {personId ? 'Sem férias futuras no Plano de férias.' : 'Escolha o militar para buscar as férias.'}
          </Text>
        )}
        <Button variant="light" leftSection={<IconBeach size={16} />} disabled={!upcoming} onClick={() => applyVacation(personId)}>
          Usar mês do Plano de férias
        </Button>
      </SideCard>
      <SideCard title="Arquivo" icon={<IconCalendar size={16} />}>
        <DateInput size="xs" label="Data de registro" description="Usada só para organizar o arquivo." valueFormat="DD/MM/YYYY" value={f.issueDate || null} onChange={(d) => set({ issueDate: d ? dayjs(d).format('YYYY-MM-DD') : '' })} error={bad('date')} popoverProps={{ zIndex: 400 }} />
      </SideCard>
      <Alert variant="light" color="gray" p="xs">
        <Text size="xs">Clique no nome do militar na folha para trocar. Parcela, ano e mês das férias são escolhidos direto no texto.</Text>
      </Alert>
    </>
  );

  return (
    <DocEditorShell
      opened={opened}
      eyebrow="Requerimentos · Adiantamento de 13º salário"
      title={`${existing ? 'Editar' : 'Novo'} adiantamento de 13º${f.ebNumber ? ` · EB ${f.ebNumber}` : ''}`}
      dirty={dirty}
      saving={save.isPending}
      submitLabel={existing ? 'Salvar alterações' : 'Salvar requerimento'}
      onCancel={onClose}
      onSave={submit}
      sidebar={sidebar}
    >
      <div className="doc-sheet" style={{ display: 'flex', flexDirection: 'column', lineHeight: 1.17 }}>
        <div className="req-head" style={{ marginBottom: '8mm' }}>
          <img src="/assets/documents/fatd-emblem.png" alt="" style={{ marginBottom: '1mm' }} />
          <span>MINISTÉRIO DA DEFESA</span>
          <span>EXÉRCITO BRASILEIRO</span>
          <span>25º GRUPO DE ARTILHARIA DE CAMPANHA</span>
          <span>(C Art Cav/1831)</span>
          <span>GRUPO LEITE DE CASTRO</span>
        </div>
        <div style={{ margin: '0 0 7mm' }}>
          <b>Requerimento</b>
          <br />
          <b>EB:</b> <InlineInput value={f.ebNumber} onChange={(x) => set({ ebNumber: x })} inlineWidth={14} placeholder="número EB" invalid={bad('eb')} />
        </div>
        <p style={{ margin: '0 0 1mm' }}>
          <b>Do</b> {rank} {person}
        </p>
        <p style={{ margin: '0 0 1mm' }}>Ao Ordenador de Despesas do 25º Grupo de Artilharia de Campanha.</p>
        <p style={{ margin: '0 0 13mm' }}>
          <b>Objeto:</b> adiantamento da primeira parcela do décimo terceiro salário (13º)
        </p>
        <p className="req-p req-indent" style={{ margin: '0 0 4mm' }}>
          1. {person}, PREC/CP: {profile.prec_cp || '____'}, {reqExpandedRank(rank)}, servindo no 25º Grupo de Artilharia de Campanha, requer a V Sª o adiantamento da{' '}
          <InlineSelect value={f.installment} onChange={(x) => set({ installment: x })} data={[{ value: 'Primeira', label: 'primeira' }, { value: 'Segunda', label: 'segunda' }]} /> parcela do décimo terceiro salário (13º), por estar previsto para entrar em férias regulamentares relativas ao ano de{' '}
          <InlineSelect value={f.vacationYear} onChange={(x) => set({ vacationYear: x })} data={YEARS} /> no mês de <InlineSelect value={f.vacationMonth} onChange={(x) => set({ vacationMonth: x })} data={MONTHS} /> de{' '}
          <InlineSelect value={f.vacationMonthYear} onChange={(x) => set({ vacationMonthYear: x })} data={YEARS} />.
        </p>
        <p className="req-p req-indent" style={{ margin: '0 0 4mm' }}>
          2. Tal solicitação encontra amparo no inciso II do Art 2º da MP Nº 2.215-10, de 31 AGO 01 (LRM), e com o parágrafo único do Art 82 do Decreto nº 4.307, de 18 de julho de 2002.
        </p>
        <p className="req-p req-indent" style={{ margin: '0 0 4mm' }}>
          3. É a primeira vez que requer.
        </p>
        <p className="req-p req-indent" style={{ margin: '0 0 4mm' }}>
          Nesses termos, pede deferimento.
        </p>
        <div className="doc-center" style={{ margin: '13mm 0 10mm', fontWeight: 'bold' }} dangerouslySetInnerHTML={{ __html: profile.full_name ? `${reqRichName(profile.full_name, profile.war_name, true)} - ${rank}` : '<span class="doc-ghost">assinatura do militar</span>' }} />
        <section>
          <h2 style={{ fontSize: '11pt', margin: '0 0 5mm' }}>DESPACHO:</h2>
          <p className="req-p" style={{ margin: '1.5mm 0' }}>1. Deferido.</p>
          <p className="req-p" style={{ margin: '1.5mm 0' }}>
            2. Concedo, de acordo com Art 7º e parágrafos 1º e 2º do Art 9º do Dec Lei Nr 2.310, de 22 DEZ 86, combinados com o inciso II do Art 2º da MP Nr 2.215-10, de 31 AGO 01 (LRM), e com o parágrafo único do Art 82 do Decreto Nr 4.307, de 18 de julho de 2002.
          </p>
          <p className="req-p" style={{ margin: '1.5mm 0' }}>3. O S1/25º GAC tome as providências decorrentes.</p>
          <p className="req-p" style={{ margin: '1.5mm 0' }}>4. Publique-se arquive-se.</p>
          <p className="doc-center" style={{ margin: '6mm 0 0' }}>Bagé-RS, ____ de ______________ de ______.</p>
        </section>
        <div className="doc-center" style={{ marginTop: 'auto', paddingTop: '15mm', marginBottom: '4mm' }}>
          <div style={{ width: '75%', margin: '0 auto' }}>
            <InlineInput value={f.commanderName} onChange={(x) => set({ commanderName: x })} placeholder="NOME DO COMANDANTE - Posto" invalid={bad('commander')} />
          </div>
          {f.commanderName && <div className="doc-ghost" dangerouslySetInnerHTML={{ __html: `na impressão: ${commanderHtml(f.commanderName)}` }} />}
          <div>{f.commanderResponding ? 'Respondendo pelo ' : ''}Comandante do 25º Grupo de Artilharia de Campanha</div>
          <Group justify="center" mt={4}>
            <Switch size="xs" label={<span className="doc-ghost">respondendo</span>} checked={f.commanderResponding} onChange={(e) => set({ commanderResponding: e.currentTarget.checked })} />
          </Group>
        </div>
      </div>
      <Text ta="center" size="xs" c="dimmed">
        {capitalize(MONTHS[Number(f.vacationMonth) - 1]?.label ?? '')} de {f.vacationMonthYear} · parcela {f.installment.toLowerCase()}
      </Text>
    </DocEditorShell>
  );
}
