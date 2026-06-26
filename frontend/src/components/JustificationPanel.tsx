import { useEffect, useState } from 'react';
import { Card } from 'primereact/card';
import { Checkbox } from 'primereact/checkbox';
import { InputTextarea } from 'primereact/inputtextarea';
import { Button } from 'primereact/button';
import { Tag } from 'primereact/tag';
import { Divider } from 'primereact/divider';
import { ProgressBar } from 'primereact/progressbar';
import { Message } from 'primereact/message';
import { TradeChartModal } from './TradeChartModal';
import { getCriteriaForTrade } from '../api';
import type { CriterioDefinicao, SimulatedTrade } from '../types';

interface Props {
  trade: SimulatedTrade;
  // Salva a justificativa (criterios dinamicos + texto) SEM chamar a IA.
  onSaveJustification: (params: {
    criteriosMarcados: Record<string, boolean>;
    textoLivre?: string;
  }) => Promise<void>;
  // Dispara a avaliação por IA para um trade que já tem justificativa salva.
  onRunAiEvaluation: () => Promise<void>;
  // Permite seguir adiante sem avaliar agora (avaliação fica pendente,
  // disponível depois na aba Histórico).
  onSkipForNow: () => void;
  busySaving: boolean;
  busyEvaluating: boolean;
}

