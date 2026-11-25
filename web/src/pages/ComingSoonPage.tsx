import { Button, Card, Stack, Text, ThemeIcon, Title } from '@mantine/core';
import { IconHome, IconMapQuestion } from '@tabler/icons-react';
import { Link } from 'react-router-dom';

/** Endereço que não corresponde a nenhuma tela. */
export function ComingSoonPage() {
  return (
    <Card maw={520} mx="auto" mt="xl" p="xl">
      <Stack align="center" ta="center" gap="sm">
        <ThemeIcon size={56} radius="xl" variant="light" color="brass">
          <IconMapQuestion size={28} />
        </ThemeIcon>
        <Title order={3}>Página não encontrada</Title>
        <Text c="dimmed">O endereço acessado não corresponde a nenhuma área do SIGASE.</Text>
        <Button component={Link} to="/" mt="sm" leftSection={<IconHome size={16} />}>
          Voltar à Página Inicial
        </Button>
      </Stack>
    </Card>
  );
}
