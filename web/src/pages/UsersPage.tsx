import { ActionIcon, Badge, Button, Card, Group, Modal, SimpleGrid, Skeleton, Stack, Text, TextInput, Tooltip } from '@mantine/core';
import { useDisclosure } from '@mantine/hooks';
import { IconEdit, IconPlus, IconSearch, IconTags, IconTrash } from '@tabler/icons-react';
import { useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { useCurrentUser, useTaskCategories, useUsers } from '../api';
import { EmptyState } from '../components/EmptyState';
import { PageHeader } from '../components/PageHeader';
import { UserAvatar } from '../components/UserAvatar';
import { UserFormModal } from '../components/UserFormModal';
import { useCreateCategory } from '../data/users';
import { confirmDelete, notifyError, notifyOk } from '../lib/confirm';
import { ROLE_LABEL } from '../lib/format';
import type { AppUser } from '../types';

const ROLE_COLOR = { admin: 'sigase', editor: 'blue', viewer: 'gray' } as const;

export function UsersPage() {
  const me = useCurrentUser();
  const qc = useQueryClient();
  const { data: users = [], isLoading } = useUsers();
  const [search, setSearch] = useState('');
  const [editing, setEditing] = useState<AppUser | null>(null);
  const [formOpen, form] = useDisclosure();
  const [catOpen, cat] = useDisclosure();

  const term = search.toLocaleLowerCase('pt-BR');
  const list = users.filter((u) => `${u.display_name} ${ROLE_LABEL[u.role]} ${u.functions.join(' ')}`.toLocaleLowerCase('pt-BR').includes(term));

  const remove = (u: AppUser) => {
    if (u.id === me.id) {
      notifyError(new Error('Esse usuário está conectado e não pode ser excluído.'), 'Exclusão não permitida');
      return;
    }
    confirmDelete({ label: 'usuário', path: `/api/users/${u.id}`, qc, invalidate: [['users']] });
  };

  return (
    <>
      <PageHeader
        title="Usuários"
        subtitle={
          me.canManageUsers
            ? 'Administrador: acesso total e gerenciamento de usuários.'
            : me.role === 'editor'
              ? 'Editor: permissões de edição configuradas por área.'
              : 'Visitante: somente visualização.'
        }
        actions={
          me.canManageUsers && (
            <>
              <Button variant="default" leftSection={<IconTags size={18} />} onClick={cat.open}>
                Funções
              </Button>
              <Button
                leftSection={<IconPlus size={18} />}
                onClick={() => {
                  setEditing(null);
                  form.open();
                }}
              >
                Adicionar usuário
              </Button>
            </>
          )
        }
      />

      <Group mb="md" justify="space-between">
        <TextInput
          placeholder="Buscar por usuário, nível ou função…"
          leftSection={<IconSearch size={16} />}
          value={search}
          onChange={(e) => setSearch(e.currentTarget.value)}
          style={{ flex: '1 1 280px', maxWidth: 420 }}
        />
        <Text size="sm" c="dimmed">
          {list.length} {list.length === 1 ? 'usuário' : 'usuários'}
        </Text>
      </Group>

      {isLoading && (
        <SimpleGrid cols={{ base: 1, sm: 2, lg: 3 }}>
          {Array.from({ length: 6 }, (_, i) => (
            <Skeleton key={i} h={120} radius="lg" />
          ))}
        </SimpleGrid>
      )}
      {!isLoading && !list.length && <EmptyState title="Nenhum usuário encontrado" description="Ajuste a busca ou adicione um usuário." />}

      <SimpleGrid cols={{ base: 1, sm: 2, lg: 3 }} spacing="md" className="stagger">
        {list.map((u) => (
          <Card key={u.id} className="lift-card">
            <Group wrap="nowrap" align="flex-start" gap="md">
              <UserAvatar name={u.display_name} icon={u.avatar_icon} size={52} />
              <Stack gap={6} style={{ flex: 1, minWidth: 0 }}>
                <Group justify="space-between" wrap="nowrap" gap="xs">
                  <Text fw={700} truncate>
                    {u.display_name}
                  </Text>
                  <Badge color={ROLE_COLOR[u.role]} size="sm" style={{ flexShrink: 0 }}>
                    {ROLE_LABEL[u.role]}
                  </Badge>
                </Group>
                <Text size="xs" c="dimmed">
                  @{u.login}
                </Text>
                <Group gap={4}>
                  {u.functions.length ? (
                    u.functions.map((f) => (
                      <Badge key={f} variant="outline" color="brass" size="xs" tt="none">
                        {f}
                      </Badge>
                    ))
                  ) : (
                    <Text size="xs" c="dimmed">
                      Sem funções atribuídas
                    </Text>
                  )}
                </Group>
              </Stack>
            </Group>
            {me.canManageUsers && (
              <Group justify="flex-end" gap={4} mt="sm">
                <Tooltip label="Editar acesso">
                  <ActionIcon
                    variant="subtle"
                    aria-label="Editar acesso"
                    onClick={() => {
                      setEditing(u);
                      form.open();
                    }}
                  >
                    <IconEdit size={18} />
                  </ActionIcon>
                </Tooltip>
                <Tooltip label="Excluir">
                  <ActionIcon variant="subtle" color="red" aria-label="Excluir" onClick={() => remove(u)}>
                    <IconTrash size={18} />
                  </ActionIcon>
                </Tooltip>
              </Group>
            )}
          </Card>
        ))}
      </SimpleGrid>

      <UserFormModal opened={formOpen} onClose={form.close} user={editing} />
      <CategoryModal opened={catOpen} onClose={cat.close} />
    </>
  );
}

function CategoryModal({ opened, onClose }: { opened: boolean; onClose: () => void }) {
  const { data: categories = [] } = useTaskCategories();
  const create = useCreateCategory();
  const [name, setName] = useState('');
  const [error, setError] = useState('');

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return setError('Informe um nome.');
    create.mutate(name.trim(), {
      onSuccess: () => {
        setName('');
        setError('');
        notifyOk('Função/classificação criada.');
      },
      onError: (err) => setError(err.message),
    });
  };

  return (
    <Modal opened={opened} onClose={onClose} title={<Text fw={800} size="lg">Funções e classificações</Text>}>
      <Text size="sm" c="dimmed" mb="md">
        Cadastre as classificações disponíveis para usuários e tarefas.
      </Text>
      <form onSubmit={submit}>
        <Group align="flex-start" gap="xs">
          <TextInput placeholder="Ex.: Escalas" maxLength={40} value={name} onChange={(e) => setName(e.currentTarget.value)} error={error} style={{ flex: 1 }} />
          <Button type="submit" loading={create.isPending} leftSection={<IconPlus size={16} />}>
            Criar
          </Button>
        </Group>
      </form>
      <Stack gap={6} mt="md">
        {categories.map((c) => (
          <Card key={c.id} padding="xs" radius="md">
            <Text size="sm" fw={600}>
              {c.name}
            </Text>
            <Text size="xs" c="dimmed">
              Disponível para atribuição e classificação de tarefas
            </Text>
          </Card>
        ))}
      </Stack>
    </Modal>
  );
}
