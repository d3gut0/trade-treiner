import { useEffect, useState } from 'react';
import { Card } from 'primereact/card';
import { Button } from 'primereact/button';
import { Tag } from 'primereact/tag';
import { Message } from 'primereact/message';
import { TradeChart } from './TradeChart';
import { ExecutionPanel } from './ExecutionPanel';
import { JustificationPanel } from './JustificationPanel';
import {
  getSessionView,
  revealNextCandle,
  finishSession,
  openTrade,
  closeTradeManual,
  evaluateTrade,
  listStrategies,
} from '../api';
import type { SessionView, Strategy, TradeDirection } from '../types';

interface Props {
  sessionId: string;
  initialView: SessionView;
  onExit: () => void;
}

export function TrainingScreen({ sessionId, initialView, onExit }: Props) {
  const [view, setView] = useState<SessionView>(initialView);
  const [strategies, setStrategies] = useState<Strategy[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    listStrategies().then(setStrategies).catch(() => {});
  }, []);

  const refresh = async () => {
    const data = await getSessionView(sessionId);
    setView(data);
  };

  const handleNextCandle = async () => {
    setError(null);
    setBusy(true);
    try {
      const data = await revealNextCandle(sessionId);
      setView(data);
    } catch (err: any) {
      setError(err?.response?.data?.message ?? 'Erro ao avançar candle.');
    } finally {
      setBusy(false);
    }
  };

  const handleFinish = async () => {
    setBusy(true);
    try {
      const data = await finishSession(sessionId);
      setView(data);
    } finally {
      setBusy(false);
    }
  };

  const handleOpenTrade = async (params: {
    direction: TradeDirection;
    entryPrice: number;
    stopGain: number;
    stopLoss: number;
    strategyId?: string;
  }) => {
    setBusy(true);
    try {
      await openTrade({ sessionId, ...params });
      await refresh();
    } finally {
      setBusy(false);
    }
  };

  const handleCloseManual = async (exitPrice: number) => {
    const activeTrade = view.trades.find((t) => t.result === 'EM_ANDAMENTO');
    if (!activeTrade) return;
    setBusy(true);
    try {
      await closeTradeManual(activeTrade.id, exitPrice);
      await refresh();
    } finally {
      setBusy(false);
    }
  };

  // Atualizado: agora recebe a lista dinamica de criterios marcados em vez
  // dos 3 booleanos fixos. O JustificationPanel ja resolve quais criterios
  // sao validos para o trade (via strategy vinculada ou fallback de reversao)
  // e manda so as chaves marcadas aqui.
  const handleEvaluate = async (params: { criteriosMarcados: string[]; textoLivre?: string }) => {
    const tradeToEvaluate = view.trades.find(
      (t) => t.result !== 'EM_ANDAMENTO' && !t.justification?.avaliacaoIA,
    );
    if (!tradeToEvaluate) return;
    setBusy(true);
    try {
      await evaluateTrade({ tradeId: tradeToEvaluate.id, ...params });
      await refresh();
    } finally {
      setBusy(false);
    }
  };

  const activeTrade = view.trades.find((t) => t.result === 'EM_ANDAMENTO');
  const pendingJustification = view.trades.find(
    (t) => t.result !== 'EM_ANDAMENTO' && !t.justification?.avaliacaoIA,
  );
  const currentCandle = view.candles[view.candles.length - 1];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <Tag value={view.session.status} severity={view.session.status === 'FINALIZADA' ? 'success' : 'info'} />
          <span style={{ marginLeft: '0.75rem', color: '#9ca3af' }}>
            {view.candlesRevealed} candle(s) revelado(s) — sessao aberta até você encerrar
          </span>
        </div>
        <Button label="Voltar ao início" icon="pi pi-arrow-left" outlined onClick={onExit} />
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: '1.5rem' }}>
        <Card>
          <TradeChart candles={view.candles} trades={view.trades} />
          <div style={{ display: 'flex', gap: '0.75rem', marginTop: '1rem' }}>
            <Button
              label="Próximo candle"
              icon="pi pi-step-forward"
              onClick={handleNextCandle}
              disabled={!view.podeAvancar || busy}
              loading={busy}
            />
            <Button
              label="Encerrar sessão agora"
              icon="pi pi-flag"
              severity="secondary"
              outlined
              onClick={handleFinish}
              disabled={view.session.status === 'FINALIZADA' || busy}
            />
          </div>
          {error && <Message severity="error" text={error} style={{ marginTop: '1rem' }} />}
        </Card>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          {pendingJustification ? (
            <JustificationPanel
              trade={pendingJustification}
              onSubmit={handleEvaluate}
              busy={busy}
            />
          ) : (
            <ExecutionPanel
              currentCandle={currentCandle}
              activeTrade={activeTrade}
              strategies={strategies}
              onOpenTrade={handleOpenTrade}
              onCloseManual={handleCloseManual}
              busy={busy}
            />
          )}
        </div>
      </div>

      {view.session.status === 'FINALIZADA' && !activeTrade && !pendingJustification && (
        <Message
          severity="success"
          text="Sessão finalizada. Você pode voltar ao início para começar outra."
        />
      )}
    </div>
  );
}
