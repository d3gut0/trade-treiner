# Trade Trainer — Contexto Completo do Projeto

> Documento de referência para retomar o projeto em conversas futuras.
> Cole no início de uma nova conversa com IA para recuperar todo o contexto.

---

## 1. Origem e propósito

Sou day trader iniciante em **WINQ26 (mini índice Ibovespa futuro)**, opero em
**gráfico de 5 minutos** via app **Toro Trader (mobile)**. Tenho VWAP diária configurada e
estou começando a usar EMA9/EMA21.

### Problema central que identifiquei na minha operação

Não erro a *direção* do mercado — erro o *timing de entrada*. Entro no meio ou no fim das
pernas de alta/baixa, não no começo, porque tento antecipar reversões sem esperar
confirmação técnica. Minha cabeça enxerga "vai virar" antes de confirmar de verdade, e só
percebo o erro quando a operação já fechou no negativo.

Erro complementar: **movo o stop loss/stop gain no meio da operação** tentando "ganhar mais"
ou "perder menos", quebrando a relação risco/retorno definida antes de entrar.

### Caso real analisado (19/06, 3 operações em WINQ26)

1. **Venda 170.875 → Stop 170.970, -95 pts.** Entrei vendido na ponta final de uma queda já
   rodada, sem confirmação de reversão — "peguei a doideira" de um movimento já em curso.
2. **Compra 171.160 → Gain 171.235, +75 pts.** Melhor das três — entrada dentro de um
   movimento real de alta. Erro foi na saída: stop gain curto, cortei o lucro no meio da
   força do movimento.
3. **Venda 171.315 → Stop 171.530, -215 pts.** Vendi contra uma tendência de alta forte,
   apostando em reversão sem nenhum gatilho técnico confirmado.

### Os 3 critérios de confirmação que defini para entrar em uma reversão

Só considero entrada de reversão se as 3 condições baterem:

1. **Fechamento contrário:** a vela fechou no sentido contrário ao movimento anterior (não
   é só pavio — é fechamento).
2. **Rompimento de referência:** o preço rompeu o último fundo/topo de referência.
3. **Média mudou de direção:** a média rápida (EMA9) já mudou de direção — não só
   desacelerou, realmente virou.

Se não bater os 3, é **sem confirmação** — ruído, não sinal.

### Regra de gestão de risco

Definir stop gain e stop loss **antes** de entrar e **não tocar mais neles** até a operação
fechar. Mover stop no meio da operação é erro de gestão (separado do erro de critério de
entrada).

---

## 2. O que é o Trade Trainer (esta aplicação)

Plataforma pessoal de **treino de entradas com replay manual de candles históricos reais**,
desenhada para corrigir os erros acima através de prática deliberada, com:

- Execução simulada onde o stop **fica travado depois de confirmado** (forçando a
  disciplina).
- Justificativa pós-trade onde marco quais dos 3 critérios bati + texto livre.
- Avaliação por IA (Groq) que recebe os **dados numéricos reais** dos candles (OHLC + EMA9 +
  EMA21 + VWAP) e devolve um veredito objetivo: se os critérios realmente bateram, score de
  0-100, e comentário.
- Banco de estratégias nomeadas para vincular às entradas e medir taxa de acerto por
  estratégia.
- Histórico completo de sessões com todos os trades e vereditos preservados.

---

## 3. Decisões de produto importantes (registrar para não voltar atrás)

### Sessão de tempo aberto, não cronometrada

Versão inicial limitava a 30 candles fixos por sessão. **Mudei para tempo aberto** porque
contador induz ansiedade de "preciso entrar antes de acabar" — exatamente o que treino de
disciplina deve evitar. O usuário avança candle a candle (manual) e encerra quando quiser.

### Replay manual, não automático

Botão "próximo candle" controlado pelo usuário. Replay automático foi descartado pra não
criar pressão de tempo artificial.

### Indicadores no MVP: EMA9, EMA21, VWAP

MACD ficou fora do MVP (fácil de adicionar depois, mesma estrutura de cálculo das EMAs).

### Avaliação por IA usa dados numéricos, não imagem

Mandar OHLC + indicadores como JSON é mais barato e mais confiável que pedir IA pra "ler"
um print de gráfico. Análise de imagem é ruim pra níveis de preço exatos.

### Custo de IA: Groq free tier (modelo `llama-3.3-70b-versatile`)

Payload é pequeno (uns 15 candles de contexto), o free tier do Groq cobra zero pra esse
volume. Trocar pra API da Claude no futuro é mudança de uma única função
(`evaluation.service.ts`).

### Fonte de candles: Yahoo Finance, ações B3 (não mini índice)

**Decisão importante:** Yahoo Finance **não tem WIN/mini índice** com OHLC intraday.
Tentamos confirmar e não rola — Yahoo não cobre futuros B3.

