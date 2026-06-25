# Trade Trainer

Plataforma de treino de day trade: replay manual de candles **reais** (histórico via Yahoo
Finance), execução simulada com stop gain/loss travado, justificativa pós-trade salva
imediatamente, e avaliação por IA **desacoplada** (você decide quando avaliar — na hora ou
revisitando o histórico depois), além de um banco de estratégias com taxa de acerto.

## Stack

- **Backend:** NestJS + TypeScript + Prisma + PostgreSQL
- **Frontend:** React + Vite + TypeScript + PrimeReact + TradingView Lightweight Charts
- **Dados históricos:** `yahoo-finance2` v3 (ações B3, ex: PETR4, VALE3 — sem precisar
  digitar `.SA`). Yahoo Finance **não tem** cobertura de futuros B3 (WIN, IND, DOL), então
  não é possível baixar o mini índice por aqui — só ações.
- **Avaliação por IA:** Google Gemini (`gemini-2.5-flash`, free tier: 15 req/min, 1500/dia),
  recebendo só dados numéricos (OHLC + EMA9/EMA21/VWAP), nunca imagem — mais barato e mais
  confiável pra leitura de preço exato.

> **Nota sobre o provedor de IA:** o projeto usava Groq inicialmente, mas a conexão
> apresentou instabilidade severa de rede (timeouts e `Connection error.` persistentes,
> mesmo após atualizar para modelos vigentes). Migrado para Google Gemini, que tem se
> mostrado estável. Se quiser voltar a comparar provedores, a troca fica isolada em
> `evaluation.service.ts` (método `callGemini`).

## Estrutura

```
trade-trainer/
├── docker-compose.yml      → Postgres + Adminer
├── backend/                → NestJS
│   └── src/
│       ├── candles/        → busca yahoo-finance2, calcula EMA9/EMA21/VWAP, persiste
│       ├── sessions/       → cria sessão, controla replay manual (candle a candle)
│       ├── trades/         → abre/fecha entradas simuladas, valida coerência de stop
│       ├── evaluation/     → fluxo desacoplado: salva justificativa, avalia por IA depois
│       └── strategies/     → CRUD do banco de estratégias + stats de taxa de acerto
└── frontend/                → React + Vite + PrimeReact
```

## Passo a passo para rodar

### 1. Banco de dados (Docker)

```bash
cd trade-trainer
docker-compose up -d
```

Isso sobe Postgres na porta `5440` e Adminer (interface web do banco) na porta `8090`
(acesse `http://localhost:8090`, sistema "PostgreSQL", servidor `postgres`, usuário `trader`,
senha `trader123`, base `trade_trainer`).

### 2. Backend

```bash
cd backend
cp .env.example .env
```

