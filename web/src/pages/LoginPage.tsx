import { Alert, Button, Card, Center, Image, PasswordInput, Stack, Text, TextInput } from '@mantine/core';
import { useForm } from '@mantine/form';
import { IconAlertCircle, IconArrowRight, IconLock, IconUser } from '@tabler/icons-react';
import { useLogin } from '../api';

export function LoginPage() {
  const login = useLogin();
  const form = useForm({
    initialValues: { login: '', password: '' },
    validate: {
      login: (v) => (v.trim() ? null : 'Informe seu login'),
      password: (v) => (v ? null : 'Informe sua senha'),
    },
  });

  return (
    <Center className="login-bg" p="md">
      <Stack w="100%" maw={420} gap="lg">
        <Card shadow="xl" p={36}>
          <form
            onSubmit={form.onSubmit((values) =>
              login.mutate({ login: values.login.trim(), password: values.password }, { onError: () => form.setFieldValue('password', '') }),
            )}
          >
            <Stack gap="md">
              <Image src="/assets/brand/sigase-logo.png" h={64} w="auto" fit="contain" alt="SIGASE" mx="auto" />
              <Text c="dimmed" ta="center" size="sm">
                Entre com suas credenciais para acessar o sistema.
              </Text>
              {login.error && (
                <Alert color="red" variant="light" icon={<IconAlertCircle size={18} />}>
                  {login.error.message}
                </Alert>
              )}
              <TextInput
                label="Login"
                placeholder="Seu login"
                autoComplete="username"
                leftSection={<IconUser size={16} />}
                autoFocus
                {...form.getInputProps('login')}
              />
              <PasswordInput
                label="Senha"
                placeholder="Sua senha"
                autoComplete="current-password"
                leftSection={<IconLock size={16} />}
                {...form.getInputProps('password')}
              />
              <Button type="submit" size="md" fullWidth loading={login.isPending} rightSection={<IconArrowRight size={18} />}>
                Entrar
              </Button>
            </Stack>
          </form>
        </Card>
        <Text size="xs" c="dimmed" ta="center">
          SIGASE · Sistema de gestão administrativa
        </Text>
      </Stack>
    </Center>
  );
}