**Por que isso está ok:** o treino é de *disciplina e leitura técnica*, não de backtest de
P&L real. PETR4, VALE3, ITUB4 e similares treinam exatamente as mesmas habilidades.

**Plano futuro pra usar WIN real:** criar endpoint `POST /candles/import-csv` que aceita
CSV exportado do broker (Toro, Profit, MetaTrader). Estrutura de tabelas
(`Asset`/`HistoricalCandle`) já é genérica pra qualquer fonte de dados.

---

## 4. Stack técnica

### Backend
- **NestJS 10** + **TypeScript** (CommonJS, target ES2021)
- **Prisma 5** + **PostgreSQL 16** (via Docker)
- **yahoo-finance2 v3.15.x** (importante: usamos v3, não v2 — v2 tinha bug de `exports` map
  que causava "No exports main defined" em alguns setups de Node. v3 corrigiu e exporta
  como classe, requer `new YahooFinance()`)
- **groq-sdk** para chamadas à IA (Groq free tier)
- Pattern: módulos isolados por feature (`candles`, `sessions`, `trades`, `evaluation`,
  `strategies`), cada um com Controller + Service + DTO
- Padrão de injeção: DI nativa do Nest, sem tsyringe. `PrismaService` é global.
- Tratamento de dependência circular `sessions ↔ trades` via `forwardRef`.

### Frontend
- **React 18** + **Vite** + **TypeScript**
- **PrimeReact 10** (tema `lara-dark-teal`)
- **TradingView Lightweight Charts v4** para o gráfico
- **axios** para chamadas HTTP
- Sem state management externo (useState local — escopo simples)

### Infra
- `docker-compose.yml`: Postgres na porta `5440` + Adminer na porta `8090`
- Sem Docker pro backend/frontend (rodam direto via `npm`)

### Portas em uso
- Postgres: `5440`
- Adminer: `8090`
- Backend NestJS: `3500`
- Frontend Vite: `5490`

---

## 5. Modelo de dados (Prisma schema)

### Entidades principais

- **`Asset`** — ativo (ticker, nome). Único por ticker.
- **`HistoricalCandle`** — candle real baixado. OHLCV + EMA9/EMA21/VWAP pré-calculados +
  `sequenceIndex` (ordem dentro do lote). Unique: `(assetId, timeframe, timestamp)`.
- **`Strategy`** — estratégia nomeada. `criterios` é JSON livre.
- **`TrainingSession`** — sessão de treino. Tem `startSequenceIndex` (onde o replay começa
  no histórico), `endSequenceIndex` (limite máximo), `totalCandles`, `candlesRevealed`
  (quantos o usuário já avançou). Status: `EM_ANDAMENTO` ou `FINALIZADA`.
- **`SimulatedTrade`** — entrada simulada. Direction (`COMPRA`/`VENDA`), `entryPrice`,
  `stopGain`, `stopLoss`, `entrySequenceIndex`, opcional `exitSequenceIndex`/`exitPrice`,
  `result` (`GAIN`/`LOSS`/`ENCERRADO_TEMPO`/`ENCERRADO_MANUAL`/`EM_ANDAMENTO`),
  opcionalmente vincula `strategyId`.
- **`TradeJustification`** — 1:1 com trade. Os 3 critérios marcados pelo usuário (bools) +
  `textoLivre` + resposta da IA (`avaliacaoIA`, `criteriosConfirmadosIA` JSON,
  `gestaoRespeitada`, `scoreIA`).

### Enums

- `Timeframe`: `M1`, `M2`, `M5`
- `TradeDirection`: `COMPRA`, `VENDA`
- `TradeResult`: `GAIN`, `LOSS`, `ENCERRADO_TEMPO`, `ENCERRADO_MANUAL`, `EM_ANDAMENTO`
- `SessionStatus`: `EM_ANDAMENTO`, `FINALIZADA`

---

## 6. Endpoints do backend

### Candles
- `POST /candles/fetch` — baixa histórico via yahoo-finance2, calcula indicadores, persiste.
  Body: `{ ticker, timeframe, days }`.
- `GET /candles/assets` — lista ativos com contagem de candles.
- `GET /candles/count?assetId=&timeframe=` — total de candles disponíveis.

### Sessions
- `POST /sessions` — cria sessão (sorteia trecho aleatório do histórico). Body:
  `{ assetId, timeframe }`. Retorna `SessionView` (sessão + candles revelados + trades).
- `GET /sessions` — lista todas as sessões com trades e justificativas (alimenta o
  Histórico).
- `GET /sessions/:id` — view atualizada da sessão.
- `POST /sessions/:id/next-candle` — revela próximo candle. Verifica automaticamente se o
  stop de uma trade ativa foi tocado.
- `POST /sessions/:id/finish` — encerra manualmente.

