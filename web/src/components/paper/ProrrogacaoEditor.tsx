import { Alert, Button, Group, Select, SimpleGrid, Switch, Text } from '@mantine/core';
import { IconCalculator, IconCopy, IconSignature, IconUser } from '@tabler/icons-react';
import dayjs from 'dayjs';
import { type ReactNode, useEffect, useMemo, useState } from 'react';
import { type DocumentRecord, nextNumber, useSaveDocument } from '../../data/documents';
import { useUnitPersonnel } from '../../data/unit';
import { notifyError, notifyOk } from '../../lib/confirm';
import { longDate, reqElapsed, reqExpandedRank, reqExtensionRows, reqRank, reqRichName } from '../../print/legacy';
import { DocEditorShell, SideCard } from './DocEditorShell';
import { InlineDate, InlineInput, InlinePerson, InlineSelect } from './Inline';
import { useDirty } from './useDirty';

interface Props {
  opened: boolean;
  onClose: () => void;
  existing: DocumentRecord | null;
  saved: DocumentRecord[];
}

type Profile = Record<string, string>;
const BRANCHES = ['da arma de artilharia', 'da arma de comunicações', 'do quadro de material bélico', 'do serviço de intendência', 'do serviço de saúde'];
const BEHAVIORS = ['Mal', 'Bom', 'Ótimo', 'Excepcional'];
const TAF = ['E', 'MB', 'B', 'R', 'S', 'I', 'Não Realizado'];
const pracaFormat = (iso: string) => `${dayjs(iso).format('DD')} ${new Intl.DateTimeFormat('pt-BR', { month: 'short' }).format(dayjs(iso).toDate()).replace('.', '').toLocaleUpperCase('pt-BR')} ${dayjs(iso).year()}`;
const profileOf = (p: Profile | undefined): Profile =>
  p ? { rank: p.rank, war_name: p.war_name, full_name: p.full_name, military_id: p.military_id || '', birth_date: p.birth_date || '', birth_city: p.birth_city || '', military_number: p.military_number || '' } : {};

