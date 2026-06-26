import { useEffect, useState } from 'react';
import { Card } from 'primereact/card';
import { Button } from 'primereact/button';
import { Tag } from 'primereact/tag';
import { Message } from 'primereact/message';
import { TradeChart } from './TradeChart';
import { ExecutionPanel } from './ExecutionPanel';
import { JustificationPanel } from './JustificationPanel';
import { CoachingTipPanel } from './CoachingTipPanel';
import {
  getSessionView,
  revealNextCandle,
  finishSession,
  openTrade,
  closeTradeManual,
  saveJustification,
  runAiEvaluation,
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
  const [busyEvaluating, setBusyEvaluating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // trades cuja avaliacao/justificativa o usuario optou por "deixar para
  // depois" - some o painel de justificativa pra ele poder seguir operando.
  // A avaliacao continua pendente e acessivel pela aba Histórico.
  const [dismissedTradeIds, setDismissedTradeIds] = useState<Set<string>>(new Set());

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

  // PASSO 1: salva a justificativa, sem chamar a IA ainda.
  const handleSaveJustification = async (
    tradeId: string,
    params: {
      criteriosMarcados: Record<string, boolean>;
      textoLivre?: string;
    },
  ) => {
    setBusy(true);
    try {
      await saveJustification({ tradeId, ...params });
      await refresh();
    } finally {
      setBusy(false);
    }
  };

  // PASSO 2 (opcional, na hora): dispara a avaliação por IA agora.
  const handleRunAiEvaluation = async (tradeId: string) => {
    setBusyEvaluating(true);
    try {
      await runAiEvaluation(tradeId);
      await refresh();
    } catch (err: any) {
      // erro já fica registrado no backend (avaliacaoStatus = ERRO) -
      // so precisamos atualizar a view pra refletir isso
      await refresh();
    } finally {
      setBusyEvaluating(false);
    }
  };

  const handleSkipForNow = (tradeId: string) => {
    setDismissedTradeIds((prev) => new Set(prev).add(tradeId));
  };

  const activeTrade = view.trades.find((t) => t.result === 'EM_ANDAMENTO');
  const pendingJustification = view.trades.find(
    (t) =>
      t.result !== 'EM_ANDAMENTO' &&
      t.justification?.avaliacaoStatus !== 'AVALIADO' &&
      !dismissedTradeIds.has(t.id),
  );
  const currentCandle = view.candles[view.candles.length - 1];

  // ultimo trade encerrado (qualquer status de justificativa) - usado para
  // oferecer a dica de coaching, que e independente do fluxo de justificativa
  const closedTrades = view.trades.filter((t) => t.result !== 'EM_ANDAMENTO');
  const lastClosedTrade = closedTrades[closedTrades.length - 1];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <Tag value={view.session.status} severity={view.session.status === 'FINALIZADA' ? 'success' : 'info'} />
          <span style={{ marginLeft: '0.75rem', color: '#9ca3af' }}>
            {view.candlesRevealed} candle(s) revelado(s) — sessão aberta até você encerrar
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
              onSaveJustification={(params) =>
                handleSaveJustification(pendingJustification.id, params)
              }
              onRunAiEvaluation={() => handleRunAiEvaluation(pendingJustification.id)}
              onSkipForNow={() => handleSkipForNow(pendingJustification.id)}
              busySaving={busy}
              busyEvaluating={busyEvaluating}
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

          {lastClosedTrade && (
            <CoachingTipPanel
              key={lastClosedTrade.id}
              tradeId={lastClosedTrade.id}
              initialTip={lastClosedTrade.coachingTip}
            />
          )}
        </div>
      </div>

      {view.session.status === 'FINALIZADA' && !activeTrade && !pendingJustification && (
        <Message
          severity="success"
          text="Sessão finalizada. Você pode voltar ao início para começar outra, ou revisar trades pendentes de avaliação na aba Histórico."
        />
      )}
    </div>
  );
}
