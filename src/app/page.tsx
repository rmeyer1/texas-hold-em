import { MainLayout } from '../components/layout/MainLayout';
import { LobbyView } from '../components/lobby/LobbyView';

export default function Home() {
  return (
    <MainLayout>
      <LobbyView />
    </MainLayout>
  );
}
