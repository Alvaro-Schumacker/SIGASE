import { Accordion, ActionIcon, Badge, Button, Card, Group, Menu, SegmentedControl, Skeleton, Stack, Text, ThemeIcon } from '@mantine/core';
import { modals } from '@mantine/modals';
import { IconDots, IconEdit, IconEye, IconFileText, IconFolder, IconPencil, IconPlus, IconPrinter, IconTrash } from '@tabler/icons-react';
import { useQueryClient } from '@tanstack/react-query';
import dayjs from 'dayjs';
import { useMemo, useState } from 'react';
import { useCurrentUser } from '../../api';
import { type DocKind, type DocumentRecord, KIND_INFO, REQUIREMENT_CATEGORIES, documentPaper, documentRef, isRequirement, requirementCategory, useDocuments } from '../../data/documents';
import { confirmDelete, notifyError } from '../../lib/confirm';
import { type DocEditor, EditSessionContext, joinNames, useEditingNow } from './editSession';
import { capitalize, fmtDate } from '../../lib/format';
import { printPaper } from '../../lib/print';
import { longDate, splitWarName } from '../../print/legacy';
import { EmptyState } from '../EmptyState';
import { PageHeader } from '../PageHeader';
import { DocumentViewer } from './DocumentViewer';
import { AditamentoEditor } from '../paper/AditamentoEditor';
import { AdiantamentoEditor } from '../paper/AdiantamentoEditor';
import { FatdEditor } from '../paper/FatdEditor';
import { ProrrogacaoEditor } from '../paper/ProrrogacaoEditor';
import { PernoiteEditor } from '../paper/PernoiteEditor';

interface Props {
  kinds: DocKind[];
  title: string;
  eyebrow: string;
  subtitle: string;
  canEdit: boolean;
}

const KIND_COLOR: Record<DocKind, string> = { aditamento: 'sigase', pernoite: 'blue', fatd: 'red', prorrogacao: 'grape', adiantamento13: 'brass' };

