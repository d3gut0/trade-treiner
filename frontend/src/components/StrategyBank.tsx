import { useEffect, useState } from 'react';
import { Card } from 'primereact/card';
import { Button } from 'primereact/button';
import { InputText } from 'primereact/inputtext';
import { InputTextarea } from 'primereact/inputtextarea';
import { DataTable } from 'primereact/datatable';
import { Column } from 'primereact/column';
import { Tag } from 'primereact/tag';
import { listStrategies, createStrategy, getStrategyStats } from '../api';
import type { Strategy } from '../types';

export function StrategyBank() {
  const [strategies, setStrategies] = useState<Strategy[]>([]);
  const [stats, setStats] = useState<Record<string, any>>({});
  const [nome, setNome] = useState('');
  const [descricao, setDescricao] = useState('');
  const [creating, setCreating] = useState(false);

  const load = async () => {
    const data = await listStrategies();
    setStrategies(data);
    const statsEntries = await Promise.all(
      data.map(async (s) => [s.id, await getStrategyStats(s.id)] as const),
    );
    setStats(Object.fromEntries(statsEntries));

    // console.log('stats keys:', Object.keys(Object.fromEntries(statsEntries)));
    // console.log('strategy ids:', data.map((s) => s.id));
  };

  useEffect(() => {
    load();
  }, []);

  const handleCreate = async () => {
    if (!nome.trim()) return;
    setCreating(true);
    try {
      await createStrategy({ nome: nome.trim(), descricao: descricao || undefined });
      setNome('');
      setDescricao('');
      await load();
    } finally {
      setCreating(false);
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
      <Card title="Cadastrar nova estratégia">
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', maxWidth: 480 }}>
          <InputText value={nome} onChange={(e) => setNome(e.target.value)} placeholder="Nome da estratégia" />
          <InputTextarea
            value={descricao}
            onChange={(e) => setDescricao(e.target.value)}
            rows={2}
            placeholder="Descrição (opcional)"
          />
          <Button label="Cadastrar" icon="pi pi-plus" onClick={handleCreate} loading={creating} />
        </div>
      </Card>

      <Card title="Estratégias cadastradas">
        <DataTable value={strategies} stripedRows>
          <Column field="nome" header="Nome" />
          <Column field="descricao" header="Descrição" />
          <Column
            header="Trades"
            body={(row: Strategy) => stats[row.id]?.totalTrades ?? '-'}
          />
          <Column
            header="Taxa de acerto"
            body={(row: Strategy) => {
              const taxa = stats[row.id]?.taxaAcerto;
              // console.log('row.id:', JSON.stringify(row.id), 'stats obj:', JSON.stringify(stats[row.id]));
              if (taxa == null) return <Tag value="sem dados" severity="secondary" />;
              const severity = taxa >= 60 ? 'success' : taxa >= 40 ? 'warning' : 'danger';
              return <Tag value={`${taxa.toFixed(0)}%`} severity={severity} />;
            }}
          />
          <Column
            header="Score IA médio"
            body={(row: Strategy) => {
              const score = stats[row.id]?.mediaScoreIA;
              return score != null ? score.toFixed(0) : '-';
            }}
          />
        </DataTable>
      </Card>
    </div>
  );
}