### Trades
- `POST /trades` — abre entrada. Valida coerência do stop (compra: stopGain > entry >
  stopLoss; venda: invertido). Stop fica travado depois disso.
- `GET /trades/session/:sessionId` — lista trades de uma sessão.
- `POST /trades/:id/close` — fecha manualmente no preço atual.

### Evaluation
- `POST /evaluation` — recebe a justificativa do usuário, monta payload numérico (candles
  OHLC + indicadores ao redor da entrada), chama Groq, persiste resposta na
  `TradeJustification`.

### Strategies
- `POST /strategies` — cria estratégia
- `GET /strategies` — lista todas com `_count.trades`
- `GET /strategies/:id` — detalhe
- `GET /strategies/:id/stats` — total de trades, gains, losses, taxa de acerto, score IA
  médio
- `PATCH /strategies/:id` — atualizar
- `DELETE /strategies/:id` — remover

---

## 7. Estrutura de pastas

```
trade-trainer/
├── docker-compose.yml         (Postgres + Adminer)
├── README.md                  (setup completo)
├── backend/
│   ├── package.json
│   ├── tsconfig.json          (CJS, ES2021, strict, ignoreDeprecations "5.0", rootDir ./src)
│   ├── .env.example           (DATABASE_URL, PORT=3500, GROQ_API_KEY)
│   ├── prisma/
│   │   └── schema.prisma
│   └── src/
│       ├── main.ts
│       ├── app.module.ts
│       ├── seed.ts            (cria 3 estratégias de exemplo)
│       ├── common/
│       │   └── indicators.ts  (calculateEMA, calculateVWAP)
│       ├── prisma/            (PrismaService + PrismaModule global)
│       ├── candles/           (controller, service, module, dto)
│       ├── sessions/
│       ├── trades/
│       ├── evaluation/
│       └── strategies/
└── frontend/
    ├── package.json
    ├── vite.config.ts         (porta 5490)
    ├── tsconfig.json
    ├── index.html
    └── src/
        ├── main.tsx
        ├── App.tsx            (3 tabs: Treino, Histórico, Estratégias)
        ├── api.ts             (axios + funções por endpoint)
        ├── types.ts           (tipos espelhando entidades do backend)
        ├── vite-env.d.ts
        ├── index.css
        └── components/
            ├── SessionSetup.tsx       (baixar histórico + criar sessão)
            ├── TrainingScreen.tsx     (tela principal de treino)
            ├── TradeChart.tsx         (TradingView Lightweight Charts)
            ├── ExecutionPanel.tsx     (abrir trade com stop travado)
            ├── JustificationPanel.tsx (pós-trade, marcar critérios + texto)
            ├── SessionHistory.tsx     (accordion de sessões + trades + vereditos IA)
            └── StrategyBank.tsx       (CRUD + stats de estratégias)
```

---

## 8. Decisões técnicas peculiares (registrar pra não esquecer)

### `yahoo-finance2` precisa ser v3 e instanciado como classe

```ts
const YahooFinance = require('yahoo-finance2').default;
const yahooFinance = new YahooFinance();
```

Por que `require` em vez de `import`: v3 funciona com import normal, mas mantivemos
`require` por consistência com o código testado. O essencial é ser **v3** e **instanciar**
(v2 era singleton, v3 é classe — breaking change que pega).

### `tsconfig.json` do backend tem armadilhas

Funcionalidades essenciais:
- `module: "commonjs"`, `moduleResolution: "node"` (não mudar pra ESM/Bundler — quebra o
  Nest com ts-node-dev)
- `rootDir: "./src"` (precisa explícito senão o TS 5.9 reclama)
- `ignoreDeprecations: "5.0"` (no TS 5.9, valor é "5.0", NÃO "6.0" — "6.0" dá erro
  TS5103 "Invalid value")

### Dependência circular sessions ↔ trades

Resolvida com `forwardRef(() => OutroModule)` no `imports` dos módulos e
`@Inject(forwardRef(() => OutroService))` no construtor que injeta o serviço.

### Payload da IA é puramente numérico

`EvaluationService.buildNumericPayload` monta `{ direction, entryPrice, stopGain, stopLoss,
exitPrice, result, candles: [{ seq, o, h, l, c, ema9, ema21, vwap }] }`. Contexto de **12
candles antes da entrada** + candles até a saída. Sem imagem, sem texto especulativo.

### Prompt da IA é estrito em JSON

`response_format: { type: 'json_object' }` + system prompt define exatamente o schema da
resposta. Fallback local (texto vazio + score 0) se `GROQ_API_KEY` não estiver configurada.

---

## 9. Como rodar (passo a passo)

### 1. Banco
```bash
docker-compose up -d
```
Postgres em `localhost:5440`, Adminer em `http://localhost:8090`
(sistema PostgreSQL, server `postgres`, user `trader`, pwd `trader123`, db `trade_trainer`).

