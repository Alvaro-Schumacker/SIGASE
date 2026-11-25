import { Center, Loader } from '@mantine/core';
import { lazy } from 'react';
import { HashRouter, Route, Routes } from 'react-router-dom';
import { useMe } from './api';
import { AppLayout } from './layout/AppLayout';
import { LoginPage } from './pages/LoginPage';
import { ChangePasswordPage } from './pages/ChangePasswordPage';
import { DashboardPage } from './pages/DashboardPage';
import { TasksPage } from './pages/TasksPage';
import { ComingSoonPage } from './pages/ComingSoonPage';

// Telas carregadas sob demanda: a abertura do sistema fica mais leve.
const page = <K extends string>(loader: () => Promise<Record<K, React.ComponentType>>, name: K) =>
  lazy(() => loader().then((m) => ({ default: m[name] })));

const NoticesPage = page(() => import('./pages/NoticesPage'), 'NoticesPage');
const HistoryPage = page(() => import('./pages/HistoryPage'), 'HistoryPage');
const UsersPage = page(() => import('./pages/UsersPage'), 'UsersPage');
const UnitPage = page(() => import('./pages/UnitPage'), 'UnitPage');
const VacationPage = page(() => import('./pages/VacationPage'), 'VacationPage');
const ScalesPage = page(() => import('./pages/ScalesPage'), 'ScalesPage');
const ForceMapsPage = page(() => import('./pages/ForceMapsPage'), 'ForceMapsPage');
const DocumentsPage = page(() => import('./pages/DocumentsPage'), 'DocumentsPage');
const RequirementsPage = page(() => import('./pages/DocumentsPage'), 'RequirementsPage');

export default function App() {
  const { data: me, isLoading } = useMe();

  if (isLoading) {
    return (
      <Center h="100vh">
        <Loader />
      </Center>
    );
  }
  if (!me) return <LoginPage />;
  if (me.mustChangePassword) return <ChangePasswordPage />;

  return (
    <HashRouter>
      <Routes>
        <Route element={<AppLayout />}>
          <Route index element={<DashboardPage />} />
          <Route path="tarefas" element={<TasksPage />} />
          <Route path="avisos" element={<NoticesPage />} />
          <Route path="unidade" element={<UnitPage />} />
          <Route path="escalas" element={<ScalesPage />} />
          <Route path="documentos" element={<DocumentsPage />} />
          <Route path="requerimentos" element={<RequirementsPage />} />
          <Route path="mapas" element={<ForceMapsPage />} />
          <Route path="ferias" element={<VacationPage />} />
          <Route path="usuarios" element={<UsersPage />} />
          <Route path="historico" element={<HistoryPage />} />
          <Route path="*" element={<ComingSoonPage />} />
        </Route>
      </Routes>
    </HashRouter>
  );
}