export function DocumentArchive({ kinds, title, eyebrow, subtitle, canEdit }: Props) {
  const qc = useQueryClient();
  const [kind, setKind] = useState<DocKind>(kinds[0]);
  const { data: docs = [], isLoading, error, refetch } = useDocuments(kind);
  const me = useCurrentUser();
  const { data: editingNow = {} } = useEditingNow(canEdit);
  /** Outras pessoas com o documento aberto no editor agora. */
  const othersEditing = (d: DocumentRecord): DocEditor[] => (editingNow[String(d.id)] ?? []).filter((e) => e.user_id !== me.id);
  const [viewing, setViewing] = useState<DocumentRecord | null>(null);
  const [editing, setEditing] = useState<DocumentRecord | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const info = KIND_INFO[kind];
  const requirement = isRequirement(kind);

  const startEditing = (d: DocumentRecord | null) => {
    setViewing(null);
    setEditing(d);
    setFormOpen(true);
  };
  const openForm = (d: DocumentRecord | null) => {
    const others = d ? othersEditing(d) : [];
    if (!d || !others.length) return startEditing(d);
    modals.openConfirmModal({
      title: 'Documento em edição',
      children: (
        <Text size="sm">
          <b>{joinNames(others.map((e) => e.name))}</b> {others.length > 1 ? 'estão' : 'está'} editando este documento agora. Se os dois salvarem, quem salvar depois será avisado e poderá escolher o que fazer, mas o ideal é combinar antes.
        </Text>
      ),
      labels: { confirm: 'Editar mesmo assim', cancel: 'Cancelar' },
      onConfirm: () => startEditing(d),
    });
  };
  // Troca o conteúdo do editor pela versão salva mais recente (remonta o editor pela chave).
  const session = useMemo(
    () => ({
      doc: editing,
      reload: async (doc?: DocumentRecord) => {
        if (doc) return setEditing(doc);
        if (!editing) return;
        const fresh = (await refetch()).data?.find((x) => x.id === editing.id);
        if (fresh) setEditing(fresh);
        else notifyError(new Error('Este documento foi excluído por outra pessoa.'), 'Documento não encontrado');
      },
    }),
    [editing, refetch],
  );
  const editorKey = `${editing?.id ?? 'novo'}-${editing?.updated_at ?? ''}`;
  const closeForm = () => setFormOpen(false);
  const remove = (d: DocumentRecord) => confirmDelete({ label: 'documento', path: `/api/documents/${d.id}`, qc, invalidate: [['documents', d.kind]], onDone: () => setViewing(null) });
  const print = (d: DocumentRecord) => {
    try {
      printPaper(documentPaper(d));
    } catch (e) {
      notifyError(e, 'Não foi possível preparar a impressão');
    }
  };

  const card = (d: DocumentRecord) => (
    <Card key={d.id} padding="sm" radius="md" className="lift-card clickable-row" onClick={() => setViewing(d)}>
      <Group wrap="nowrap" gap="sm">
        <ThemeIcon size={40} radius="md" variant="light" color={KIND_COLOR[d.kind]}>
          <Text fw={800} size="sm">
            {KIND_INFO[d.kind].symbol}
          </Text>
        </ThemeIcon>
        <div style={{ flex: 1, minWidth: 0 }}>
          <Text fw={700} size="sm" truncate>
            {capitalize(KIND_INFO[d.kind].label)} · {documentRef(d, longDate)}
          </Text>
          {othersEditing(d).length > 0 && (
            <Badge size="xs" variant="light" color="blue" tt="none" leftSection={<IconPencil size={11} />} mb={2}>
              {joinNames(othersEditing(d).map((e) => e.name))} editando agora
            </Badge>
          )}
          <Text size="xs" c="dimmed" truncate>
            {fmtDate(d.document_date)} · {splitWarName(d.data?.militaryName).full || d.data?.mainSigner || d.data?.unit || d.data?.profile?.full_name || 'Unidade'}
          </Text>
        </div>
        <Menu position="bottom-end" withinPortal>
          <Menu.Target>
            <ActionIcon variant="subtle" color="gray" aria-label="Ações" onClick={(e) => e.stopPropagation()}>
              <IconDots size={18} />
            </ActionIcon>
          </Menu.Target>
          <Menu.Dropdown onClick={(e) => e.stopPropagation()}>
            <Menu.Item leftSection={<IconEye size={16} />} onClick={() => setViewing(d)}>
              Visualizar
            </Menu.Item>
            <Menu.Item leftSection={<IconPrinter size={16} />} onClick={() => print(d)}>
              Imprimir / PDF
            </Menu.Item>
            {canEdit && (
              <>
                <Menu.Item leftSection={<IconEdit size={16} />} onClick={() => openForm(d)}>
                  Editar
                </Menu.Item>
                <Menu.Item color="red" leftSection={<IconTrash size={16} />} onClick={() => remove(d)}>
                  Excluir
                </Menu.Item>
              </>
            )}
          </Menu.Dropdown>
        </Menu>
      </Group>
    </Card>
  );

  const byDateDesc = (a: DocumentRecord, b: DocumentRecord) => (b.document_date || '').localeCompare(a.document_date || '');
  const folderControl = (label: string, count: number, noun: [string, string]) => (
    <Group gap="sm">
      <ThemeIcon variant="light" color="gray" radius="md">
        <IconFolder size={18} />
      </ThemeIcon>
      <Text fw={700} tt="capitalize">
        {label}
      </Text>
      <Badge variant="light" color="gray" size="sm">
        {count} {count === 1 ? noun[0] : noun[1]}
      </Badge>
    </Group>
  );

  // Agrupamento: FATD em lista; requerimentos por ano → graduação; demais por ano → mês.
  const yearOf = (d: DocumentRecord) => String(dayjs(d.document_date || d.data?.serviceDate || '1970-01-01').year());
  const years = [...new Set(docs.map(yearOf))].sort((a, b) => b.localeCompare(a));

  let content: React.ReactNode;
  if (kind === 'fatd') content = <Stack gap="xs" className="stagger">{[...docs].sort(byDateDesc).map(card)}</Stack>;
  else if (requirement)
    content = (
      <Accordion multiple defaultValue={years.slice(0, 1)} variant="separated" radius="lg">
        {years.map((year) => {
          const inYear = docs.filter((d) => yearOf(d) === year);
          const cats = REQUIREMENT_CATEGORIES.filter((c, i) => i < 5 || inYear.some((d) => requirementCategory(d) === c));
          return (
            <Accordion.Item key={year} value={year}>
              <Accordion.Control>{folderControl(year, inYear.length, ['requerimento', 'requerimentos'])}</Accordion.Control>
              <Accordion.Panel>
                <Accordion multiple variant="contained" radius="md">
                  {cats.map((cat) => {
                    const items = inYear.filter((d) => requirementCategory(d) === cat).sort(byDateDesc);
                    return (
                      <Accordion.Item key={cat} value={cat}>
                        <Accordion.Control>{folderControl(cat, items.length, ['requerimento', 'requerimentos'])}</Accordion.Control>
                        <Accordion.Panel>
                          {items.length ? <Stack gap="xs">{items.map(card)}</Stack> : <Text size="sm" c="dimmed">Nenhum requerimento nesta pasta.</Text>}
                        </Accordion.Panel>
                      </Accordion.Item>
                    );
                  })}
                </Accordion>
              </Accordion.Panel>
            </Accordion.Item>
          );
        })}
      </Accordion>
    );
  else
    content = (
      <Accordion multiple defaultValue={years.slice(0, 1)} variant="separated" radius="lg">
        {years.map((year) => {
          const inYear = docs.filter((d) => yearOf(d) === year);
          const months = [...new Set(inYear.map((d) => dayjs(d.document_date || d.data?.serviceDate).format('MM')))].sort((a, b) => b.localeCompare(a));
          return (
            <Accordion.Item key={year} value={year}>
              <Accordion.Control>{folderControl(year, inYear.length, ['documento', 'documentos'])}</Accordion.Control>
              <Accordion.Panel>
                <Accordion multiple defaultValue={months.slice(0, 1)} variant="contained" radius="md">
                  {months.map((m) => {
                    const items = inYear.filter((d) => dayjs(d.document_date || d.data?.serviceDate).format('MM') === m).sort(byDateDesc);
                    return (
                      <Accordion.Item key={m} value={m}>
                        <Accordion.Control>{folderControl(dayjs(`${year}-${m}-01`).format('MMMM'), items.length, ['documento', 'documentos'])}</Accordion.Control>
                        <Accordion.Panel>
                          <Stack gap="xs">{items.map(card)}</Stack>
                        </Accordion.Panel>
                      </Accordion.Item>
                    );
                  })}
                </Accordion>
              </Accordion.Panel>
            </Accordion.Item>
          );
        })}
      </Accordion>
    );

  return (
    <>
      <PageHeader
        title={title}
        eyebrow={eyebrow}
        subtitle={subtitle}
        actions={
          canEdit && (
            <Button leftSection={<IconPlus size={18} />} onClick={() => openForm(null)}>
              Novo {info.label}
            </Button>
          )
        }
      />
      <Card mb="lg" padding="sm">
        <Group justify="space-between" wrap="wrap" gap="sm">
          <SegmentedControl value={kind} onChange={(v) => setKind(v as DocKind)} data={kinds.map((k) => ({ value: k, label: KIND_INFO[k].title }))} />
          <Group gap="xs">
            <IconFileText size={16} color="var(--mantine-color-dimmed)" />
            <Text size="sm" c="dimmed">
              {info.subtitle}
            </Text>
          </Group>
        </Group>
      </Card>

      <div key={kind} className="page-enter">
        {isLoading && (
          <Stack>
            <Skeleton h={60} radius="lg" />
            <Skeleton h={60} radius="lg" />
          </Stack>
        )}
        {error && <EmptyState title="Arquivo indisponível" description={error.message} />}
        {!isLoading && !error && !docs.length && (
          <EmptyState
            title={`Nenhum ${requirement ? 'requerimento' : 'registro'} salvo`}
            description={canEdit ? 'Crie o primeiro documento desta área.' : 'Os documentos salvos aparecerão aqui.'}
            icon={<IconFileText size={26} />}
            action={
              canEdit && (
                <Button mt="sm" variant="light" leftSection={<IconPlus size={16} />} onClick={() => openForm(null)}>
                  Novo {info.label}
                </Button>
              )
            }
          />
        )}
        {!isLoading && !!docs.length && content}
      </div>

      <DocumentViewer doc={viewing} onClose={() => setViewing(null)} canEdit={canEdit} onEdit={openForm} onDelete={remove} editingBy={viewing ? joinNames(othersEditing(viewing).map((e) => e.name)) : ''} />
      <EditSessionContext.Provider value={session}>
        {kind === 'aditamento' && <AditamentoEditor opened={formOpen} onClose={closeForm} key={editorKey} existing={editing} saved={docs} />}
        {kind === 'pernoite' && <PernoiteEditor opened={formOpen} onClose={closeForm} key={editorKey} existing={editing} saved={docs} />}
        {kind === 'fatd' && <FatdEditor opened={formOpen} onClose={closeForm} key={editorKey} existing={editing} saved={docs} />}
        {kind === 'prorrogacao' && <ProrrogacaoEditor opened={formOpen} onClose={closeForm} key={editorKey} existing={editing} saved={docs} />}
        {kind === 'adiantamento13' && <AdiantamentoEditor opened={formOpen} onClose={closeForm} key={editorKey} existing={editing} saved={docs} />}
      </EditSessionContext.Provider>
    </>
  );
}
