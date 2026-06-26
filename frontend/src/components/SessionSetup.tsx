import { useEffect, useState } from 'react';
import { Card } from 'primereact/card';
import { Button } from 'primereact/button';
import { Dropdown } from 'primereact/dropdown';
import { InputText } from 'primereact/inputtext';
import { InputNumber } from 'primereact/inputnumber';
import { SelectButton } from 'primereact/selectbutton';
import { Message } from 'primereact/message';
import { Divider } from 'primereact/divider';
import { fetchCandles, listAssets, createSession } from '../api';
import type { Asset, SessionView, Timeframe } from '../types';

type Mercado = 'B3' | 'CRIPTO';

interface Props {
  onSessionCreated: (view: SessionView) => void;
}

export function SessionSetup({ onSessionCreated }: Props) {
  const [assets, setAssets] = useState<Asset[]>([]);
  const [assetId, setAssetId] = useState<string | null>(null);
  const [timeframe, setTimeframe] = useState<Timeframe>('M1');

  const [newMercado, setNewMercado] = useState<Mercado>('B3');
  const [newTicker, setNewTicker] = useState('');
  const [newTimeframe, setNewTimeframe] = useState<Timeframe>('M1');
  const [newDays, setNewDays] = useState(5);

  const [loadingAssets, setLoadingAssets] = useState(false);
  const [fetchingCandles, setFetchingCandles] = useState(false);
  const [creatingSession, setCreatingSession] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  const loadAssets = async () => {
    setLoadingAssets(true);
    try {
      const data = await listAssets();
      setAssets(data);
    } catch (err: any) {
      setError('Erro ao carregar ativos. Verifique se o backend está rodando.');
    } finally {
      setLoadingAssets(false);
    }
  };

  useEffect(() => {
    loadAssets();
  }, []);

  const handleFetchCandles = async () => {
    setError(null);
    setInfo(null);
    if (!newTicker.trim()) {
      setError(
        newMercado === 'CRIPTO'
          ? 'Informe um ticker (ex: BTC, ETH).'
          : 'Informe um ticker (ex: PETR4, VALE3).',
      );
      return;
    }
    setFetchingCandles(true);
    try {
      const result = await fetchCandles(newTicker.trim(), newTimeframe, newDays, newMercado);
      setInfo(`${result.candlesGravados} candles baixados para ${result.asset.ticker}.`);
      setNewTicker('');
      await loadAssets();
    } catch (err: any) {
      setError(err?.response?.data?.message ?? 'Erro ao baixar candles.');
    } finally {
      setFetchingCandles(false);
    }
  };

  const handleCreateSession = async () => {
    setError(null);
    if (!assetId) {
      setError('Selecione um ativo.');
      return;
    }
    setCreatingSession(true);
    try {
      const view = await createSession(assetId, timeframe);
      onSessionCreated(view);
    } catch (err: any) {
      setError(err?.response?.data?.message ?? 'Erro ao criar sessão.');
    } finally {
      setCreatingSession(false);
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem', maxWidth: 640 }}>
      <Card title="1. Baixar histórico real (se ainda não tiver)">
        <p style={{ color: '#9ca3af' }}>
          Os candles vêm de dados reais via Yahoo Finance (ações B3 ou cripto). Não precisa
          adicionar ".SA" ou "-USD" no ticker - o backend resolve de acordo com o mercado
          selecionado.
        </p>
        <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap', alignItems: 'flex-end' }}>
          <div>
            <label style={{ display: 'block', marginBottom: '0.4rem', color: '#9ca3af' }}>
              Mercado
            </label>
            <SelectButton
              value={newMercado}
              onChange={(e) => e.value && setNewMercado(e.value)}
              options={[
                { label: 'B3', value: 'B3' },
                { label: 'Cripto', value: 'CRIPTO' },
              ]}
            />
          </div>
          <div>
            <label style={{ display: 'block', marginBottom: '0.4rem', color: '#9ca3af' }}>
              Ticker
            </label>
            <InputText
              value={newTicker}
              onChange={(e) => setNewTicker(e.target.value)}
              placeholder={newMercado === 'CRIPTO' ? 'BTC' : 'PETR4'}
            />
          </div>
          <div>
            <label style={{ display: 'block', marginBottom: '0.4rem', color: '#9ca3af' }}>
              Timeframe
            </label>
            <SelectButton
              value={newTimeframe}
              onChange={(e) => e.value && setNewTimeframe(e.value)}
              options={[
                { label: '1 min', value: 'M1' },
                { label: '2 min', value: 'M2' },
                { label: '5 min', value: 'M5' },
              ]}
            />
          </div>
          <div>
            <label style={{ display: 'block', marginBottom: '0.4rem', color: '#9ca3af' }}>
              Dias de histórico
            </label>
            <InputNumber value={newDays} onValueChange={(e) => setNewDays(e.value ?? 5)} min={1} max={30} />
          </div>
          <Button
            label="Baixar"
            icon="pi pi-download"
            onClick={handleFetchCandles}
            loading={fetchingCandles}
          />
        </div>
      </Card>

      <Card title="2. Escolher ativo e criar sessão de treino">
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          <div>
            <label style={{ display: 'block', marginBottom: '0.4rem', color: '#9ca3af' }}>
              Ativo já baixado
            </label>
            <Dropdown
              value={assetId}
              onChange={(e) => setAssetId(e.value)}
              options={assets.map((a) => ({
                label: `${a.ticker} (${a._count?.candles ?? 0} candles)`,
                value: a.id,
              }))}
              placeholder="Selecione um ativo"
              style={{ width: '100%' }}
              loading={loadingAssets}
            />
          </div>

          <div>
            <label style={{ display: 'block', marginBottom: '0.4rem', color: '#9ca3af' }}>
              Timeframe da sessão
            </label>
            <SelectButton
              value={timeframe}
              onChange={(e) => e.value && setTimeframe(e.value)}
              options={[
                { label: '1 min', value: 'M1' },
                { label: '2 min', value: 'M2' },
                { label: '5 min', value: 'M5' },
              ]}
            />
          </div>

          <Message
            severity="info"
            text="A sessão dura até onde você quiser - sem limite de candles. Encerre manualmente quando achar adequado, evitando entrar 'por ansiedade de acabar o tempo'."
          />

          <Divider />

          {error && <Message severity="error" text={error} />}
          {info && <Message severity="success" text={info} />}

          <Button
            label="Iniciar sessão de treino"
            icon="pi pi-play"
            onClick={handleCreateSession}
            loading={creatingSession}
          />
        </div>
      </Card>
    </div>
  );
}