Edite o `.env` e cole sua chave gratuita do Gemini (pegue no Google AI Studio em
https://aistudio.google.com/app/apikey):

```
GEMINI_API_KEY=AIzaSy...
```

Depois:

```bash
npm install
npx prisma generate
npx prisma migrate dev --name add_avaliacao_status
npm run seed          # cria 3 estratégias de exemplo no banco
npm run start:dev
```

> **Se você já tinha o banco rodando com o schema antigo (Groq/avaliação imediata)**,
> precisa rodar essa migration nova — ela adiciona o enum `AvaliacaoIAStatus` e os campos
> `avaliacaoStatus`, `avaliacaoErro` e `avaliadoEm` na tabela `trade_justifications`. Não
> apaga dados existentes; trades já avaliados antes continuam com `avaliacaoIA` preenchido,
> mas vão precisar ser marcados/reavaliados para ganhar o `avaliacaoStatus = AVALIADO`
> retroativamente (o Prisma vai colocar o valor padrão `PENDENTE` neles automaticamente).

O backend sobe em `http://localhost:3500`. Teste rápido de saúde da integração:
`GET http://localhost:3500/evaluation/test-gemini`.

### 3. Frontend

```bash
cd frontend
npm install
npm run dev
```

Sobe em `http://localhost:5490`.

## Fluxo de uso

1. **Aba Treino → "1. Baixar histórico"**: digite um ticker (ex: `PETR4`), escolha timeframe
   (1 ou 2 min) e quantos dias de histórico baixar. O backend busca via Yahoo Finance e já
   calcula EMA9, EMA21 e VWAP de cada candle, salvando tudo no banco.

   > Atenção: dados intraday (1m/2m) do Yahoo Finance geralmente só cobrem os **últimos dias**
   > (a API limita o histórico intraday). Se vier vazio, tente reduzir os dias.
   > **WIN/mini índice não está disponível** nesta fonte — Yahoo não cobre futuros B3, em
   > nenhuma variação de ticker.

2. **"2. Escolher ativo e criar sessão"**: escolha o ativo baixado e o timeframe. O backend
   sorteia um ponto de partida aleatório no histórico e a sessão vai até o fim dos dados
   disponíveis — **sem prazo nem contador de candles**, você decide quando encerrar.

3. **Tela de treino**: o gráfico mostra só o primeiro candle. Clique em **"Próximo candle"**
   pra revelar um a um, no seu ritmo. Em qualquer momento você pode abrir uma entrada:
   direção, stop gain, stop loss. **Depois de confirmar, o stop não pode mais ser editado.**

4. A cada novo candle revelado, o backend verifica automaticamente se o stop foi tocado. Se
   a sessão acabar com a entrada ainda aberta, ela fecha a mercado no preço de fechamento do
   último candle.

5. **Justificativa (passo 1, sempre imediato)**: depois que a entrada fecha, você marca quais
   dos 3 critérios considera que bateram + um texto livre, e clica em **"Salvar
   justificativa"**. Isso só grava no banco — **não chama a IA ainda**.

6. **Avaliação por IA (passo 2, quando você quiser)**: depois de salvar, aparecem dois
   botões: **"Avaliar com IA agora"** (chama o Gemini na hora) ou **"Deixar para depois"**
   (você segue operando, e a avaliação fica pendente, acessível na aba Histórico a qualquer
   momento — inclusive dias depois).

7. **Aba Histórico**: cada trade mostra seu status — avaliado (com veredito completo),
   pendente (com botão "Avaliar com IA" disponível ali mesmo), ou com erro na última
   tentativa (com botão "Tentar avaliar de novo"). Você pode avaliar quantos trades quiser,
   na ordem que quiser, sem pressão de fazer isso no calor do momento.

8. **Aba Estratégias**: cadastrar/listar estratégias, ver taxa de acerto e score IA médio
   por estratégia.

## Por que separar "salvar justificativa" de "avaliar com IA"

- Evita perder o que você escreveu se a chamada à IA falhar (problema real que ocorreu com
  o Groq) — a justificativa sempre é salva primeiro, independente da IA.
- Permite revisar e comparar vários trades antes de gastar chamadas de IA neles — você pode
  decidir avaliar só os que achar mais relevantes, ou avaliar todos de uma vez depois.
- Reduz a pressão de avaliar no calor do momento, já que você pode voltar a operar
  imediatamente após salvar a justificativa, sem ficar bloqueado esperando resposta da IA.

## Sobre custo de IA

Cada avaliação manda só JSON compacto (uns 15-20 candles de contexto + alguns números) — não
manda imagem nem texto longo. Isso fica bem dentro do free tier do Gemini (`gemini-2.5-flash`,
15 requisições/minuto e 1500/dia) mesmo com uso pesado diário.

## Possíveis evoluções (não incluídas neste MVP)

- Indicador MACD (fácil de adicionar em `common/indicators.ts`, mesma lógica de EMA)
- Timeframe M5 no fluxo de criação de sessão (enum já suporta)
- Tela dedicada de "fila de avaliação" (lista plana de todos os trades pendentes entre
  sessões, sem precisar abrir cada accordion) — o endpoint `GET /evaluation/pending` já
  existe no backend pra isso
- Importar histórico real de WIN (mini índice) ao invés de ações B3, via import de CSV
  exportado do broker — a arquitetura de `Asset`/`HistoricalCandle` já é genérica pra
  qualquer ativo
