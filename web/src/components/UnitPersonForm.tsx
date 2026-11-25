import { Button, Divider, Group, Modal, ScrollArea, Select, SimpleGrid, Stack, Text, TextInput, Textarea } from '@mantine/core';
import { DateInput } from '@mantine/dates';
import { useForm } from '@mantine/form';
import dayjs from 'dayjs';
import { useEffect, useMemo } from 'react';
import { BLOOD_TYPES, CNH_OPTIONS, EDUCATION, QM_OPTIONS, RELIGIONS, SECTIONS, UNIT_RANKS, type UnitPerson, useSaveUnitPerson, useUnitPersonnel } from '../data/unit';
import { notifyError, notifyOk } from '../lib/confirm';

interface Props {
  opened: boolean;
  onClose: () => void;
  person: UnitPerson | null;
}

const EMPTY = {
  full_name: '', war_name: '', rank: '', military_number: '', seniority_order: '', military_id: '', civil_id: '', cpf: '',
  birth_date: null as string | null, prec_cp: '', qm: '', blood_type: '', email: '', religion: '', address: '', phone: '',
  birth_city: '', mother_name: '', father_name: '', cnh: '', education: '', section: '', section_other: '', additional_data: '',
};

function Section({ title, description, children }: { title: string; description: string; children: React.ReactNode }) {
  return (
    <Stack gap="sm">
      <div>
        <Text fw={800} ff="heading">
          {title}
        </Text>
        <Text size="xs" c="dimmed">
          {description}
        </Text>
      </div>
      {children}
    </Stack>
  );
}

