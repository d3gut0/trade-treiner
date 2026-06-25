import { useState } from 'react';
import { Card } from 'primereact/card';
import { Button } from 'primereact/button';
import { Tag } from 'primereact/tag';
import { Divider } from 'primereact/divider';
import { Message } from 'primereact/message';
import { getCoachingTip } from '../api';
import type { CoachingTip, ComparacaoTiming } from '../types';

interface Props {
  tradeId: string;
  initialTip?: CoachingTip | null;
  // chamado depois de gerar/regenerar com sucesso, para o componente pai
  // poder atualizar seu estado se quiser (ex: refletir no histórico)
  onTipUpdated?: (tip: CoachingTip) => void;
}

const COMPARACAO_LABEL: Record<ComparacaoTiming, string> = {
  CEDO_DEMAIS: 'Cedo demais',
  TARDE_DEMAIS: 'Tarde demais',
  NO_PONTO_CERTO: 'No ponto certo',
};

const COMPARACAO_SEVERITY: Record<ComparacaoTiming, 'warning' | 'danger' | 'success'> = {
  CEDO_DEMAIS: 'warning',
  TARDE_DEMAIS: 'danger',
  NO_PONTO_CERTO: 'success',
};

export function CoachingTipPanel({ tradeId, initialTip, onTipUpdated }: Props) {
  const [tip, setTip] = useState<CoachingTip | null | undefined>(initialTip);
  const [loading, setLoading] = useState(false);

  const handleRequestTip = async () => {
    setLoading(true);
    try {
      const result = await getCoachingTip(tradeId);
      setTip(result);
      onTipUpdated?.(result);
    } catch (err: any) {
      // erro já fica registrado no backend (status = ERRO) - mas como essa
      // chamada pode falhar antes de retornar nada, mostramos um tip local
      setTip({
        id: '',
        tradeId,
        status: 'ERRO',
        erro: err?.response?.data?.message ?? 'Falha ao consultar a IA.',
        conteudo: null,
        geradoEm: null,
      });
    } finally {
      setLoading(false);
    }
  };

  // ---------- Ainda não pedida nenhuma dica ----------
  if (!tip || tip.status === 'PENDENTE') {
    return (
      <Card className="coaching-tip-panel">
        <p style={{ color: '#9ca3af', marginTop: 0 }}>
          Peça uma análise da IA sobre o timing dessa entrada e saída — ela aponta se o
          momento usado foi cedo, tarde ou certo, comparando com candles específicos do
          gráfico.
        </p>
        <Button
          label="Pedir dica da IA"
          icon="pi pi-lightbulb"
          onClick={handleRequestTip}
          loading={loading}
        />
      </Card>
    );
  }

  // ---------- Erro na última tentativa ----------
  if (tip.status === 'ERRO') {
    return (
      <Card className="coaching-tip-panel">
        <Message
          severity="error"
          text={`Falha ao gerar a dica: ${tip.erro ?? 'erro desconhecido'}`}
          style={{ width: '100%', marginBottom: '1rem' }}
        />
        <Button
          label="Tentar de novo"
          icon="pi pi-refresh"
          onClick={handleRequestTip}
          loading={loading}
        />
      </Card>
    );
  }

  // ---------- Dica gerada com sucesso ----------
  const conteudo = tip.conteudo;
  if (!conteudo) return null;

  return (
    <Card title="Dica de timing (IA)" className="coaching-tip-panel">
      <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
        <div>
          <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', marginBottom: '0.5rem' }}>
            <strong>Entrada</strong>
            <Tag
              value={COMPARACAO_LABEL[conteudo.entradaIdeal.comparacaoComEntradaReal]}
              severity={COMPARACAO_SEVERITY[conteudo.entradaIdeal.comparacaoComEntradaReal]}
            />
            {conteudo.entradaIdeal.sequenceIndex != null && (
              <span style={{ color: '#9ca3af', fontSize: '0.85rem' }}>
                (candle #{conteudo.entradaIdeal.sequenceIndex})
              </span>
            )}
          </div>
          <p style={{ margin: 0, color: '#d1d5db' }}>{conteudo.entradaIdeal.justificativa}</p>
        </div>

        <Divider style={{ margin: 0 }} />

        <div>
          <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', marginBottom: '0.5rem' }}>
            <strong>Saída</strong>
            <Tag
              value={COMPARACAO_LABEL[conteudo.saidaIdeal.comparacaoComSaidaReal]}
              severity={COMPARACAO_SEVERITY[conteudo.saidaIdeal.comparacaoComSaidaReal]}
            />
            {conteudo.saidaIdeal.sequenceIndex != null && (
              <span style={{ color: '#9ca3af', fontSize: '0.85rem' }}>
                (candle #{conteudo.saidaIdeal.sequenceIndex})
              </span>
            )}
          </div>
          <p style={{ margin: 0, color: '#d1d5db' }}>{conteudo.saidaIdeal.justificativa}</p>
        </div>

        <div className="veredito-box">
          <strong style={{ color: '#14b8a6' }}>Para o próximo trade:</strong>
          <p style={{ margin: '0.5rem 0 0' }}>{conteudo.resumo}</p>
        </div>

        <Button
          label="Pedir nova análise"
          icon="pi pi-refresh"
          size="small"
          outlined
          severity="secondary"
          onClick={handleRequestTip}
          loading={loading}
        />
      </div>
    </Card>
  );
}
