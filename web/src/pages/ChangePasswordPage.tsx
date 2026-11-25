import { Alert, Button, Card, Center, Group, PasswordInput, Progress, Stack, Text, ThemeIcon, Title } from '@mantine/core';
import { useForm } from '@mantine/form';
import { notifications } from '@mantine/notifications';
import { IconShieldLock } from '@tabler/icons-react';
import { useChangePassword, useCurrentUser, useLogout } from '../api';

function strength(password: string) {
  let score = 0;
  if (password.length >= 8) score += 25;
  if (password.length >= 12) score += 15;
  if (/[a-z]/.test(password) && /[A-Z]/.test(password)) score += 20;
  if (/\d/.test(password)) score += 20;
  if (/[^A-Za-z0-9]/.test(password)) score += 20;
  return Math.min(score, 100);
}

/** Troca obrigatória de senha (senha padrão, fraca ou definida pelo administrador). */
export function ChangePasswordPage() {
  const me = useCurrentUser();
  const change = useChangePassword();
  const logout = useLogout();
  const form = useForm({
    initialValues: { current: '', next: '', confirm: '' },
    validate: {
      current: (v) => (v ? null : 'Informe a senha atual'),
      next: (v) => (v.length >= 8 ? null : 'Use pelo menos 8 caracteres'),
      confirm: (v, values) => (v === values.next ? null : 'A confirmação não confere'),
    },
  });
  const score = strength(form.values.next);
  const color = score < 50 ? 'red' : score < 80 ? 'brass' : 'sigase';

  return (
    <Center className="login-bg" p="md">
      <Card shadow="xl" p={36} w="100%" maw={460}>
        <form
          onSubmit={form.onSubmit((v) =>
            change.mutate(
              { current_password: v.current, new_password: v.next },
              { onSuccess: () => notifications.show({ color: 'sigase', title: 'Senha alterada', message: 'Bem-vindo ao SIGASE.' }) },
            ),
          )}
        >
          <Stack gap="md">
            <Group gap="sm">
              <ThemeIcon size={44} radius="md" variant="light">
                <IconShieldLock size={24} />
              </ThemeIcon>
              <div>
                <Title order={3}>Defina uma nova senha</Title>
                <Text size="sm" c="dimmed">
                  Olá, {me.user}
                </Text>
              </div>
            </Group>
            <Text size="sm" c="dimmed">
              Sua senha atual é provisória ou fraca. Para proteger os dados da seção, escolha uma nova senha antes de continuar.
            </Text>
            {change.error && <Alert color="red">{change.error.message}</Alert>}
            <PasswordInput label="Senha atual" autoComplete="current-password" {...form.getInputProps('current')} />
            <div>
              <PasswordInput label="Nova senha" autoComplete="new-password" {...form.getInputProps('next')} />
              <Progress value={score} color={color} size="xs" mt={8} />
              <Text size="xs" c="dimmed" mt={4}>
                Pelo menos 8 caracteres. Misture letras maiúsculas, números e símbolos. Não use o login nem sequências.
              </Text>
            </div>
            <PasswordInput label="Confirme a nova senha" autoComplete="new-password" {...form.getInputProps('confirm')} />
            <Group justify="space-between" mt="sm">
              <Button variant="subtle" color="gray" onClick={() => logout.mutate()}>
                Sair
              </Button>
              <Button type="submit" loading={change.isPending}>
                Salvar nova senha
              </Button>
            </Group>
          </Stack>
        </form>
      </Card>
    </Center>
  );
}
