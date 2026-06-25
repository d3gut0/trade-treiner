import { useState } from 'react';
import { Card } from 'primereact/card';
import { Button } from 'primereact/button';
import { InputNumber } from 'primereact/inputnumber';
import { SelectButton } from 'primereact/selectbutton';
import { Dropdown } from 'primereact/dropdown';
import { Tag } from 'primereact/tag';
import { Message } from 'primereact/message';
import type { Candle, SimulatedTrade, Strategy, TradeDirection } from '../types';

interface Props {
  currentCandle: Candle | undefined;
  activeTrade: SimulatedTrade | undefined;
  strategies: Strategy[];
  onOpenTrade: (params: {
    direction: TradeDirection;
    entryPrice: number;
    stopGain: number;
    stopLoss: number;
    strategyId?: string;
  }) => Promise<void>;
  onCloseManual: (exitPrice: number) => Promise<void>;
  busy: boolean;
}

export function ExecutionPanel({
  currentCandle,
  activeTrade,
  strategies,
  onOpenTrade,
  onCloseManual,
  busy,
}: Props) {
  const [direction, setDirection] = useState<TradeDirection>('COMPRA');
  const [stopGain, setStopGain] = useState<number | null>(null);
  const [stopLoss, setStopLoss] = useState<number | null>(null);
  const [strategyId, setStrategyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const entryPrice = currentCandle?.close ?? 0;

  const handleOpen = async () => {
    setError(null);
    if (stopGain == null || stopLoss == null) {
      setError('Defina stop gain e stop loss antes de confirmar a entrada.');
      return;
    }
    try {
      await onOpenTrade({
        direction,
        entryPrice,
        stopGain,
        stopLoss,
        strategyId: strategyId ?? undefined,
      });
      setStopGain(null);
      setStopLoss(null);
    } catch (err: any) {
      setError(err?.response?.data?.message ?? 'Erro ao abrir entrada.');
    }
  };

  const handleCloseManual = async () => {
    if (!currentCandle) return;
    await onCloseManual(currentCandle.close);
  };

  // ---------- Trade em andamento: mostra estado travado ----------
  if (activeTrade && activeTrade.result === 'EM_ANDAMENTO') {
    return (
      <Card title="Entrada em andamento" className="execution-panel">
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
          <div>
            <Tag
              value={activeTrade.direction}
              severity={activeTrade.direction === 'COMPRA' ? 'success' : 'danger'}
            />
            <span style={{ marginLeft: '0.5rem', color: '#9ca3af' }}>
              Entrada @ {activeTrade.entryPrice.toFixed(2)}
            </span>
          </div>
          <div style={{ display: 'flex', gap: '1.5rem' }}>
            <span>
              Stop Gain: <strong style={{ color: '#34d399' }}>{activeTrade.stopGain.toFixed(2)}</strong>
            </span>
            <span>
              Stop Loss: <strong style={{ color: '#f87171' }}>{activeTrade.stopLoss.toFixed(2)}</strong>
            </span>
          </div>
          <Message
            severity="info"
            text="Stop travado - não pode ser alterado até a entrada fechar. Essa é a regra de gestão de risco."
          />
          <Button
            label="Fechar manualmente no preço atual"
            severity="secondary"
            outlined
            onClick={handleCloseManual}
            loading={busy}
          />
        </div>
      </Card>
    );
  }

  // ---------- Nenhuma trade aberta: formulario de nova entrada ----------
  return (
    <Card title="Nova entrada" className="execution-panel">
      <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
        <div>
          <label style={{ display: 'block', marginBottom: '0.4rem', color: '#9ca3af' }}>
            Direção
          </label>
          <SelectButton
            value={direction}
            onChange={(e) => e.value && setDirection(e.value)}
            options={[
              { label: 'Compra', value: 'COMPRA' },
              { label: 'Venda', value: 'VENDA' },
            ]}
          />
        </div>

        <div>
          <label style={{ display: 'block', marginBottom: '0.4rem', color: '#9ca3af' }}>
            Preço de entrada (fechamento do candle atual)
          </label>
          <InputNumber value={entryPrice} disabled mode="decimal" minFractionDigits={2} />
        </div>

        <div style={{ display: 'flex', gap: '1rem' }}>
          <div style={{ flex: 1 }}>
            <label style={{ display: 'block', marginBottom: '0.4rem', color: '#9ca3af' }}>
              Stop Gain
            </label>
            <InputNumber
              value={stopGain}
              onValueChange={(e) => setStopGain(e.value ?? null)}
              mode="decimal"
              minFractionDigits={2}
              placeholder="Preço de saída com lucro"
            />
          </div>
          <div style={{ flex: 1 }}>
            <label style={{ display: 'block', marginBottom: '0.4rem', color: '#9ca3af' }}>
              Stop Loss
            </label>
            <InputNumber
              value={stopLoss}
              onValueChange={(e) => setStopLoss(e.value ?? null)}
              mode="decimal"
              minFractionDigits={2}
              placeholder="Preço de saída com perda"
            />
          </div>
        </div>

        <div>
          <label style={{ display: 'block', marginBottom: '0.4rem', color: '#9ca3af' }}>
            Estratégia (opcional)
          </label>
          <Dropdown
            value={strategyId}
            onChange={(e) => setStrategyId(e.value)}
            options={strategies.map((s) => ({ label: s.nome, value: s.id }))}
            placeholder="Nenhuma estratégia vinculada"
            showClear
            style={{ width: '100%' }}
          />
        </div>

        {error && <Message severity="error" text={error} />}

        <Button
          label="Confirmar entrada (stop trava após isso)"
          icon="pi pi-lock"
          onClick={handleOpen}
          loading={busy}
          disabled={!currentCandle}
        />
      </div>
    </Card>
  );
}
