import { Group, Stack, Text, Title } from '@mantine/core';
import type { ReactNode } from 'react';

interface Props {
  title: string;
  subtitle?: ReactNode;
  eyebrow?: string;
  actions?: ReactNode;
}

/** Cabeçalho padrão de cada tela: título, subtítulo e ações à direita. */
export function PageHeader({ title, subtitle, eyebrow, actions }: Props) {
  return (
    <Group justify="space-between" align="flex-end" gap="md" mb="lg">
      <Stack gap={2}>
        {eyebrow && (
          <Text size="xs" fw={700} c="sigase" tt="uppercase" style={{ letterSpacing: 1.4 }}>
            {eyebrow}
          </Text>
        )}
        <Title order={2} fz={{ base: 24, sm: 28 }}>
          {title}
        </Title>
        {subtitle && <Text c="dimmed">{subtitle}</Text>}
      </Stack>
      {actions && <Group gap="xs">{actions}</Group>}
    </Group>
  );
}
