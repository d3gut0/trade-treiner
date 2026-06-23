import { useState } from 'react';
import { TabMenu } from 'primereact/tabmenu';
import { SessionSetup } from './components/SessionSetup';
import { TrainingScreen } from './components/TrainingScreen';
import { StrategyBank } from './components/StrategyBank';
import type { SessionView } from './types';

type Tab = 'treino' | 'estrategias';

function App() {
  const [tab, setTab] = useState<Tab>('treino');
  const [activeSession, setActiveSession] = useState<SessionView | null>(null);

  const items = [
    { label: 'Treino', icon: 'pi pi-chart-line' },
    { label: 'Banco de Estratégias', icon: 'pi pi-book' },
  ];

  return (
    <div className="app-container">
      <h1 style={{ marginBottom: '0.25rem' }}>Trade Trainer</h1>
      <p style={{ color: '#9ca3af', marginTop: 0, marginBottom: '1.5rem' }}>
        Treino de entradas com dados históricos reais, replay manual e avaliação por IA
      </p>

      <TabMenu
        model={items}
        activeIndex={tab === 'treino' ? 0 : 1}
        onTabChange={(e) => setTab(e.index === 0 ? 'treino' : 'estrategias')}
      />

      <div style={{ marginTop: '1.5rem' }}>
        {tab === 'estrategias' && <StrategyBank />}

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