export function UnitPersonForm({ opened, onClose, person }: Props) {
  const editing = !!person;
  const { data: roster = [] } = useUnitPersonnel();
  const save = useSaveUnitPerson();
  const form = useForm({
    initialValues: EMPTY,
    validate: {
      full_name: (v) => (v.trim() ? null : 'Obrigatório'),
      war_name: (v) => (v.trim() ? null : 'Obrigatório'),
      rank: (v) => (v ? null : 'Obrigatório'),
      seniority_order: (v) => (v ? null : 'Obrigatório'),
      military_number: (v, values) => (values.rank === 'Sd EV' && !v.trim() ? 'Obrigatório para Sd EV' : null),
      email: (v) => (!v || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v) ? null : 'E-mail inválido'),
    },
  });

  useEffect(() => {
    if (!opened) return;
    if (person) {
      const custom = person.section && !SECTIONS.includes(person.section);
      form.setValues({
        ...EMPTY,
        ...Object.fromEntries(Object.entries(person).map(([k, v]) => [k, v == null ? '' : String(v)])),
        birth_date: person.birth_date || null,
        seniority_order: person.seniority_order ? String(person.seniority_order) : '',
        section: custom ? '__outro__' : person.section,
        section_other: custom ? person.section : '',
      });
    } else form.setValues(EMPTY);
    form.resetDirty();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [opened, person]);

  // Opções de antiguidade: 1º até (colegas da graduação + 1).
  const rank = form.values.rank;
  const seniorityOptions = useMemo(() => {
    const peers = roster.filter((p) => p.rank === rank && p.id !== person?.id).length;
    return Array.from({ length: peers + 1 }, (_, i) => ({ value: String(i + 1), label: `${i + 1}º na graduação` }));
  }, [roster, rank, person]);

  useEffect(() => {
    if (!rank) return;
    const current = rank === person?.rank && person?.seniority_order ? String(person.seniority_order) : String(seniorityOptions.length);
    form.setFieldValue('seniority_order', current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rank, seniorityOptions.length]);

  const age = form.values.birth_date ? dayjs().diff(dayjs(form.values.birth_date), 'year') : null;
  const opt = (values: string[]) => values.map((v) => ({ value: v, label: v }));

  const submit = form.onSubmit(
    (v) => {
      const { section_other, ...rest } = v;
      const body = {
        ...Object.fromEntries(Object.entries(rest).map(([k, val]) => [k, typeof val === 'string' ? val.trim() : val])),
        birth_date: v.birth_date ? dayjs(v.birth_date).format('YYYY-MM-DD') : '',
        section: v.section === '__outro__' ? section_other.trim() : v.section,
        seniority_order: Number(v.seniority_order),
      };
      save.mutate(
        { id: person?.id, ...body },
        {
          onSuccess: () => {
            notifyOk(editing ? 'Ficha atualizada.' : 'Pessoa adicionada ao efetivo.');
            onClose();
          },
          onError: (e) => notifyError(e),
        },
      );
    },
    () => notifyError(new Error('Preencha nome completo, nome de guerra, posto/graduação e antiguidade.'), 'Campos obrigatórios'),
  );

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
          <Text size="xs" fw={700} c="sigase" tt="uppercase" style={{ letterSpacing: 1.2 }}>
            Cadastro do efetivo
          </Text>
          <Text fw={800} size="lg">
            {editing ? 'Editar ficha' : 'Adicionar pessoa'}
          </Text>
        </div>
      }
    >
      <form onSubmit={submit}>
        <Stack gap="lg">
          <Section title="Identificação" description="Dados principais e posição de antiguidade.">
            <SimpleGrid cols={{ base: 1, sm: 2 }}>
              <TextInput label="Nome completo" withAsterisk maxLength={120} {...form.getInputProps('full_name')} />
              <TextInput label="Nome de guerra" withAsterisk maxLength={80} {...form.getInputProps('war_name')} />
              <Select label="Posto/graduação" withAsterisk placeholder="Selecione" data={UNIT_RANKS.map(([value, label]) => ({ value, label }))} {...form.getInputProps('rank')} />
              <TextInput label="Número militar" withAsterisk={rank === 'Sd EV'} maxLength={20} placeholder="Obrigatório para Sd EV" {...form.getInputProps('military_number')} />
              <Select
                label="Antiguidade nesta graduação"
                withAsterisk
                description="1º indica o mais antigo da graduação."
                disabled={!rank}
                placeholder={rank ? undefined : 'Escolha o posto primeiro'}
                data={seniorityOptions}
                {...form.getInputProps('seniority_order')}
              />
              <TextInput label="IDT militar" maxLength={40} {...form.getInputProps('military_id')} />
              <TextInput label="IDT civil" maxLength={40} {...form.getInputProps('civil_id')} />
              <TextInput label="CPF" maxLength={20} placeholder="000.000.000-00" {...form.getInputProps('cpf')} />
              <DateInput label="Data de nascimento" valueFormat="DD/MM/YYYY" maxDate={dayjs().format('YYYY-MM-DD')} clearable {...form.getInputProps('birth_date')} />
              <TextInput label="Idade calculada" value={age == null ? 'Preenchida pela data de nascimento' : `${age} anos`} disabled />
              <TextInput label="Prec-CP" maxLength={40} {...form.getInputProps('prec_cp')} />
              <Select label="QM" placeholder="Selecione a QM" clearable searchable data={QM_OPTIONS.map(([value, guide]) => ({ value, label: `${value} (${guide})` }))} {...form.getInputProps('qm')} />
              <Select label="Tipo sanguíneo" placeholder="Selecione" clearable data={BLOOD_TYPES} {...form.getInputProps('blood_type')} />
              <TextInput label="E-mail" type="email" maxLength={160} placeholder="nome@exemplo.com" {...form.getInputProps('email')} />
              <Select label="Religião" placeholder="Selecione" clearable data={opt(RELIGIONS)} {...form.getInputProps('religion')} />
            </SimpleGrid>
          </Section>
          <Divider />
          <Section title="Contato e origem" description="Informações de contato e filiação.">
            <TextInput label="Endereço" maxLength={240} placeholder="Rua, número, bairro e complemento" {...form.getInputProps('address')} />
            <SimpleGrid cols={{ base: 1, sm: 2 }}>
              <TextInput label="Telefone" maxLength={240} placeholder="(00) 00000-0000" {...form.getInputProps('phone')} />
              <TextInput label="Cidade natal" maxLength={240} {...form.getInputProps('birth_city')} />
              <TextInput label="Filiação · mãe" maxLength={240} {...form.getInputProps('mother_name')} />
              <TextInput label="Filiação · pai" maxLength={240} {...form.getInputProps('father_name')} />
            </SimpleGrid>
          </Section>
          <Divider />
          <Section title="Formação e vínculo" description="Dados complementares da ficha.">
            <SimpleGrid cols={{ base: 1, sm: 2 }}>
              <Select label="CNH" placeholder="Selecione" clearable data={opt(CNH_OPTIONS)} {...form.getInputProps('cnh')} />
              <Select label="Escolaridade" placeholder="Selecione" clearable data={opt(EDUCATION)} {...form.getInputProps('education')} />
              <Select label="Seção em que trabalha" placeholder="Selecione uma seção" clearable searchable data={[...opt(SECTIONS), { value: '__outro__', label: 'Outro' }]} {...form.getInputProps('section')} />
              {form.values.section === '__outro__' && <TextInput label="Outra seção" maxLength={100} placeholder="Informe a seção" {...form.getInputProps('section_other')} />}
            </SimpleGrid>
            <Textarea label="Observações" maxLength={1000} autosize minRows={2} {...form.getInputProps('additional_data')} />
          </Section>
          <Text size="xs" c="dimmed">
            Os campos podem ser completados ou atualizados posteriormente.
          </Text>
          <Group justify="flex-end">
            <Button variant="default" onClick={onClose}>
              Cancelar
            </Button>
            <Button type="submit" loading={save.isPending}>
              {editing ? 'Salvar alterações' : 'Salvar ficha'}
            </Button>
          </Group>
        </Stack>
      </form>
    </Modal>
  );
}