export function ProrrogacaoEditor({ opened, onClose, existing, saved }: Props) {
  const { data: roster = [] } = useUnitPersonnel();
  const save = useSaveDocument();
  const [personId, setPersonId] = useState('');
  const [profile, setProfile] = useState<Profile>({});
  const [signerId, setSignerId] = useState('');
  const [signer, setSigner] = useState<Profile>({});
  const [f, setF] = useState({ issueDate: '', city: 'Bagé', ebNumber: '', infoNumber: '', branch: BRANCHES[0], pracaDate: '', behavior: 'Bom', taf: 'Não Realizado', punishments: '', publicYears: '0', publicMonths: '0', publicDays: '0', unitSituation: '', signerResponding: false });
  const [submitted, setSubmitted] = useState(false);
  const set = (patch: Partial<typeof f>) => setF((c) => ({ ...c, ...patch }));
  const others = useMemo(() => [...saved].filter((d) => d.id !== existing?.id).sort((a, b) => b.document_date.localeCompare(a.document_date)), [saved, existing]);

  useEffect(() => {
    if (!opened) return;
    setSubmitted(false);
    const d = existing?.data || {};
    const last = others[0]?.data || {};
    setPersonId(d.personId ? String(d.personId) : '');
    setProfile(d.profile || {});
    setSignerId(String(d.signerId || (existing ? '' : last.signerId || '')));
    setSigner(d.signer || (existing ? {} : last.signer || {}));
    setF({
      issueDate: d.issueDate || existing?.document_date || dayjs().format('YYYY-MM-DD'),
      city: d.city || 'Bagé',
      ebNumber: d.ebNumber || '',
      infoNumber: existing?.bulletin_number || d.infoNumber || String(nextNumber(saved)).padStart(3, '0'),
      branch: d.branch || BRANCHES[0],
      pracaDate: d.pracaDate || (d.pracaYear ? `${d.pracaYear}-03-01` : ''),
      behavior: d.behavior || 'Bom',
      taf: d.taf || 'Não Realizado',
      punishments: d.punishments || '',
      publicYears: String(d.publicYears ?? 0),
      publicMonths: String(d.publicMonths ?? 0),
      publicDays: String(d.publicDays ?? 0),
      unitSituation: d.unitSituation || '',
      signerResponding: existing ? !!d.signerResponding : !!last.signerResponding,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [opened, existing]);

  const dirty = useDirty(opened, !!f.infoNumber, { personId, signerId, f });
  const options = roster.map((p) => ({ value: String(p.id), label: `${reqRank(p)} · ${p.war_name} · ${p.full_name}` }));
  const pickPerson = (id: string | null) => {
    const p = roster.find((r) => String(r.id) === id);
    if (!p) return;
    setPersonId(String(p.id));
    setProfile(profileOf(p as unknown as Profile));
  };
  const pickSigner = (id: string | null) => {
    const p = roster.find((r) => String(r.id) === id);
    if (!p) return;
    setSignerId(String(p.id));
    setSigner({ rank: p.rank, war_name: p.war_name, full_name: p.full_name, military_number: p.military_number || '' });
  };

  /** Repete os dados funcionais do último requerimento do mesmo militar. */
  const copyFromLast = () => {
    const last = others.find((d) => String(d.data?.personId) === personId);
    if (!last) return notifyError(new Error('Não há requerimento anterior deste militar.'), 'Nada para copiar');
    const d = last.data;
    set({ branch: d.branch || f.branch, pracaDate: d.pracaDate || f.pracaDate, behavior: d.behavior || f.behavior, taf: d.taf || f.taf, punishments: d.punishments || '', publicYears: String(d.publicYears ?? 0), publicMonths: String(d.publicMonths ?? 0), publicDays: String(d.publicDays ?? 0), unitSituation: d.unitSituation || '' });
    notifyOk(`Dados copiados da Info nº ${last.bulletin_number}. Confira comportamento, TAF e punições.`);
  };

  const rank = reqRank(profile);
  const name = profile.full_name ? reqRichName(profile.full_name, profile.war_name) : '';
  const issueYear = f.issueDate ? dayjs(f.issueDate).year() : dayjs().year();
  const termYear = issueYear + 1;
  const elapsed = reqElapsed(f.pracaDate, f.issueDate);
  const extensions = f.pracaDate ? reqExtensionRows(f.pracaDate, termYear) : '';
  const dateText = f.issueDate ? longDate(f.issueDate, false) : '________________';
  const pracaYear = f.pracaDate ? dayjs(f.pracaDate).year() : 0;
  const errors = {
    person: !personId || !profile.full_name,
    issueDate: !f.issueDate,
    eb: !f.ebNumber.trim(),
    info: !f.infoNumber.trim(),
    praca: !(f.pracaDate && pracaYear >= 1950 && pracaYear <= issueYear),
    signer: !signerId || !signer.full_name,
  };
  const bad = (k: keyof typeof errors) => submitted && errors[k];

  const submit = () => {
    setSubmitted(true);
    if (Object.values(errors).some(Boolean)) return notifyError(new Error('Preencha os campos destacados em vermelho (a data de praça deve ser anterior à do documento).'), 'Campos obrigatórios');
    const pub = [f.publicYears, f.publicMonths, f.publicDays].map((x) => Number(x || 0));
    if (pub.some((x) => !Number.isInteger(x) || x < 0)) return notifyError(new Error('O tempo de serviço público deve ter números inteiros não negativos.'), 'Valor inválido');
    // Como na versão clássica, grava o retrato atual da ficha do efetivo (ou o já salvo, se a ficha não existir mais).
    const person = roster.find((r) => String(r.id) === personId);
    const snapshot = person ? profileOf(person as unknown as Profile) : profile;
    const content = {
      personId: Number(personId), profile: snapshot, issueDate: f.issueDate, city: f.city.trim() || 'Bagé', ebNumber: f.ebNumber.trim(), infoNumber: f.infoNumber.trim(), branch: f.branch,
      pracaDate: f.pracaDate, pracaYear, behavior: f.behavior, taf: f.taf, punishments: f.punishments.trim(), publicYears: pub[0], publicMonths: pub[1], publicDays: pub[2],
      unitSituation: f.unitSituation.trim(), signerId: Number(signerId), signerResponding: f.signerResponding, signer,
    };
    save.mutate(
      { id: existing?.id, kind: 'prorrogacao', bulletin_number: f.infoNumber.trim(), document_date: f.issueDate, data: content },
      {
        onSuccess: () => {
          notifyOk(existing ? 'Requerimento atualizado.' : 'Requerimento salvo no arquivo.');
          onClose();
        },
        onError: (e) => notifyError(e),
      },
    );
  };

  const head = (small = false): ReactNode => (
    <div className="req-head" style={small ? { fontSize: '8.8pt' } : undefined}>
      <img src="/assets/documents/fatd-emblem.png" alt="" style={small ? { width: '18mm', height: '17mm', marginBottom: '2mm' } : undefined} />
      <span>MINISTÉRIO DA DEFESA</span>
      <span>EXÉRCITO BRASILEIRO</span>
      <span>CMS - 6ª DE - 3ª Bda C Mec</span>
      <span>25º GRUPO DE ARTILHARIA DE CAMPANHA</span>
      <span>(C Art Cav / 1831)</span>
      <span>GRUPO LEITE DE CASTRO</span>
    </div>
  );
  const person = <InlinePerson html={name} options={options} onPick={pickPerson} invalid={bad('person')} />;
  const cityDate = (
    <>
      <InlineInput value={f.city} onChange={(x) => set({ city: x })} inlineWidth={6} />, <InlineDate value={f.issueDate || null} onChange={(x) => set({ issueDate: x })} weekday={false} invalid={bad('issueDate')} />.
    </>
  );
  const small = { width: '3ch', textAlign: 'center' as const };

  const sidebar = (
    <>
      <SideCard title="Militar" icon={<IconUser size={16} />}>
        <Select size="xs" searchable placeholder="Buscar no efetivo" data={options} value={personId || null} onChange={pickPerson} comboboxProps={{ zIndex: 400 }} />
        <Button variant="light" size="xs" leftSection={<IconCopy size={14} />} disabled={!personId} onClick={copyFromLast}>
          Copiar dados do último requerimento dele
        </Button>
      </SideCard>
      <SideCard title="Assinante (Cmt da 3ª Bia)" icon={<IconSignature size={16} />}>
        <Select size="xs" searchable placeholder="Buscar no efetivo" data={options} value={signerId || null} onChange={pickSigner} comboboxProps={{ zIndex: 400 }} />
        <Switch size="sm" label="Respondendo pelo comandante" checked={f.signerResponding} onChange={(e) => set({ signerResponding: e.currentTarget.checked })} />
      </SideCard>
      <SideCard title="Cálculos automáticos" icon={<IconCalculator size={16} />}>
        <SimpleGrid cols={3} spacing={4}>
          {[
            ['anos', elapsed.years],
            ['meses', elapsed.months],
            ['dias', elapsed.days],
          ].map(([l, n]) => (
            <div key={l} style={{ textAlign: 'center' }}>
              <Text fw={800} size="lg" ff="heading">
                {n}
              </Text>
              <Text size="xs" c="dimmed">
                {l}
              </Text>
            </div>
          ))}
        </SimpleGrid>
        <Text size="xs" c="dimmed">
          Tempo de efetivo serviço entre a data de praça e a do documento. A prorrogação conta a partir de 1º de março de {termYear}.
        </Text>
      </SideCard>
      <Alert variant="light" color="gray" p="xs">
        <Text size="xs">Clique no nome do militar ou do assinante na folha para trocar. Os dados pessoais vêm da ficha do efetivo.</Text>
      </Alert>
    </>
  );

  return (
    <DocEditorShell
      opened={opened}
      eyebrow="Requerimentos · Prorrogação de tempo de serviço"
      title={`${existing ? 'Editar' : 'Novo'} requerimento${f.infoNumber ? ` · Info nº ${f.infoNumber}` : ''}`}
      dirty={dirty}
      saving={save.isPending}
      submitLabel={existing ? 'Salvar alterações' : 'Salvar requerimento'}
      onCancel={onClose}
      onSave={submit}
      sidebar={sidebar}
    >
      {/* Página 1 — requerimento do militar */}
      <div className="doc-sheet" style={{ display: 'flex', flexDirection: 'column' }}>
        {head()}
        <p style={{ textAlign: 'right', margin: '15mm 0 8mm' }}>{cityDate}</p>
        <div style={{ marginBottom: '9mm' }}>
          <b>Requerimento</b>
          <br />
          <b>EB:</b> <InlineInput value={f.ebNumber} onChange={(x) => set({ ebNumber: x })} inlineWidth={14} placeholder="número EB" invalid={bad('eb')} />
        </div>
        <div>
          <b>Do</b> {rank} {person}
        </div>
        <p style={{ margin: '0 0 2mm' }}>Ao Sr Comandante do 25º Grupo de Artilharia de Campanha</p>
        <p style={{ margin: '4mm 0 2mm' }}>
          <b>Objeto:</b> Prorrogação de tempo de serviço militar
        </p>
        <p className="req-p" style={{ marginTop: '13mm', marginLeft: '26mm' }}>
          1. {rank} {person} ({profile.military_id || '____'}), {reqExpandedRank(rank).toLocaleLowerCase('pt-BR')} <InlineSelect value={f.branch} onChange={(x) => set({ branch: x })} data={BRANCHES} /> servindo na 3ª Bateria de Obuses, requer prorrogação de tempo de serviço militar por 12 (doze) meses, a contar de 1º de Março de {termYear}.
        </p>
        <p className="req-p">2. Tal solicitação encontra amparo nas normas técnicas para prestação do serviço militar temporário aprovada pela Portaria-DGP/C Ex Nº 407, de 25 julho de 2022.</p>
        <p className="req-p">3. É a primeira vez que requer.</p>
        <p className="req-p">Nestes termos, pede deferimento.</p>
        <div style={{ textAlign: 'center', marginTop: 'auto', marginBottom: '7mm', fontWeight: 'bold' }} dangerouslySetInnerHTML={{ __html: profile.full_name ? `${reqRichName(profile.full_name, profile.war_name, true)} - ${rank}` : '<span class="doc-ghost">assinatura do militar</span>' }} />
        <p className="doc-center" style={{ margin: '0 0 7mm' }}>
          {f.city}, {dateText}.
        </p>
      </div>

      {/* Página 2 — informação do comandante */}
      <div className="doc-sheet" style={{ fontSize: '8.7pt', lineHeight: 1.13 }}>
        {head(true)}
        <p style={{ textAlign: 'right', margin: '0 0 4mm' }}>
          {f.city}, {dateText}.
        </p>
        <p style={{ fontWeight: 'bold', margin: '0 0 4mm' }}>
          Info nº <InlineInput value={f.infoNumber} onChange={(x) => set({ infoNumber: x })} inlineWidth={5} invalid={bad('info')} />
        </p>
        <p style={{ margin: '0 0 2mm' }}>
          Do Comandante da 3ª Bateria de Obuses
          <br />
          Ao Comandante do 25º Grupo de Artilharia de Campanha
        </p>
        <p style={{ margin: '2mm 0' }}>
          <b>Objeto:</b> Prorrogação de tempo de serviço militar
        </p>
        <p className="req-p" style={{ margin: '1.3mm 0' }}>
          1. Requerimento em que o {rank} {person}, da 3ª Bia O, pleiteia prorrogação de tempo de serviço militar por 12 (doze) meses, a contar de 1º de março de {termYear}.
        </p>
        <h3 style={{ fontSize: '10pt', margin: '2mm 0 1mm' }}>2. INFORMAÇÃO</h3>
        <p style={{ margin: '1mm 0' }}>
          <u>a. Amparo do requerente</u>
        </p>
        <p className="req-p" style={{ margin: '1.3mm 0' }}>
          2. Tal solicitação encontra amparo nas normas técnicas para prestação do serviço militar temporário aprovada pela Portaria-DGP/C Ex Nº 407, de 25 julho de 2022.
        </p>
        <p style={{ margin: '1mm 0' }}>
          <u>b. Estudo fundamentado</u>
        </p>
        <p style={{ margin: '1.3mm 0' }}>1) Dados informativos sobre o requerente:</p>
        <div className="req-list">
          <div>- Nome: {person};</div>
          <div>- Identidade: {profile.military_id || 'Não informado'};</div>
          <div>
            - Data e Local de nascimento: {profile.birth_date ? longDate(profile.birth_date, false) : 'Não informado'} - {profile.birth_city || 'Não informado'};
          </div>
          <div>
            - Data de Praça: <InlineDate value={f.pracaDate || null} onChange={(x) => set({ pracaDate: x })} format={pracaFormat} invalid={bad('praca')} placeholder="escolher" />;
          </div>
          <div>
            - Comportamento: “<InlineSelect value={f.behavior} onChange={(x) => set({ behavior: x })} data={BEHAVIORS} />”;
          </div>
          <div>
            - Conceito no último TAF: “<InlineSelect value={f.taf} onChange={(x) => set({ taf: x })} data={TAF} />”;
          </div>
          <div>
            - Tempo de efetivo serviço: {elapsed.years} anos {elapsed.months} meses {elapsed.days} dias;
          </div>
          <div style={{ display: 'flex', gap: 4 }}>
            <span style={{ whiteSpace: 'nowrap' }}>- Punições: “</span>
            <InlineInput value={f.punishments} onChange={(x) => set({ punishments: x })} placeholder="Não informado" />
            <span>”;</span>
          </div>
          <div>
            - Tempo de serviço público anterior: <InlineInput value={f.publicYears} onChange={(x) => set({ publicYears: x.replace(/\D/g, '') })} style={small} /> anos{' '}
            <InlineInput value={f.publicMonths} onChange={(x) => set({ publicMonths: x.replace(/\D/g, '') })} style={small} /> meses{' '}
            <InlineInput value={f.publicDays} onChange={(x) => set({ publicDays: x.replace(/\D/g, '') })} style={small} /> dias;
          </div>
          <div>- Prorrogações Anteriores:</div>
        </div>
        {extensions ? (
          <table className="req-ext">
            <tbody dangerouslySetInnerHTML={{ __html: extensions }} />
          </table>
        ) : (
          <p className="doc-ghost doc-center">Escolha a data de praça para montar a tabela.</p>
        )}
        <div style={{ display: 'flex', gap: 4, marginTop: '2mm' }}>
          <span style={{ whiteSpace: 'nowrap' }}>- Situação na OM:</span>
          <InlineInput value={f.unitSituation} onChange={(x) => set({ unitSituation: x })} placeholder="ex.: Pronto" />
        </div>
      </div>

      {/* Página 3 — apreciação e despacho */}
      <div className="doc-sheet" style={{ display: 'flex', flexDirection: 'column' }}>
        <p className="doc-center" style={{ margin: '0 0 6mm' }}>
          (Continuação da Informação Nr {f.infoNumber} da 3ª Bateria de Obuses, de {dateText}..... Fl 02)
        </p>
        <p style={{ margin: '0 0 1mm 25mm' }}>2) Apreciação</p>
        <p style={{ textAlign: 'justify', textIndent: '20mm', margin: '0 0 7mm' }}>O requerente pleiteia prorrogação do tempo de serviço militar, havendo coerência entre o que solicita e o (s) dispositivo(s) citado(s) como amparo:</p>
        <h3 style={{ fontSize: '10pt', margin: '0 0 6mm 25mm' }}>3. DESPACHO</h3>
        <div className="req-lines" style={{ marginBottom: '6mm' }}>
          {[0, 1, 2, 3].map((i) => (
            <div key={i} />
          ))}
        </div>
        <p className="req-p">4. O presente requerimento permaneceu ____________ dia (s) nesta Bateria, para fins de informações e encaminhamento.</p>
        <div className="doc-center" style={{ margin: '12mm 0 7mm' }}>
          <InlinePerson html={signer.full_name ? `${reqRichName(signer.full_name, signer.war_name)} - ${reqRank(signer)}` : ''} options={options} onPick={pickSigner} invalid={bad('signer')} placeholder="clique para escolher o assinante" />
          <div>{f.signerResponding ? 'Respondendo pelo ' : ''}Comandante da 3ª Bateria de Obuses</div>
          <Group justify="center" mt={4}>
            <Switch size="xs" label={<span className="doc-ghost">respondendo</span>} checked={f.signerResponding} onChange={(e) => set({ signerResponding: e.currentTarget.checked })} />
          </Group>
        </div>
        <section className="req-box" style={{ minHeight: '101mm', display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
          <div>
            <b>DESPACHO:</b>
            <p>1. ( ) DEFERIDO</p>
            <p>2. ( ) INDEFERIDO</p>
            <p>3. PUBLIQUE-SE E ARQUIVE-SE</p>
            <p className="doc-center">25º GAC</p>
            <p className="doc-center">______/_______/______</p>
          </div>
          <div className="doc-center" style={{ fontSize: '9pt' }}>
            <b>LEANDRO</b> ANDRE PEDROSO DA SILVA - <b>Ten Cel</b>
            <br />
            Comandante do 25º Grupo de Artilharia de Campanha
          </div>
        </section>
      </div>
    </DocEditorShell>
  );
}
