import { Alert, Button, Collapse, Group, Stack, Text } from '@mantine/core';
import { modals } from '@mantine/modals';
import { IconAlertTriangle, IconEye, IconEyeOff } from '@tabler/icons-react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import dayjs from 'dayjs';
import { createContext, useContext, useEffect, useRef, useState } from 'react';
import { ApiError, api } from '../../api';
import { type DocumentInput, type DocumentRecord, documentPaper } from '../../data/documents';
import { PaperPreview } from '../PaperPreview';

// ---------------------------------------------------------------------------------------------
// Edição simultânea do mesmo documento.
//  - Conflito: o editor envia a versão (updated_at) que carregou; se alguém salvou antes, o
//    servidor responde 409 e nada é sobrescrito. Aqui a pessoa escolhe o que fazer.
//  - Presença: enquanto o editor está aberto ele avisa o servidor, que devolve quem mais está no
//    mesmo documento e se uma versão nova foi salva nesse meio-tempo.
// ---------------------------------------------------------------------------------------------

export interface DocEditor {
  user_id: number;
  name: string;
  avatar_icon: string;
  since: string;
}

export interface SavedVersion {
  updated_at: string;
  user_id: number | null;
  /** Vazio quando o servidor não sabe quem salvou (ex.: depois de reiniciar). */
  name: string;
}

interface EditSession {
  /** Versão do documento carregada no editor (null para documento novo). */
  doc: DocumentRecord | null;
  /** Troca o conteúdo do editor pela versão salva mais recente (ou pela versão informada). */
  reload: (doc?: DocumentRecord) => void;
}

export const EditSessionContext = createContext<EditSession | null>(null);
export const useEditSession = () => useContext(EditSessionContext);

/** "2026-11-26 14:32:10.123456+00:00" (formato do servidor) → dayjs local. */
export const parseStamp = (value?: string | null) => dayjs(String(value || '').replace(' ', 'T').replace(/(\.\d{3})\d+/, '$1'));

/** "14:32" se for hoje, senão "25/11 às 14:32". */
export function stampLabel(value?: string | null) {
  const d = parseStamp(value);
  if (!d.isValid()) return '';
  return d.isSame(dayjs(), 'day') ? d.format('HH:mm') : d.format('DD/MM [às] HH:mm');
}

export const joinNames = (names: string[]) => (names.length <= 1 ? names.join('') : `${names.slice(0, -1).join(', ')} e ${names[names.length - 1]}`);

const HEARTBEAT_MS = 20_000;

/** Avisa o servidor que este documento está aberto no editor e acompanha quem mais está nele. */
export function useDocumentPresence(docId: number | undefined, active: boolean) {
  const [editors, setEditors] = useState<DocEditor[]>([]);
  const [saved, setSaved] = useState<SavedVersion | null>(null);
  const [missing, setMissing] = useState(false);

  useEffect(() => {
    setEditors([]);
    setSaved(null);
    setMissing(false);
    if (!active || !docId) return;
    const url = `/api/documents/${docId}/presence`;
    let alive = true;
    const beat = () =>
      api<{ editors: DocEditor[]; saved: SavedVersion }>(url, { method: 'POST' })
        .then((r) => {
          if (!alive) return;
          setEditors(r.editors);
          setSaved(r.saved);
        })
        .catch((error) => {
          if (alive && error instanceof ApiError && error.code === 'document_missing') setMissing(true);
        });
    // keepalive: o aviso de saída chega mesmo quando a aba está sendo fechada.
    const leave = () => fetch(url, { method: 'DELETE', credentials: 'same-origin', keepalive: true }).catch(() => undefined);
    const onVisible = () => {
      if (!document.hidden) beat();
    };
    beat();
    const timer = window.setInterval(beat, HEARTBEAT_MS);
    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('pagehide', leave);
    return () => {
      alive = false;
      window.clearInterval(timer);
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('pagehide', leave);
      leave();
    };
  }, [docId, active]);

  return { editors, saved, missing };
}

/** Quem está editando cada documento agora (para a lista do arquivo). */
export function useEditingNow(enabled = true) {
  return useQuery({
    queryKey: ['documents', 'presence'],
    queryFn: async () => (await api<{ editing: Record<string, DocEditor[]> }>('/api/documents/presence')).editing,
    refetchInterval: 15_000,
    enabled,
  });
}

interface SaveCallbacks {
  onSuccess?: (result: { document: DocumentRecord }) => void;
  onError?: (error: Error) => void;
}

