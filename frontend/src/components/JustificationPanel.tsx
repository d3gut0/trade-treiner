import { useState } from 'react';
import { Card } from 'primereact/card';
import { Checkbox } from 'primereact/checkbox';
import { InputTextarea } from 'primereact/inputtextarea';
import { Button } from 'primereact/button';
import { Tag } from 'primereact/tag';
import { Divider } from 'primereact/divider';
import { ProgressBar } from 'primereact/progressbar';
import { TradeChartModal } from './TradeChartModal';
import type { SimulatedTrade } from '../types';

interface Props {
  trade: SimulatedTrade;
  onSubmit: (params: {
    criterioFechamentoContrario: boolean;
    criterioRompimentoReferencia: boolean;
    criterioMediaMudouDirecao: boolean;
    textoLivre?: string;
  }) => Promise<void>;
  busy: boolean;
}

export function JustificationPanel({ trade, onSubmit, busy }: Props) {
  const [fechamentoContrario, setFechamentoContrario] = useState(false);
  const [rompimentoReferencia, setRompimentoReferencia] = useState(false);
  const [mediaMudouDirecao, setMediaMudouDirecao] = useState(false);
  const [textoLivre, setTextoLivre] = useState('');
  const [showChart, setShowChart] = useState(false);

  const justification = trade.justification;
  const jaAvaliado = !!justification?.avaliacaoIA;

  const resultColor =
    trade.result === 'GAIN' ? 'success' : trade.result === 'LOSS' ? 'danger' : 'warning';

  const renderCriterio = (value: boolean | null | undefined) => {
    if (value == null) {
      return <strong style={{ color: '#6b7280' }}>Não avaliado</strong>;
    }
    return (
      <strong className={value ? 'criterio-tag-ok' : 'criterio-tag-fail'}>
        {value ? 'Sim' : 'Não'}
      </strong>
    );
  };

  if (jaAvaliado && justification) {
    const crit = justification.criteriosConfirmadosIA;
    return (
      <>
        <Card title="Avaliação da entrada" className="justification-panel">
          <div style={{ display: 'flex', gap: '0.75rem', marginBottom: '1rem', alignItems: 'center' }}>
            <Tag value={trade.result} severity={resultColor as any} />
            <span style={{ color: '#9ca3af' }}>
              Entrada {trade.entryPrice.toFixed(2)} → Saída {trade.exitPrice?.toFixed(2)}
            </span>
            <Button
              label="Ver gráfico"
              icon="pi pi-chart-line"
              size="small"
              text
              onClick={() => setShowChart(true)}
            />
          </div>

          <div className="veredito-box">
            <p style={{ margin: 0, marginBottom: '0.75rem' }}>{justification.avaliacaoIA}</p>

            <Divider />

            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
              <span>
                Fechamento contrário confirmado: {renderCriterio(crit?.fechamentoContrario)}
              </span>
              <span>
                Rompimento de referência confirmado: {renderCriterio(crit?.rompimentoReferencia)}
              </span>
              <span>
                Média mudou de direção confirmado: {renderCriterio(crit?.mediaMudouDirecao)}
              </span>
              <span>
                Gestão de risco respeitada:{' '}
                <strong
                  className={justification.gestaoRespeitada ? 'criterio-tag-ok' : 'criterio-tag-fail'}
                >
                  {justification.gestaoRespeitada ? 'Sim' : 'Não'}
                </strong>
              </span>
            </div>

            {justification.scoreIA != null && (
              <div style={{ marginTop: '1rem' }}>
                <span style={{ color: '#9ca3af', fontSize: '0.85rem' }}>
                  Score da decisão: {justification.scoreIA}/100
                </span>
                <ProgressBar value={justification.scoreIA} showValue={false} style={{ height: '6px' }} />
              </div>
            )}
          </div>
        </Card>
        <TradeChartModal tradeId={showChart ? trade.id : null} onClose={() => setShowChart(false)} />
      </>
    );
  }

  return (
    <>
      <Card title="Justifique a entrada" className="justification-panel">
        <div style={{ display: 'flex', gap: '0.75rem', marginBottom: '1rem', alignItems: 'center' }}>
          <Tag value={trade.result} severity={resultColor as any} />
          <span style={{ color: '#9ca3af' }}>
            Entrada {trade.entryPrice.toFixed(2)} → Saída {trade.exitPrice?.toFixed(2)}
          </span>
          <Button
            label="Ver gráfico"
            icon="pi pi-chart-line"
            size="small"
            text
            onClick={() => setShowChart(true)}
          />
        </div>

        <p style={{ color: '#9ca3af', marginBottom: '1rem' }}>
          Marque quais dos 3 critérios você considera que bateram antes de entrar:
        </p>

        <div className="criterio-checkbox-row">
          <Checkbox
            checked={fechamentoContrario}
            onChange={(e) => setFechamentoContrario(!!e.checked)}
          />
          <label>O candle fechou no sentido contrário ao movimento anterior</label>
        </div>
        <div className="criterio-checkbox-row">
          <Checkbox
            checked={rompimentoReferencia}
            onChange={(e) => setRompimentoReferencia(!!e.checked)}
          />
          <label>O preço rompeu o último fundo/topo de referência</label>
        </div>
        <div className="criterio-checkbox-row">
          <Checkbox checked={mediaMudouDirecao} onChange={(e) => setMediaMudouDirecao(!!e.checked)} />
          <label>A média rápida (EMA9) realmente mudou de direção</label>
        </div>

        <div style={{ marginTop: '1rem' }}>
          <label style={{ display: 'block', marginBottom: '0.4rem', color: '#9ca3af' }}>
            Por que você entrou? (texto livre)
          </label>
          <InputTextarea
            value={textoLivre}
            onChange={(e) => setTextoLivre(e.target.value)}
            rows={3}
            style={{ width: '100%' }}
          />
        </div>

        <Button
          label="Enviar para avaliação da IA"
          icon="pi pi-send"
          style={{ marginTop: '1rem' }}
          loading={busy}
          onClick={() =>
            onSubmit({
              criterioFechamentoContrario: fechamentoContrario,
              criterioRompimentoReferencia: rompimentoReferencia,
              criterioMediaMudouDirecao: mediaMudouDirecao,
              textoLivre: textoLivre || undefined,
            })
          }
        />
      </Card>
      <TradeChartModal tradeId={showChart ? trade.id : null} onClose={() => setShowChart(false)} />
    </>
  );
}