### 2. Backend
```bash
cd backend
cp .env.example .env
# editar .env: colar GROQ_API_KEY (https://console.groq.com/keys)
npm install
npx prisma generate
npx prisma migrate dev --name init
npm run seed
npm run start:dev   # http://localhost:3500
```

### 3. Frontend
```bash
cd frontend
npm install
npm run dev   # http://localhost:5490
```

---

## 10. Fluxo de uso (UX final)

1. **Aba "Treino" → "Baixar histórico"**: digita ticker (ex: PETR4), timeframe (1 ou 2 min),
   dias. Backend baixa via Yahoo Finance, calcula EMA9/EMA21/VWAP, salva.

2. **"Iniciar sessão de treino"**: sorteia trecho aleatório do histórico. **Não tem prazo
   nem contador** — vai até onde você quiser.

3. **Tela de treino**: gráfico mostra só o primeiro candle. Clica em "Próximo candle" no
   seu ritmo. EMA9/EMA21/VWAP aparecem como overlay.

4. **Abrir entrada**: direção + entry (preço de fechamento do candle atual, locked) +
   stopGain + stopLoss + estratégia opcional. **Stop trava depois de confirmar.**

5. A cada novo candle revelado, backend verifica se stop foi tocado. Se sim, fecha
   automaticamente como GAIN ou LOSS.

6. **Justificativa pós-trade**: 3 checkboxes (os critérios) + texto livre. Envia pra IA.

7. **Veredito da IA**: aparece no painel à direita, com comentário, score 0-100, e quais
   critérios realmente bateram (segundo os números, não o que o usuário marcou).

8. **Aba "Histórico"**: accordion com todas as sessões passadas, expandindo cada uma você
   vê os trades com vereditos preservados.

9. **Aba "Estratégias"**: cadastrar/listar estratégias, ver taxa de acerto e score IA médio
   por estratégia.

---

## 11. Roadmap / possíveis evoluções (não implementado ainda)

- **Import de CSV** para usar WIN real (broker → CSV → endpoint
  `POST /candles/import-csv` → mesma estrutura de tabelas)
- **MACD** como indicador adicional (estrutura igual à EMA, só somar duas EMAs)
- **Timeframe M5** já está no enum, falta expor no frontend
- Replay automático com velocidade configurável (foi descartado pra MVP mas pode voltar
  como opção)
- Filtro de histórico por estratégia/resultado/período
- Modo de revisão: olhar histórico do dia D+1 sem estar treinando (analisar)
- Comparativo de evolução: gráfico de score IA médio ao longo do tempo
- Exportar relatório de sessão em PDF

---

## 12. Erros já resolvidos (anti-padrões)

- ❌ Tentar usar `import yahooFinance from 'yahoo-finance2'` com v2.x → erro
  "No exports main defined". **Fix:** usar v3 + `new YahooFinance()`.
- ❌ Setar `moduleResolution: "Bundler"` no tsconfig pra "resolver" o erro acima → quebra
  resolução de imports relativos do Nest ("Cannot find module './app.module'").
  **Fix:** manter `moduleResolution: "node"` e resolver via versão da lib.
- ❌ `ignoreDeprecations: "6.0"` → erro TS5103 "Invalid value". **Fix:** usar `"5.0"`.
- ❌ Sessão com contador fixo de candles → induz ansiedade. **Fix:** sessão de tempo
  aberto.
- ❌ Tela de justificativa some depois de enviar pra IA e veredito não fica visível.
  **Fix:** aba "Histórico" preserva tudo.

---

## 13. Contexto pessoal (para tom de comunicação)

Sou **Augusto**, desenvolvedor full-stack brasileiro em Blumenau-SC. Trabalho com sistemas
internos de uma manufatura de injeção plástica (Grupo Zanotti), stack diário é
React/TypeScript + PrimeReact (front) + Node.js/TypeScript + Oracle + Sequelize (back).
Comunico em português brasileiro casual. Tenho hands-on, gosto de inventar features, catch
meus próprios bugs, e prefiro arquivo completo a diff quando for editar.

Outras coisas que mexo: day trade WINQ26 (atualmente o foco), crypto (multi-chain Ledger),
DIY de eletrônica/robótica, fabricação de cockpit de sim racing.

---

## 14. Como retomar esse projeto numa nova conversa

1. Cola este documento inteiro como primeira mensagem
2. Diz o que quer fazer (ex: "quero adicionar MACD", "quero importar CSV", "está dando
   erro X")
3. A IA tem todo o contexto pra ajudar sem precisar perguntar de novo decisões já tomadas

---

*Última atualização: documento gerado quando o MVP estava funcional, com avaliação por IA
ativa via Groq, e a aba Histórico recém-adicionada.*