/**
 * Salva o documento enviando a versão carregada. Se alguém salvou antes (409), abre a escolha:
 * continuar editando, carregar a versão do colega ou salvar por cima de propósito.
 */
export function useSaveDocument() {
  const qc = useQueryClient();
  const session = useEditSession();
  // Depois de "salvar por cima", a base passa a ser a versão que a pessoa decidiu substituir.
  const override = useRef<{ id: number; base?: string } | null>(null);
  const mutation = useMutation({
    mutationFn: ({ id, base_updated_at, ...body }: DocumentInput & { base_updated_at?: string }) =>
      api<{ document: DocumentRecord }>(id ? `/api/documents/${id}` : '/api/documents', { method: id ? 'PUT' : 'POST', body: id ? { ...body, base_updated_at } : body }),
    onSuccess: (_r, v) => qc.invalidateQueries({ queryKey: ['documents', v.kind] }),
  });

  const mutate = (input: DocumentInput, callbacks: SaveCallbacks = {}) => {
    const base = !input.id ? undefined : override.current?.id === input.id ? override.current.base : session?.doc?.id === input.id ? session.doc.updated_at : undefined;
    mutation.mutate(
      { ...input, base_updated_at: base },
      {
        onSuccess: (result) => {
          override.current = null;
          callbacks.onSuccess?.(result);
        },
        onError: (error) => {
          if (error instanceof ApiError && error.code === 'document_conflict' && input.id) {
            const theirs = error.data.document as DocumentRecord;
            const saved = error.data.saved as SavedVersion;
            qc.invalidateQueries({ queryKey: ['documents', input.kind] });
            openConflictModal({
              theirs,
              saved,
              onOverwrite: () => {
                override.current = { id: input.id!, base: theirs.updated_at };
                mutate(input, callbacks);
              },
              onLoadTheirs: () => session?.reload(theirs),
            });
            return;
          }
          callbacks.onError?.(error);
        },
      },
    );
  };

  return { mutate, isPending: mutation.isPending };
}

function ConflictBody({ theirs, saved, onOverwrite, onLoadTheirs, close }: { theirs: DocumentRecord; saved: SavedVersion; onOverwrite: () => void; onLoadTheirs: () => void; close: () => void }) {
  const [preview, setPreview] = useState(false);
  const who = saved.name || 'Outra pessoa';
  const paper = (() => {
    try {
      return documentPaper(theirs);
    } catch {
      return null;
    }
  })();
  return (
    <Stack gap="sm">
      <Text size="sm">
        <b>{who}</b> salvou este documento{stampLabel(saved.updated_at) ? ` às ${stampLabel(saved.updated_at)}` : ''} enquanto você editava. Para não apagar o trabalho de ninguém, <b>nada foi sobrescrito</b>. Suas alterações continuam no editor.
      </Text>
      {paper && (
        <>
          <Button variant="subtle" size="compact-sm" leftSection={preview ? <IconEyeOff size={16} /> : <IconEye size={16} />} onClick={() => setPreview((v) => !v)} style={{ alignSelf: 'flex-start' }}>
            {preview ? 'Esconder' : 'Ver'} a versão salva por {who}
          </Button>
          <Collapse expanded={preview}>{preview && <PaperPreview paper={paper} height="55vh" />}</Collapse>
        </>
      )}
      <Alert variant="light" color="gray" p="xs">
        <Text size="xs">
          Dica: se as mudanças forem em partes diferentes, carregue a versão salva e refaça só o que é seu. Assim nada se perde.
        </Text>
      </Alert>
      <Group justify="space-between" mt="xs">
        <Button
          variant="subtle"
          color="red"
          onClick={() => {
            close();
            onOverwrite();
          }}
        >
          Salvar a minha por cima
        </Button>
        <Group gap="xs">
          <Button
            variant="default"
            onClick={() => {
              close();
              onLoadTheirs();
            }}
          >
            Carregar a versão salva
          </Button>
          <Button data-autofocus onClick={close}>
            Continuar editando
          </Button>
        </Group>
      </Group>
    </Stack>
  );
}

function openConflictModal(props: { theirs: DocumentRecord; saved: SavedVersion; onOverwrite: () => void; onLoadTheirs: () => void }) {
  const id = modals.open({
    title: (
      <Group gap="xs">
        <IconAlertTriangle size={20} color="var(--mantine-color-orange-6)" />
        <Text fw={800}>Alguém salvou este documento antes de você</Text>
      </Group>
    ),
    size: 'xl',
    closeOnEscape: false,
    closeOnClickOutside: false,
    children: <ConflictBody {...props} close={() => modals.close(id)} />,
  });
}
