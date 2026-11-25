import { Avatar, Button, Checkbox, Group, Modal, PasswordInput, SegmentedControl, SimpleGrid, Stack, Text, TextInput, UnstyledButton } from '@mantine/core';
import { useForm } from '@mantine/form';
import { useEffect } from 'react';
import { useTaskCategories } from '../api';
import { EDIT_AREAS, PROFILE_ICONS, useSaveUser } from '../data/users';
import { notifyError, notifyOk } from '../lib/confirm';
import type { AppUser, Role } from '../types';

interface Props {
  opened: boolean;
  onClose: () => void;
  user: AppUser | null;
}

const ROLE_HELP: Record<Role, string> = {
  viewer: 'Visualiza todas as áreas, sem alterar nada.',
  editor: 'Pode criar, editar e excluir somente nas áreas marcadas abaixo.',
  admin: 'Acesso total, inclusive gerenciamento de usuários e avisos.',
};

export function UserFormModal({ opened, onClose, user }: Props) {
  const editing = !!user;
  const { data: categories = [] } = useTaskCategories();
  const save = useSaveUser();
  const form = useForm({
    initialValues: { display_name: '', login: '', password: '', role: 'viewer' as Role, functions: [] as string[], permissions: [] as string[], avatar_icon: PROFILE_ICONS[0] },
    validate: {
      display_name: (v) => (v.trim() ? null : 'Informe o nome do usuário'),
      login: (v) => (v.trim().length >= 4 && !/\s/.test(v.trim()) ? null : 'Login de 4 a 40 caracteres, sem espaços'),
      password: (v) => (!editing && !v ? 'Defina uma senha' : v && v.length < 8 ? 'A senha deve ter pelo menos 8 caracteres' : null),
    },
  });

  useEffect(() => {
    if (!opened) return;
    form.setValues(
      user
        ? { display_name: user.display_name, login: user.login, password: '', role: user.role, functions: user.functions, permissions: user.permissions ?? [], avatar_icon: PROFILE_ICONS.includes(user.avatar_icon) ? user.avatar_icon : PROFILE_ICONS[0] }
        : { display_name: '', login: '', password: '', role: 'viewer', functions: [], permissions: [], avatar_icon: PROFILE_ICONS[Math.floor(Math.random() * PROFILE_ICONS.length)] },
    );
    form.resetDirty();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [opened, user]);

  const submit = form.onSubmit((v) =>
    save.mutate(
      { id: user?.id, ...v, display_name: v.display_name.trim(), login: v.login.trim(), permissions: v.role === 'editor' ? v.permissions : [] },
      {
        onSuccess: () => {
          notifyOk(editing ? 'Usuário atualizado.' : 'Usuário adicionado.');
          onClose();
        },
        onError: (e) => notifyError(e),
      },
    ),
  );

  return (
    <Modal
      opened={opened}
      onClose={onClose}
      size="xl"
      title={
        <div>
          <Text fw={800} size="lg">
            {editing ? 'Editar usuário' : 'Adicionar usuário'}
          </Text>
          <Text size="sm" c="dimmed">
            Defina o nível de acesso e, para editores, as áreas que poderão alterar.
          </Text>
        </div>
      }
    >
      <form onSubmit={submit}>
        <Stack gap="lg">
          <SimpleGrid cols={{ base: 1, sm: 2 }}>
            <TextInput label="Nome de exibição" withAsterisk maxLength={80} placeholder="Ex.: Cb Novo" {...form.getInputProps('display_name')} />
            <TextInput label="Login" withAsterisk maxLength={40} autoComplete="off" placeholder="Ex.: cbnovo" {...form.getInputProps('login')} />
          </SimpleGrid>
          <PasswordInput
            label={editing ? 'Nova senha' : 'Senha'}
            withAsterisk={!editing}
            maxLength={128}
            autoComplete="new-password"
            description={editing ? 'Deixe em branco para manter a senha atual.' : 'Pelo menos 8 caracteres. No primeiro acesso o usuário deverá trocá-la.'}
            {...form.getInputProps('password')}
          />

          <Stack gap={6}>
            <Text size="sm" fw={600}>
              Nível de acesso
            </Text>
            <SegmentedControl
              fullWidth
              data={[
                { value: 'viewer', label: 'Visitante' },
                { value: 'editor', label: 'Editor' },
                { value: 'admin', label: 'Administrador' },
              ]}
              {...form.getInputProps('role')}
            />
            <Text size="xs" c="dimmed">
              {ROLE_HELP[form.values.role]}
            </Text>
          </Stack>

          {form.values.role === 'editor' && (
            <Checkbox.Group label="Áreas que o editor pode alterar" className="page-enter" {...form.getInputProps('permissions')}>
              <SimpleGrid cols={{ base: 1, xs: 2, sm: 3 }} spacing="xs" mt="xs">
                {EDIT_AREAS.map((a) => (
                  <Checkbox key={a.value} value={a.value} label={a.label} />
                ))}
              </SimpleGrid>
            </Checkbox.Group>
          )}

          <Checkbox.Group
            label="Funções / classificações sob responsabilidade"
            description="Ajudam a identificar responsáveis (ex.: quem recebe os avisos automáticos de Férias)."
            {...form.getInputProps('functions')}
          >
            <Group gap="md" mt="xs">
              {categories.length ? categories.map((c) => <Checkbox key={c.id} value={c.name} label={c.name} />) : <Text size="sm" c="dimmed">Nenhuma função cadastrada.</Text>}
            </Group>
          </Checkbox.Group>

          <Stack gap={6}>
            <Text size="sm" fw={600}>
              Ícone do perfil
            </Text>
            <SimpleGrid cols={{ base: 5, sm: 10 }} spacing={8}>
              {PROFILE_ICONS.map((icon) => {
                const active = form.values.avatar_icon === icon;
                return (
                  <UnstyledButton
                    key={icon}
                    onClick={() => form.setFieldValue('avatar_icon', icon)}
                    aria-label="Selecionar ícone"
                    style={{
                      borderRadius: 999,
                      outline: active ? '3px solid var(--mantine-color-sigase-6)' : '3px solid transparent',
                      outlineOffset: 2,
                      transition: 'outline-color 120ms, transform 120ms',
                      transform: active ? 'scale(1.06)' : undefined,
                    }}
                  >
                    <Avatar src={`/assets/icons/profiles/${icon}`} size={44} radius="xl" />
                  </UnstyledButton>
                );
              })}
            </SimpleGrid>
          </Stack>

          <Group justify="flex-end">
            <Button variant="default" onClick={onClose}>
              Cancelar
            </Button>
            <Button type="submit" loading={save.isPending}>
              {editing ? 'Salvar alterações' : 'Adicionar usuário'}
            </Button>
          </Group>
        </Stack>
      </form>
    </Modal>
  );
}
