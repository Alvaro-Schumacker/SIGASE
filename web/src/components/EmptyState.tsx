import { Center, Stack, Text, ThemeIcon } from '@mantine/core';
import { IconInbox } from '@tabler/icons-react';
import type { ReactNode } from 'react';

interface Props {
  title: string;
  description?: ReactNode;
  icon?: ReactNode;
  action?: ReactNode;
  py?: number;
}

export function EmptyState({ title, description, icon, action, py = 48 }: Props) {
  return (
    <Center py={py}>
      <Stack align="center" gap={6} maw={420} ta="center">
        <ThemeIcon size={52} radius="xl" variant="light" color="gray">
          {icon ?? <IconInbox size={26} />}
        </ThemeIcon>
        <Text fw={700} mt={4}>
          {title}
        </Text>
        {description && (
          <Text size="sm" c="dimmed">
            {description}
          </Text>
        )}
        {action}
      </Stack>
    </Center>
  );
}
