import { useMemo, useState } from 'react';
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
  onSubmit: (params: { criteriosMarcados: string[]; textoLivre?: string }) => Promise<void>;
  busy: boolean;
}

// Fallback fixo usado SOMENTE quando o trade não tem strategy vinculada -
// preserva o comportamento original dos 3 critérios pessoais de reversão.
const CRITERIOS_REVERSAO_FALLBACK: { chave: string; label: string }[] = [
  { chave: 'fechamentoContrario', label: 'O candle fechou no sentido contrário ao movimento anterior' },
  { chave: 'rompimentoReferencia', label: 'O preço rompeu o último fundo/topo de referência' },
  { chave: 'mediaMudouDirecao', label: 'A média rápida (EMA9) realmente mudou de direção' },
];

/** Transforma 'toque_ema21_sem_romper' em 'Toque ema21 sem romper' para exibição. */
function humanizeChave(chave: string): string {
  const semUnderscore = chave.replace(/_/g, ' ');
  return semUnderscore.charAt(0).toUpperCase() + semUnderscore.slice(1);
}

export function JustificationPanel({ trade, onSubmit, busy }: Props) {
  // Resolve a lista de critérios válidos para ESTE trade: se há strategy
  // vinculada com criterios.confirmacao, usa essa lista (dinâmico). Senão,
  // cai no fallback fixo de reversão.
  const criteriosDisponiveis = useMemo(() => {
    const confirmacao = trade.strategy?.criterios?.confirmacao;
    if (Array.isArray(confirmacao) && confirmacao.length > 0) {
      return confirmacao.map((chave: string) => ({ chave, label: humanizeChave(chave) }));
    }
    return CRITERIOS_REVERSAO_FALLBACK;
  }, [trade.strategy]);

  const [marcados, setMarcados] = useState<Record<string, boolean>>({});
  const [textoLivre, setTextoLivre] = useState('');
  const [showChart, setShowChart] = useState(false);

  const toggleCriterio = (chave: string, checked: boolean) => {
    setMarcados((prev) => ({ ...prev, [chave]: checked }));
  };

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
    // criteriosConfirmadosIA agora é um Record<string, boolean | null> dinâmico.
    // Para trades antigos (campos legados preenchidos, criteriosConfirmadosIA
    // pode já vir no formato novo também, já que o backend sempre grava as
    // mesmas chaves usadas na avaliação).
    const crit = justification.criteriosConfirmadosIA ?? {};
    const labelPorChave = Object.fromEntries(criteriosDisponiveis.map((c) => [c.chave, c.label]));

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
              {Object.entries(crit).map(([chave, value]) => (
                <span key={chave}>
                  {labelPorChave[chave] ?? humanizeChave(chave)} confirmado: {renderCriterio(value)}
                </span>
              ))}
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

        {trade.strategy ? (
          <p style={{ color: '#9ca3af', marginBottom: '1rem' }}>
            Estratégia vinculada: <strong>{trade.strategy.nome}</strong>. Marque quais critérios você
            considera que bateram antes de entrar:
          </p>
        ) : (
          <p style={{ color: '#9ca3af', marginBottom: '1rem' }}>
            Sem estratégia vinculada. Marque quais dos 3 critérios de reversão você considera que
            bateram antes de entrar:
          </p>
        )}

        {criteriosDisponiveis.map(({ chave, label }) => (
          <div className="criterio-checkbox-row" key={chave}>
            <Checkbox
              checked={!!marcados[chave]}
              onChange={(e) => toggleCriterio(chave, !!e.checked)}
            />
            <label>{label}</label>
          </div>
        ))}

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
          onClick={() => {
            const payload = {
              criteriosMarcados: Object.entries(marcados)
                .filter(([, v]) => v)
                .map(([k]) => k),
              textoLivre: textoLivre || undefined,
            };
            console.log('[DEBUG] payload enviado pro onSubmit:', JSON.stringify(payload, null, 2));
            onSubmit(payload);
          }}
        />

        {/* <Button
          label="Enviar para avaliação da IA"
          icon="pi pi-send"
          style={{ marginTop: '1rem' }}
          loading={busy}
          onClick={() =>
            onSubmit({
              criteriosMarcados: Object.entries(marcados)
                .filter(([, v]) => v)
                .map(([k]) => k),
              textoLivre: textoLivre || undefined,
            })
          }
        /> */}
      </Card>
      <TradeChartModal tradeId={showChart ? trade.id : null} onClose={() => setShowChart(false)} />
    </>
  );
}
