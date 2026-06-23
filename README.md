# Trade Trainer

Plataforma de treino de day trade: replay manual de candles **reais** (histórico via Yahoo
Finance), execução simulada com stop gain/loss travado, justificativa pós-trade e avaliação
objetiva por IA (Groq), além de um banco de estratégias com taxa de acerto.

## Stack

- **Backend:** NestJS + TypeScript + Prisma + PostgreSQL
- **Frontend:** React + Vite + TypeScript + PrimeReact + TradingView Lightweight Charts
- **Dados históricos:** `yahoo-finance2` (ações B3, ex: PETR4, VALE3 — sem precisar digitar `.SA`)
- **Avaliação por IA:** Groq (free tier), modelo `llama-3.3-70b-versatile`, recebendo só dados
  numéricos (OHLC + EMA9/EMA21/VWAP), nunca imagem — mais barato e mais confiável pra leitura de
  preço exato.

## Estrutura

```
trade-trainer/
├── docker-compose.yml      → Postgres + Adminer
├── backend/                → NestJS
│   └── src/
│       ├── candles/        → busca yahoo-finance2, calcula EMA9/EMA21/VWAP, persiste
│       ├── sessions/       → cria sessão, controla replay manual (candle a candle)
│       ├── trades/         → abre/fecha entradas simuladas, valida coerência de stop
│       ├── evaluation/     → monta payload numérico e chama Groq
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

Edite o `.env` e cole sua chave gratuita do Groq (pegue em https://console.groq.com/keys):

```
GROQ_API_KEY=gsk_...
```

Depois:

```bash
npm install
npx prisma generate
npx prisma migrate dev --name init
npm run seed          # cria 3 estratégias de exemplo no banco
npm run start:dev
```

O backend sobe em `http://localhost:3500`.

> **Nota:** no meu ambiente de geração de código eu não consegui rodar `prisma generate` /
> `prisma migrate` porque meu sandbox bloqueia o domínio `binaries.prisma.sh` (onde o Prisma
> baixa o engine binário). Isso é uma restrição só do meu ambiente — na sua máquina, sem esse
> bloqueio de rede, esses comandos devem rodar normalmente. Se por acaso der o mesmo erro
> (`Failed to fetch... 403 Forbidden` ou `ETIMEDOUT`), normalmente é proxy/firewall corporativo
> bloqueando `binaries.prisma.sh` — terá que liberar esse domínio ou usar uma rede sem essa
> restrição.

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
   > (a API limita o histórico intraday). Se vier vazio, tente reduzir os dias ou usar `M5` (não
   > implementado no MVP, mas o enum já suporta — é fácil adicionar).

2. **"2. Escolher ativo e criar sessão"**: escolha o ativo baixado, o timeframe e quantos
   candles a sessão vai ter (padrão 30). O backend sorteia um trecho aleatório do histórico —
   por isso você não sabe qual dia/hora é, simulando uma situação "às cegas" de mercado real.

3. **Tela de treino**: o gráfico mostra só o primeiro candle. Clique em **"Próximo candle"**
   pra revelar um a um, no seu ritmo (replay manual, como você pediu). Em qualquer momento você
   pode abrir uma entrada: direção, stop gain, stop loss. **Depois de confirmar, o stop não pode
   mais ser editado** — é a regra de gestão de risco travada que você definiu.

4. A cada novo candle revelado, o backend verifica automaticamente se o stop (gain ou loss) foi
   tocado. Se a sessão acabar com a entrada ainda aberta, ela fecha a mercado no preço de
   fechamento do último candle.

5. **Justificativa**: depois que a entrada fecha, aparece um formulário pedindo pra você marcar
   quais dos 3 critérios (fechamento contrário / rompimento de referência / EMA9 mudou de
   direção) você considera que bateram, + um texto livre. Isso é enviado pro Groq junto com os
   números reais dos candles — a IA devolve um veredito objetivo, dizendo se os critérios
   realmente bateram (segundo os números) e um score de 0 a 100.

6. **Aba Banco de Estratégias**: cadastre estratégias nomeadas (ex: "Cruzamento EMA9/21"). Ao
   abrir uma entrada você pode vincular a uma estratégia, e essa aba mostra taxa de acerto e
   score médio de IA por estratégia.

## Sobre custo de IA

Cada avaliação manda só JSON compacto (uns 15-20 candles de contexto + alguns números) — não
manda imagem nem texto longo. Isso fica bem dentro do free tier do Groq mesmo com uso pesado
diário. Se quiser comparar qualidade depois, é simples trocar a chamada do Groq por uma chamada
à API da Claude no mesmo formato (`evaluation.service.ts` é o único lugar que precisaria mudar).

## Possíveis evoluções (não incluídas neste MVP)

- Indicador MACD (fácil de adicionar em `common/indicators.ts`, mesma lógica de EMA)
- Replay automático com velocidade configurável (você pediu manual primeiro)
- Timeframe M5 no fluxo de criação de sessão (enum já suporta)
- Tela de histórico de sessões passadas com filtro por estratégia
- Importar histórico real de WIN (mini índice) ao invés de ações B3, caso ache uma fonte de
  dados — a arquitetura de `Asset`/`HistoricalCandle` já é genérica pra qualquer ativo.
