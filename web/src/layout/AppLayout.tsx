import {
  ActionIcon,
  AppShell,
  Badge,
  Box,
  Burger,
  Center,
  Loader,
  Button,
  Group,
  Image,
  NavLink,
  ScrollArea,
  Stack,
  Text,
  Tooltip,
  useComputedColorScheme,
  useMantineColorScheme,
} from '@mantine/core';
import { useDisclosure } from '@mantine/hooks';
import { IconExternalLink, IconHistory, IconLogout, IconMoon, IconSun } from '@tabler/icons-react';
import { Suspense } from 'react';
import { NavLink as RouterLink, Outlet, useLocation } from 'react-router-dom';
import { useCurrentUser, useLogout, useNotices, useTasks } from '../api';
import { pendingNotices } from '../data/notices';
import { ROLE_LABEL } from '../lib/format';
import { tasksForTab, visibleTasks } from '../lib/tasks';
import { UserAvatar } from '../components/UserAvatar';
import { ReleaseNotes } from '../components/ReleaseNotes';
import { useHeartbeat } from './useHeartbeat';

interface NavItem {
  to: string;
  label: string;
  icon: string;
  badge?: 'inbox' | 'notices';
}

export const NAV: NavItem[] = [
  { to: '/', label: 'Página Inicial', icon: 'pagina-inicial' },
  { to: '/tarefas', label: 'Caixa de entrada', icon: 'caixa-de-entrada', badge: 'inbox' },
  { to: '/avisos', label: 'Avisos', icon: 'avisos', badge: 'notices' },
  { to: '/unidade', label: 'Dados da Unidade', icon: 'dados-da-unidade' },
  { to: '/escalas', label: 'Escalas de serviço', icon: 'escalas-de-servico' },
  { to: '/documentos', label: 'Documentos', icon: 'documentos' },
  { to: '/requerimentos', label: 'Requerimentos', icon: 'requerimentos' },
  { to: '/mapas', label: 'Mapas da força', icon: 'mapas-da-forca' },
  { to: '/ferias', label: 'Plano de férias', icon: 'plano-de-ferias' },
  { to: '/usuarios', label: 'Usuários', icon: 'usuarios' },
];

const navStyle = { borderRadius: 'var(--mantine-radius-md)' };

export function AppLayout() {
  const me = useCurrentUser();
  const [opened, { toggle, close }] = useDisclosure();
  const location = useLocation();
  const logout = useLogout();
  const { setColorScheme } = useMantineColorScheme();
  const scheme = useComputedColorScheme('light');
  const { data: tasks = [] } = useTasks();
  const { data: notices = [] } = useNotices();
  useHeartbeat();

  const counts = {
    inbox: tasksForTab(visibleTasks(tasks, me), 'Recebidas', me).length,
    notices: pendingNotices(notices).length,
  };
  const isActive = (to: string) => (to === '/' ? location.pathname === '/' : location.pathname.startsWith(to));

  return (
    <AppShell header={{ height: 60 }} navbar={{ width: 264, breakpoint: 'sm', collapsed: { mobile: !opened } }} padding={{ base: 'md', md: 'xl' }}>
      <AppShell.Header px="md" className="glass-header">
        <Group h="100%" justify="space-between" wrap="nowrap">
          <Group gap="sm" wrap="nowrap">
            <Burger opened={opened} onClick={toggle} hiddenFrom="sm" size="sm" aria-label="Abrir menu" />
            <Image className="brand-logo" src="/assets/brand/sigase-logo.png" h={30} w="auto" fit="contain" alt="SIGASE" />
          </Group>
          <Group gap="xs" wrap="nowrap">
            <Button component="a" href="/classico/" variant="subtle" color="gray" size="xs" rightSection={<IconExternalLink size={14} />} visibleFrom="sm">
              Versão clássica
            </Button>
            <ReleaseNotes />
            <Tooltip label={scheme === 'dark' ? 'Tema claro' : 'Tema escuro'}>
              <ActionIcon variant="default" size="lg" aria-label="Alternar tema" onClick={() => setColorScheme(scheme === 'dark' ? 'light' : 'dark')}>
                {scheme === 'dark' ? <IconSun size={18} /> : <IconMoon size={18} />}
              </ActionIcon>
            </Tooltip>
          </Group>
        </Group>
      </AppShell.Header>

      <AppShell.Navbar p="md">
        <AppShell.Section>
          <Group gap="sm" wrap="nowrap" p="sm" mb="md" className="user-card">
            <UserAvatar name={me.user} icon={me.avatar_icon} size={40} />
            <Box style={{ flex: 1, minWidth: 0 }}>
              <Text fw={700} size="sm" truncate>
                {me.user}
              </Text>
              <Text size="xs" c="dimmed">
                {ROLE_LABEL[me.role]}
              </Text>
            </Box>
            <Tooltip label="Sair">
              <ActionIcon variant="subtle" color="gray" aria-label="Sair" loading={logout.isPending} onClick={() => logout.mutate()}>
                <IconLogout size={18} />
              </ActionIcon>
            </Tooltip>
          </Group>
          <Text size="xs" fw={700} c="dimmed" tt="uppercase" px="sm" mb={6} style={{ letterSpacing: 1.2 }}>
            Menu
          </Text>
        </AppShell.Section>

        <AppShell.Section grow component={ScrollArea}>
          <Stack gap={2}>
            {NAV.map((item) => {
              const count = item.badge ? counts[item.badge] : 0;
              return (
                <NavLink
                  key={item.to}
                  component={RouterLink}
                  to={item.to}
                  onClick={close}
                  active={isActive(item.to)}
                  variant="light"
                  label={item.label}
                  style={navStyle}
                  leftSection={<img className="nav-icon" src={`/assets/icons/menu/${item.icon}.png`} alt="" />}
                  rightSection={
                    count ? (
                      <Badge size="sm" variant="filled" circle={count < 10}>
                        {count}
                      </Badge>
                    ) : null
                  }
                />
              );
            })}
            {me.canManageUsers && (
              <>
                <Text size="xs" fw={700} c="dimmed" tt="uppercase" px="sm" mt="md" mb={6} style={{ letterSpacing: 1.2 }}>
                  Administração
                </Text>
                <NavLink
                  component={RouterLink}
                  to="/historico"
                  onClick={close}
                  active={isActive('/historico')}
                  variant="light"
                  label="Histórico"
                  style={navStyle}
                  leftSection={<IconHistory size={20} stroke={1.6} />}
                />
              </>
            )}
          </Stack>
        </AppShell.Section>

        <AppShell.Section>
          <Text size="xs" c="dimmed" ta="center" mt="md">
            SIGASE · Sistema de gestão administrativa
          </Text>
        </AppShell.Section>
      </AppShell.Navbar>

      <AppShell.Main>
        <Box maw={1320} mx="auto" key={location.pathname} className="page-enter">
          <Suspense
            fallback={
              <Center h={240}>
                <Loader size="sm" />
              </Center>
            }
          >
            <Outlet />
          </Suspense>
        </Box>
      </AppShell.Main>
    </AppShell>
  );
}
