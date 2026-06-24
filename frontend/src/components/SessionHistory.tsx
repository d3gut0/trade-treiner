import { useEffect, useState } from 'react';
import { Card } from 'primereact/card';
import { Tag } from 'primereact/tag';
import { Button } from 'primereact/button';
import { Accordion, AccordionTab } from 'primereact/accordion';
import { Divider } from 'primereact/divider';
import { api } from '../api';
import { TradeChartModal } from './TradeChartModal';

interface SessionWithTrades {
  id: string;
  createdAt: string;
  finishedAt: string | null;
  status: string;
  asset: { ticker: string };
  timeframe: string;
  trades: Array<{
    id: string;
    direction: string;
    entryPrice: number;
    exitPrice: number | null;
    stopGain: number;
    stopLoss: number;
    result: string;
    createdAt: string;
    strategy: { nome: string } | null;
    justification: {
      criterioFechamentoContrario: boolean;
      criterioRompimentoReferencia: boolean;
      criterioMediaMudouDirecao: boolean;
      textoLivre: string | null;
      avaliacaoIA: string | null;
      criteriosConfirmadosIA: {
        fechamentoContrario: boolean | null;
        rompimentoReferencia: boolean | null;
        mediaMudouDirecao: boolean | null;
      } | null;
      gestaoRespeitada: boolean | null;
      scoreIA: number | null;
    } | null;
  }>;
}

function renderCriterioHistorico(value: boolean | null | undefined) {
  if (value == null) {
    return <strong style={{ color: '#6b7280' }}>Não avaliado</strong>;
  }
  return (
    <strong className={value ? 'criterio-tag-ok' : 'criterio-tag-fail'}>
      {value ? 'Sim' : 'Não'}
    </strong>
  );
}

export function SessionHistory() {
  const [sessions, setSessions] = useState<SessionWithTrades[]>([]);
  const [loading, setLoading] = useState(true);
  const [chartTradeId, setChartTradeId] = useState<string | null>(null);

  useEffect(() => {
    api
      .get('/sessions')
      .then((r) => setSessions(r.data))
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return <p style={{ color: '#9ca3af' }}>Carregando histórico...</p>;
  }

  if (sessions.length === 0) {
    return (
      <Card>
        <p style={{ color: '#9ca3af', margin: 0 }}>
          Nenhuma sessão de treino registrada ainda. Volte na aba "Treino" e comece uma!
        </p>
      </Card>
    );
  }

  const fmtDate = (iso: string) =>
    new Date(iso).toLocaleString('pt-BR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
      <p style={{ color: '#9ca3af' }}>
        {sessions.length} sessão(ões) registrada(s). Clique em cada uma para ver os trades e
        vereditos da IA.
      </p>

      <Accordion multiple>
        {sessions.map((session, idx) => {
          const trades = session.trades;
          const gains = trades.filter((t) => t.result === 'GAIN').length;
          const losses = trades.filter((t) => t.result === 'LOSS').length;

          return (
            <AccordionTab
              key={session.id}
              header={
                <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center', flexWrap: 'wrap' }}>
                  <strong>Sessão #{sessions.length - idx}</strong>
                  <Tag value={session.asset.ticker} severity="info" />
                  <Tag value={session.timeframe} severity="secondary" />
                  <span style={{ color: '#9ca3af', fontSize: '0.85rem' }}>
                    {fmtDate(session.createdAt)}
                  </span>
                  <span style={{ color: '#9ca3af', fontSize: '0.85rem' }}>
                    {trades.length} trade(s) — {gains}G / {losses}L
                  </span>
                </div>
              }
            >
              {trades.length === 0 && (
                <p style={{ color: '#9ca3af', margin: 0 }}>
                  Nenhuma entrada foi executada nesta sessão.
                </p>
              )}

              {trades.map((trade, tIdx) => {
                const j = trade.justification;
                const crit = j?.criteriosConfirmadosIA;
                const resultColor =
                  trade.result === 'GAIN'
                    ? 'success'
                    : trade.result === 'LOSS'
                      ? 'danger'
                      : 'warning';

                return (
                  <div
                    key={trade.id}
                    style={{
                      padding: '1rem',
                      border: '1px solid #1f2430',
                      borderRadius: '6px',
                      marginBottom: '0.75rem',
                    }}
                  >
                    <div
                      style={{
                        display: 'flex',
                        gap: '0.75rem',
                        alignItems: 'center',
                        marginBottom: '0.75rem',
                        flexWrap: 'wrap',
                      }}
                    >
                      <strong>Trade #{tIdx + 1}</strong>
                      <Tag
                        value={trade.direction}
                        severity={trade.direction === 'COMPRA' ? 'success' : 'danger'}
                      />
                      <Tag value={trade.result} severity={resultColor as any} />
                      {trade.strategy && (
                        <Tag value={trade.strategy.nome} severity="info" />
                      )}
                      <span style={{ color: '#9ca3af', fontSize: '0.85rem' }}>
                        Entrada {trade.entryPrice.toFixed(2)}{' '}
                        {trade.exitPrice != null && `→ Saída ${trade.exitPrice.toFixed(2)}`}
                      </span>
                      <Button
                        label="Ver gráfico"
                        icon="pi pi-chart-line"
                        size="small"
                        text
                        onClick={() => setChartTradeId(trade.id)}
                      />
                    </div>

                    {j ? (
                      <>
                        {j.textoLivre && (
                          <div style={{ marginBottom: '0.75rem' }}>
                            <small style={{ color: '#9ca3af' }}>Sua justificativa:</small>
                            <p style={{ margin: '0.25rem 0 0', fontStyle: 'italic' }}>
                              "{j.textoLivre}"
                            </p>
                          </div>
                        )}

                        {j.avaliacaoIA ? (
                          <div className="veredito-box">
                            <strong style={{ color: '#14b8a6' }}>Veredito da IA:</strong>
                            <p style={{ margin: '0.5rem 0' }}>{j.avaliacaoIA}</p>

                            <Divider />

                            {crit && (
                              <div
                                style={{
                                  display: 'flex',
                                  flexDirection: 'column',
                                  gap: '0.3rem',
                                  fontSize: '0.9rem',
                                }}
                              >
                                <span>
                                  Fechamento contrário: {renderCriterioHistorico(crit.fechamentoContrario)}
                                </span>
                                <span>
                                  Rompimento de referência: {renderCriterioHistorico(crit.rompimentoReferencia)}
                                </span>
                                <span>
                                  Média mudou de direção: {renderCriterioHistorico(crit.mediaMudouDirecao)}
                                </span>
                                <span>
                                  Gestão respeitada: {renderCriterioHistorico(j.gestaoRespeitada)}
                                </span>
                                {j.scoreIA != null && (
                                  <span style={{ marginTop: '0.5rem' }}>
                                    Score: <strong>{j.scoreIA}/100</strong>
                                  </span>
                                )}
                              </div>
                            )}
                          </div>
                        ) : (
                          <p
                            style={{
                              color: '#f87171',
                              fontSize: '0.85rem',
                              margin: '0.5rem 0 0',
                            }}
                          >
                            ⚠ A IA ainda não foi consultada para este trade (ou a resposta
                            falhou).
                          </p>
                        )}
                      </>
                    ) : (
                      <p style={{ color: '#9ca3af', fontSize: '0.85rem', margin: 0 }}>
                        Trade encerrado mas sem justificativa enviada.
                      </p>
                    )}
                  </div>
                );
              })}
            </AccordionTab>
          );
        })}
      </Accordion>

      <TradeChartModal tradeId={chartTradeId} onClose={() => setChartTradeId(null)} />
    </div>
  );
}
