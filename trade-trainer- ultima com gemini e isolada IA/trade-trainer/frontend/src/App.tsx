import { useState } from 'react';
import { TabMenu } from 'primereact/tabmenu';
import { SessionSetup } from './components/SessionSetup';
import { TrainingScreen } from './components/TrainingScreen';
import { StrategyBank } from './components/StrategyBank';
import { SessionHistory } from './components/SessionHistory';
import type { SessionView } from './types';

type Tab = 'treino' | 'historico' | 'estrategias';

function App() {
  const [tab, setTab] = useState<Tab>('treino');
  const [activeSession, setActiveSession] = useState<SessionView | null>(null);

  const items = [
    { label: 'Treino', icon: 'pi pi-chart-line' },
    { label: 'Histórico', icon: 'pi pi-history' },
    { label: 'Banco de Estratégias', icon: 'pi pi-book' },
  ];

  const indexToTab: Tab[] = ['treino', 'historico', 'estrategias'];
  const tabToIndex: Record<Tab, number> = { treino: 0, historico: 1, estrategias: 2 };

  return (
    <div className="app-container">
      <h1 style={{ marginBottom: '0.25rem' }}>Trade Trainer</h1>
      <p style={{ color: '#9ca3af', marginTop: 0, marginBottom: '1.5rem' }}>
        Treino de entradas com dados históricos reais, replay manual e avaliação por IA
      </p>

      <TabMenu
        model={items}
        activeIndex={tabToIndex[tab]}
        onTabChange={(e) => setTab(indexToTab[e.index])}
      />

      <div style={{ marginTop: '1.5rem' }}>
        {tab === 'estrategias' && <StrategyBank />}
        {tab === 'historico' && <SessionHistory />}

        {tab === 'treino' &&
          (activeSession ? (
            <TrainingScreen
              sessionId={activeSession.session.id}
              initialView={activeSession}
              onExit={() => setActiveSession(null)}
            />
          ) : (
            <SessionSetup onSessionCreated={setActiveSession} />
          ))}
      </div>
    </div>
  );
}

export default App;
