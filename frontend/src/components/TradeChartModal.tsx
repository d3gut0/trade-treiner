import { useEffect, useState } from 'react';
import { Dialog } from 'primereact/dialog';
import { ProgressSpinner } from 'primereact/progressspinner';
import { Message } from 'primereact/message';
import { TradeChart } from './TradeChart';
import { getTradeChartContext } from '../api';
import type { Candle, SimulatedTrade } from '../types';

interface Props {
  tradeId: string | null;
  onClose: () => void;
}

export function TradeChartModal({ tradeId, onClose }: Props) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [candles, setCandles] = useState<Candle[]>([]);
  const [trade, setTrade] = useState<SimulatedTrade | null>(null);
  const [ticker, setTicker] = useState('');

  useEffect(() => {
    if (!tradeId) return;
    setLoading(true);
    setError(null);
    getTradeChartContext(tradeId)
      .then((data) => {
        setCandles(data.candles);
        setTrade(data.trade);
        setTicker(data.asset.ticker);
      })
      .catch((err) => {
        setError(err?.response?.data?.message ?? 'Erro ao carregar o gráfico.');
      })
      .finally(() => setLoading(false));
  }, [tradeId]);

  return (
    <Dialog
      header={trade ? `Gráfico do trade — ${ticker}` : 'Gráfico do trade'}
      visible={!!tradeId}
      onHide={onClose}
      style={{ width: '90vw', maxWidth: 900 }}
      modal
    >
      {loading && (
        <div style={{ display: 'flex', justifyContent: 'center', padding: '3rem' }}>
          <ProgressSpinner />
        </div>
      )}

      {error && <Message severity="error" text={error} />}

      {!loading && !error && trade && (
        <>
          <p style={{ color: '#9ca3af', marginTop: 0 }}>
            Mostrando {candles.length} candles ao redor da operação — 20 antes da entrada e
            10 depois da saída, com os mesmos dados (EMA9/EMA21/VWAP) de quando você operou.
          </p>
          <TradeChart candles={candles} trades={[trade]} />
        </>
      )}
    </Dialog>
  );
}