export function JustificationPanel({
  trade,
  onSaveJustification,
  onRunAiEvaluation,
  onSkipForNow,
  busySaving,
  busyEvaluating,
}: Props) {
  // criterios aplicaveis a ESTE trade, resolvidos a partir da estrategia
  // vinculada (ou o fallback generico) - buscado do backend ao montar.
  const [criterios, setCriterios] = useState<CriterioDefinicao[]>([]);
  const [loadingCriterios, setLoadingCriterios] = useState(true);
  const [marcados, setMarcados] = useState<Record<string, boolean>>({});
  const [textoLivre, setTextoLivre] = useState('');
  const [showChart, setShowChart] = useState(false);

  const justification = trade.justification;
  const jaAvaliado = justification?.avaliacaoStatus === 'AVALIADO';
  const jaJustificado = !!justification;

  useEffect(() => {
    // so precisa buscar a lista de criterios se ainda nao foi justificado -
    // se ja foi, os criterios relevantes vem prontos em justification.criteriosMarcados
    if (jaJustificado) {
      setLoadingCriterios(false);
      return;
    }
    setLoadingCriterios(true);
    getCriteriaForTrade(trade.id)
      .then((lista) => {
        setCriterios(lista);
        setMarcados(Object.fromEntries(lista.map((c) => [c.chave, false])));
      })
      .finally(() => setLoadingCriterios(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [trade.id, jaJustificado]);

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

  const headerRow = (
    <div style={{ display: 'flex', gap: '0.75rem', marginBottom: '1rem', alignItems: 'center' }}>
      <Tag value={trade.result} severity={resultColor as any} />
      <span style={{ color: '#9ca3af' }}>
        Entrada {trade.entryPrice.toFixed(2)} → Saída {trade.exitPrice?.toFixed(2)}
      </span>
      {trade.strategy && <Tag value={trade.strategy.nome} severity="info" />}
      <Button
        label="Ver gráfico"
        icon="pi pi-chart-line"
        size="small"
        text
        onClick={() => setShowChart(true)}
      />
    </div>
  );

  // ---------- ESTADO 1: já avaliado pela IA ----------
  if (jaAvaliado && justification) {
    const crit = justification.criteriosConfirmadosIA ?? {};
    // mostra os criterios que de fato existem na resposta da IA (chaves
    // dinamicas - nao sao mais fixas)
    const chavesAvaliadas = Object.keys(crit);

    return (
      <>
        <Card title="Avaliação da entrada" className="justification-panel">
          {headerRow}

          <div className="veredito-box">
            <p style={{ margin: 0, marginBottom: '0.75rem' }}>{justification.avaliacaoIA}</p>

            <Divider />

            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
              {chavesAvaliadas.map((chave) => (
                <span key={chave}>
                  {criterioLabelFallback(chave, criterios)}: {renderCriterio(crit[chave])}
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

  // ---------- ESTADO 2: justificativa salva, aguardando avaliação por IA ----------
  if (jaJustificado && justification) {
    return (
      <>
        <Card title="Justificativa salva" className="justification-panel">
          {headerRow}

          <Message
            severity={justification.avaliacaoStatus === 'ERRO' ? 'error' : 'info'}
            text={
              justification.avaliacaoStatus === 'ERRO'
                ? `Última tentativa de avaliação falhou: ${justification.avaliacaoErro ?? 'erro desconhecido'}`
                : 'Justificativa salva. Você pode avaliar com a IA agora ou deixar para revisar mais tarde na aba Histórico.'
            }
          />

          {justification.textoLivre && (
            <div style={{ marginTop: '1rem' }}>
              <small style={{ color: '#9ca3af' }}>Sua justificativa:</small>
              <p style={{ margin: '0.25rem 0 0', fontStyle: 'italic' }}>
                "{justification.textoLivre}"
              </p>
            </div>
          )}

          <div style={{ display: 'flex', gap: '0.75rem', marginTop: '1.25rem' }}>
            <Button
              label={justification.avaliacaoStatus === 'ERRO' ? 'Tentar avaliar de novo' : 'Avaliar com IA agora'}
              icon="pi pi-sparkles"
              onClick={onRunAiEvaluation}
              loading={busyEvaluating}
            />
            <Button
              label="Deixar para depois"
              icon="pi pi-clock"
              severity="secondary"
              outlined
              onClick={onSkipForNow}
              disabled={busyEvaluating}
            />
          </div>
        </Card>
        <TradeChartModal tradeId={showChart ? trade.id : null} onClose={() => setShowChart(false)} />
      </>
    );
  }

  // ---------- ESTADO 3: ainda não justificado - checkboxes dinamicos ----------
  return (
    <>
      <Card title="Justifique a entrada" className="justification-panel">
        {headerRow}

        {loadingCriterios ? (
          <p style={{ color: '#9ca3af' }}>Carregando critérios...</p>
        ) : (
          <>
            <p style={{ color: '#9ca3af', marginBottom: '1rem' }}>
              {trade.strategy
                ? `Marque quais critérios de "${trade.strategy.nome}" você considera que bateram antes de entrar:`
                : 'Marque quais dos critérios de confirmação você considera que bateram antes de entrar:'}
            </p>

            {criterios.map((c) => (
              <div className="criterio-checkbox-row" key={c.chave} title={c.descricao}>
                <Checkbox
                  checked={!!marcados[c.chave]}
                  onChange={(e) =>
                    setMarcados((prev) => ({ ...prev, [c.chave]: !!e.checked }))
                  }
                />
                <label>{c.label}</label>
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
              label="Salvar justificativa"
              icon="pi pi-save"
              style={{ marginTop: '1rem' }}
              loading={busySaving}
              onClick={() =>
                onSaveJustification({
                  criteriosMarcados: marcados,
                  textoLivre: textoLivre || undefined,
                })
              }
            />
          </>
        )}
      </Card>
      <TradeChartModal tradeId={showChart ? trade.id : null} onClose={() => setShowChart(false)} />
    </>
  );
}

// Resolve o label em portugues de uma chave de criterio, usando a lista
// de definicoes carregada (se disponivel) ou um fallback que so capitaliza
// a chave tecnica (caso a lista de definicoes nao esteja mais disponivel,
// por exemplo ao revisitar um trade antigo de uma estrategia ja editada).
function criterioLabelFallback(chave: string, definicoes: CriterioDefinicao[]): string {
  const found = definicoes.find((d) => d.chave === chave);
  if (found) return found.label;
  return chave.replace(/_/g, ' ');
}
