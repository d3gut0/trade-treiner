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

1. **Fechamento contrário:** a vela fechou no sentido contrário ao movimento anterior — é o
   **corpo** do candle (abertura→fechamento) que conta, não o pavio. Um pavio que sobe e
   volta a cair não vale; precisa de um candle "de força" que fecha além do candle anterior
   na nova direção.
2. **Rompimento de referência:** o preço rompeu o último fundo/topo de referência.
   Importante: um fundo de referência só existe depois de uma estrutura de **pivô +
   correção + novo teste** — não é simplesmente "o preço mais baixo que vejo na tela" nem o
   nível de uma média móvel. Sem esse "testa de novo e não rompe", é só queda contínua, sem
   referência formada.
3. **Média mudou de direção:** a média rápida (EMA9) já mudou de direção — não só
   desacelerou, realmente virou.

Se não bater os 3, é **sem confirmação** — ruído, não sinal.

**Importante:** esses 3 critérios só valem para entradas de **reversão**. Eles não são um
checklist universal pra qualquer entrada — uma entrada por cruzamento de médias (sinal de
continuação/tendência) usa outra lógica e não deve ser julgada pelos critérios de reversão
(isso gerou confusão na avaliação por IA e foi corrigido — ver seção 8).

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
- Justificativa pós-trade onde marco quais dos 3 critérios bati + texto livre — salva
  imediatamente, **sem depender da IA**.
- Avaliação por IA (Google Gemini) **desacoplada da justificativa**: posso avaliar na hora
  ou deixar para depois, revisitando o histórico quando quiser. A IA recebe os **dados
  numéricos reais** dos candles (OHLC + EMA9 + EMA21 + VWAP) e devolve um veredito objetivo:
  avalia **apenas os critérios que eu marquei** (e considera a estratégia vinculada), com
  score de 0-100 e comentário.
- Banco de estratégias nomeadas para vincular às entradas e medir taxa de acerto por
  estratégia.
- Histórico completo de sessões com todos os trades e vereditos preservados.
- **Revisualização de gráfico por trade**: reabre o gráfico exato (candles + indicadores) de
  qualquer operação passada, sem precisar de print — é renderizado a partir dos dados
  salvos no banco.

---

## 3. Decisões de produto importantes (registrar para não voltar atrás)

### Sessão de tempo aberto, não cronometrada

Versão inicial limitava a 30 candles fixos por sessão. **Mudei para tempo aberto** porque
contador induz ansiedade de "preciso entrar antes de acabar" — exatamente o que treino de
disciplina deve evitar. A sessão sorteia um ponto de partida aleatório no histórico e vai
até o fim dos dados disponíveis; o usuário avança candle a candle (manual) e encerra quando
quiser, sem prazo.

### Replay manual, não automático

Botão "próximo candle" controlado pelo usuário. Replay automático foi descartado pra não
criar pressão de tempo artificial.

### Indicadores no MVP: EMA9, EMA21, VWAP

MACD ficou fora do MVP (fácil de adicionar depois, mesma estrutura de cálculo das EMAs).

### Avaliação por IA usa dados numéricos, não imagem

Mandar OHLC + indicadores como JSON é mais barato e mais confiável que pedir IA pra "ler"
um print de gráfico. Análise de imagem é ruim pra níveis de preço exatos.

### Avaliação por IA é seletiva, não força os 3 critérios sempre

**Bug identificado e corrigido:** o prompt original sempre pedia avaliação dos 3 critérios
de reversão, mesmo quando a entrada era por outra lógica (ex: cruzamento de médias). Isso
fazia a IA "reprovar" entradas válidas por critérios que nem se aplicavam. Corrigido para:
avaliar **somente os critérios que o usuário marcou** como parte do seu raciocínio,
retornando `null` ("não avaliado") para os demais, e considerar a **estratégia vinculada**
ao trade como contexto adicional. Ver detalhes técnicos na seção 8.

### Custo de IA: Google Gemini free tier (modelo `gemini-2.5-flash`)

**Migração de provedor:** o projeto usava Groq inicialmente, mas a integração apresentou
instabilidade severa de rede (`Connection error.` persistente, mesmo após atualizar para
modelos vigentes do Groq como `llama3-70b-8192`). Diagnosticado como bloqueio
regional/instabilidade de rota, não erro de código (confirmado isolando o fallback local,
que funcionava normalmente). **Migrado para Google Gemini** (`gemini-2.5-flash`, free tier:
15 requisições/minuto, 1500/dia), usando o SDK `@google/genai` (v2.x — atenção: o pacote
saltou de versões 0.x/1.x direto pra 2.x, então sempre confirmar a versão real publicada
antes de fixar no `package.json`, em vez de assumir). Variável de ambiente mudou de
`GROQ_API_KEY` para `GEMINI_API_KEY`. Chave gratuita em
https://aistudio.google.com/app/apikey. Requer `@nestjs/config` com `ConfigModule.forRoot({
isGlobal: true })` no `app.module.ts`, e leitura via `ConfigService.get('GEMINI_API_KEY')` em
vez de `process.env` direto (evita problemas de ciclo de vida onde o service tentava ler a
chave antes do `.env` carregar).

Payload continua pequeno (uns 15 candles de contexto), o free tier do Gemini cobre isso de
sobra pra uso pessoal diário.

### Avaliação por IA é desacoplada da justificativa (fluxo em 2 passos)

**Mudança de arquitetura importante:** originalmente, salvar a justificativa e chamar a IA
eram a mesma operação (`POST /evaluation` fazia tudo de uma vez). Isso tinha um problema: se
a chamada à IA falhasse (como aconteceu com o Groq), a justificativa nem ficava salva — o
usuário perdia o que tinha escrito. Também forçava avaliar no calor do momento, sem opção de
adiar.

**Solução implementada — fluxo em 2 passos independentes:**
1. `POST /evaluation/justification` — salva a justificativa (critérios marcados + texto
   livre) imediatamente, **sem chamar a IA**. Trade fica com `avaliacaoStatus = PENDENTE`.
2. `POST /evaluation/:tradeId/run-ai-evaluation` — dispara a chamada ao Gemini para um trade
   que já tem justificativa salva. Pode ser chamado na hora (botão "Avaliar com IA agora" na
   tela de treino) ou depois, revisitando o histórico (botão "Avaliar com IA" em cada trade
   pendente na aba Histórico) — inclusive dias depois, sem perda de contexto, já que os
   dados necessários (candles, indicadores, justificativa) já estão todos persistidos.

Isso introduziu o enum `AvaliacaoIAStatus` (`PENDENTE` / `AVALIADO` / `ERRO`) e os campos
`avaliacaoStatus`, `avaliacaoErro`, `avaliadoEm` na `TradeJustification`. Se a chamada à IA
falhar, o status vira `ERRO` com a mensagem guardada em `avaliacaoErro`, mas a justificativa
em si nunca é perdida — o usuário pode tentar avaliar de novo quantas vezes quiser.

No frontend, `JustificationPanel.tsx` agora tem 3 estados visuais: (1) ainda não justificado
— formulário de checkboxes + texto; (2) justificado mas pendente de IA — botões "Avaliar com
IA agora" / "Deixar para depois"; (3) já avaliado — veredito completo. `TrainingScreen.tsx`
mantém um `Set<string>` local de trades "dismissed" (que o usuário escolheu avaliar depois),
pra liberar o painel de execução e permitir continuar operando sem ficar bloqueado esperando
avaliação. `SessionHistory.tsx` mostra, por sessão, quantos trades estão pendentes de
avaliação (tag de aviso no cabeçalho do accordion) e oferece o botão de avaliar diretamente
ali.

### Fonte de candles: Yahoo Finance, ações B3 (não mini índice)

**Decisão importante, confirmada e reconfirmada:** Yahoo Finance **não tem WIN/mini índice**
com OHLC intraday, em nenhuma variação de ticker (`WIN`, `WINQ26`, `WINFUT`, `^WIN` etc.) —
o Yahoo simplesmente não cobre contratos futuros da B3. Não é erro de digitação de ticker,
é limitação estrutural da fonte de dados.

**Por que isso está ok:** o treino é de *disciplina e leitura técnica*, não de backtest de
P&L real. PETR4, VALE3, ITUB4 e similares treinam exatamente as mesmas habilidades.

**Plano futuro pra usar WIN real:** criar endpoint `POST /candles/import-csv` que aceita
CSV exportado do broker (Toro, Profit, MetaTrader). Estrutura de tabelas
(`Asset`/`HistoricalCandle`) já é genérica pra qualquer fonte de dados — não implementado
ainda, depende do usuário confirmar uma fonte de exportação disponível.

### Revisualização de gráfico por trade (em vez de print)

Em vez de tirar print da tela na hora de avaliar, foi implementada uma forma de
**reabrir o gráfico de qualquer trade passado** a qualquer momento, renderizado a partir dos
dados reais salvos no banco (não uma imagem congelada). Vantagens sobre print: sempre
vinculado ao trade certo, pode reabrir quantas vezes quiser, e se novos indicadores forem
adicionados no futuro (ex: MACD), gráficos antigos passam a mostrá-los também.

---

## 4. Stack técnica

### Backend
- **NestJS 10** + **TypeScript** (CommonJS, target ES2021)
- **Prisma 5** + **PostgreSQL 16** (via Docker)
- **yahoo-finance2 v3.15.x** — **importante: precisa ser v3, não v2.** v2.13.2 tinha um
  mapa de `exports` incompleto no `package.json` (só `import`/`default`, sem `require`
  explícito), causando `"No exports main defined"` em alguns ambientes Node (reproduzido
  no Windows do usuário). v3 corrigiu isso, mas trouxe breaking change: o default export
  agora é a **classe** `YahooFinance`, precisa instanciar com `new YahooFinance()` (na v2
  era um singleton já pronto pra uso).
- **@google/genai v2.x** (Google Gemini) para chamadas à IA — substituiu o `groq-sdk` por
  instabilidade de rede persistente com a Groq (ver seção 8 para detalhes da migração)
- **@nestjs/config** com `ConfigModule.forRoot({ isGlobal: true })` — necessário pro
  `ConfigService` injetar `GEMINI_API_KEY` corretamente em qualquer service
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
  no histórico, sorteado aleatoriamente), `endSequenceIndex` (vai até o fim do histórico
  disponível — sessão de tempo aberto), `totalCandles`, `candlesRevealed` (quantos o usuário
  já avançou manualmente). Status: `EM_ANDAMENTO` ou `FINALIZADA`.
- **`SimulatedTrade`** — entrada simulada. Direction (`COMPRA`/`VENDA`), `entryPrice`,
  `stopGain`, `stopLoss` (travados após criação — não há endpoint de update neles),
  `entrySequenceIndex`, opcional `exitSequenceIndex`/`exitPrice`,
  `result` (`GAIN`/`LOSS`/`ENCERRADO_TEMPO`/`ENCERRADO_MANUAL`/`EM_ANDAMENTO`),
  opcionalmente vincula `strategyId`.
- **`TradeJustification`** — 1:1 com trade. Os 3 critérios marcados pelo usuário (bools) +
  `textoLivre`, salvos imediatamente ao fechar o trade. `avaliacaoStatus`
  (`PENDENTE`/`AVALIADO`/`ERRO`) controla o ciclo de avaliação por IA, que é **desacoplado**
  — pode ser disparado depois, em outro momento. `avaliacaoErro` guarda a mensagem se a
  última tentativa falhou. Resposta da IA quando avaliado: `avaliacaoIA` texto,
  `criteriosConfirmadosIA` JSON com **cada campo podendo ser `boolean` ou `null`** — `null`
  significa "usuário não alegou esse critério, não avaliado", `gestaoRespeitada`, `scoreIA`,
  `avaliadoEm` (timestamp da última avaliação com sucesso).

### Enums

- `Timeframe`: `M1`, `M2`, `M5`
- `TradeDirection`: `COMPRA`, `VENDA`
- `TradeResult`: `GAIN`, `LOSS`, `ENCERRADO_TEMPO`, `ENCERRADO_MANUAL`, `EM_ANDAMENTO`
- `SessionStatus`: `EM_ANDAMENTO`, `FINALIZADA`
- `AvaliacaoIAStatus`: `PENDENTE`, `AVALIADO`, `ERRO`

---

## 6. Endpoints do backend

### Candles
- `POST /candles/fetch` — baixa histórico via yahoo-finance2, calcula indicadores, persiste.
  Body: `{ ticker, timeframe, days }`. Ticker é só ações B3 (Yahoo não tem WIN/futuros).
- `GET /candles/assets` — lista ativos com contagem de candles.
- `GET /candles/count?assetId=&timeframe=` — total de candles disponíveis.

### Sessions
- `POST /sessions` — cria sessão (sorteia trecho aleatório do histórico, vai até o fim dos
  dados disponíveis). Body: `{ assetId, timeframe }` — **não recebe mais `totalCandles`**,
  sessão é de tempo aberto. Retorna `SessionView` (sessão + candles revelados + trades).
- `GET /sessions` — lista todas as sessões com trades e justificativas (alimenta o
  Histórico).
- `GET /sessions/:id` — view atualizada da sessão.
- `POST /sessions/:id/next-candle` — revela próximo candle. Verifica automaticamente se o
  stop de uma trade ativa foi tocado; fecha a mercado se acabar o histórico com trade aberta.
- `POST /sessions/:id/finish` — encerra manualmente.

### Trades
- `POST /trades` — abre entrada. Valida coerência do stop (compra: stopGain > entry >
  stopLoss; venda: invertido). Stop fica travado depois disso.
- `GET /trades/session/:sessionId` — lista trades de uma sessão.
- `GET /trades/:id/chart-context` — **(novo)** retorna candles ao redor do trade (20 antes
  da entrada, 10 depois da saída, ou limites da sessão) + dados do asset, pra
  re-renderizar o gráfico exatamente como estava na hora da decisão.
- `POST /trades/:id/close` — fecha manualmente no preço atual.

### Evaluation (fluxo desacoplado em 2 passos + critérios dinâmicos)
- `GET /evaluation/criteria/:tradeId` — resolve e devolve a lista de critérios aplicáveis a
  um trade específico, de acordo com a estratégia vinculada (ou o fallback genérico de 3
  critérios de reversão, se não houver estratégia). Chamado pelo frontend ANTES de montar o
  formulário de justificativa.
- `POST /evaluation/justification` — **(passo 1)** salva a justificativa do usuário
  (`criteriosMarcados`: JSON dinâmico `{ [chave]: boolean }` + texto livre) **sem chamar a
  IA**. Trade fica com `avaliacaoStatus = PENDENTE`.
- `POST /evaluation/:tradeId/run-ai-evaluation` — **(passo 2)** busca a justificativa já
  salva, resolve os critérios aplicáveis à estratégia do trade, monta payload numérico
  (candles OHLC + indicadores ao redor da entrada + estratégia vinculada), chama o Gemini
  avaliando **somente os critérios marcados pelo usuário** (usando as chaves técnicas
  dinâmicas), atualiza a `TradeJustification` com o veredito. Pode ser chamado a qualquer
  momento depois do passo 1 — na hora ou revisitando o histórico depois.
- `GET /evaluation/pending` — lista justificativas com `avaliacaoStatus` `PENDENTE` ou
  `ERRO`, útil pra uma fila de avaliação.
- `POST /evaluation/:tradeId/coaching-tip` — gera (ou regenera) uma dica de coaching sobre
  timing de entrada/saída para um trade específico, independente do fluxo de justificativa.
  Ver seção 8 para os detalhes do prompt.
- `GET /evaluation/test-gemini` — health check da integração com o Gemini, sem tocar no
  banco.

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
├── CONTEXTO.md                (este documento)
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
│       │   ├── indicators.ts        (calculateEMA, calculateVWAP, calculateIFR2)
│       │   └── criteria-catalog.ts  (catálogo central de critérios + resolução dinâmica)
│       ├── prisma/            (PrismaService + PrismaModule global)
│       ├── candles/           (controller, service, module, dto)
│       ├── sessions/          (com forwardRef pra trades)
│       ├── trades/            (com forwardRef pra sessions; chart-context endpoint)
│       ├── evaluation/        (fluxo desacoplado: saveJustification + runAiEvaluation, Gemini)
│       └── strategies/
└── frontend/
    ├── package.json
    ├── vite.config.ts         (porta 5490)
    ├── tsconfig.json
    ├── index.html
    └── src/
        ├── main.tsx
        ├── App.tsx            (3 tabs: Treino, Histórico, Estratégias)
        ├── api.ts             (axios + funções por endpoint, incl. getTradeChartContext)
        ├── types.ts           (tipos espelhando entidades do backend)
        ├── vite-env.d.ts
        ├── index.css
        └── components/
            ├── SessionSetup.tsx       (baixar histórico + criar sessão, sem campo de qtd candles)
            ├── TrainingScreen.tsx     (tela principal de treino, sem contador/progress bar)
            ├── TradeChart.tsx         (TradingView Lightweight Charts, reaproveitado no modal)
            ├── TradeChartModal.tsx    (modal de revisualização de gráfico por trade)
            ├── ExecutionPanel.tsx     (abrir trade com stop travado)
            ├── JustificationPanel.tsx (pós-trade, marcar critérios + texto + botão "ver gráfico")
            ├── SessionHistory.tsx     (accordion de sessões + trades + vereditos + botão "ver gráfico")
            └── StrategyBank.tsx       (CRUD + stats de estratégias)
```

---

## 8. Decisões técnicas peculiares (registrar pra não esquecer)

### `yahoo-finance2` precisa ser v3 e instanciado como classe

```ts
const YahooFinance = require('yahoo-finance2').default;
const yahooFinance = new YahooFinance();
```

`package.json` precisa fixar `"yahoo-finance2": "^3.15.3"` (não `^2.13.2`). A API do
`.chart()` em si não mudou entre v2 e v3 (mesmo formato de retorno `{ quotes: [...] }`,
mesmos parâmetros `period1`/`period2`/`interval`) — só a forma de obter a instância mudou.

### `tsconfig.json` do backend tem armadilhas

Configuração testada e funcionando:
- `module: "commonjs"`, `moduleResolution: "node"` — **não mudar pra "ES2022"/"Bundler"**
  tentando "resolver" problemas de import de libs. Isso quebra a resolução de imports
  relativos do próprio Nest (`Cannot find module './app.module'`), porque vira ESM nativo
  no Node, que exige extensão de arquivo explícita nos imports.
- `rootDir: "./src"` (precisa explícito senão o TS 5.9+ reclama)
- `ignoreDeprecations: "5.0"` (no TS 5.9, o valor aceito é `"5.0"`, **não** `"6.0"` — `"6.0"`
  dá erro TS5103 "Invalid value for '--ignoreDeprecations'")

### Dependência circular sessions ↔ trades

Resolvida com `forwardRef(() => OutroModule)` no `imports` dos módulos e
`@Inject(forwardRef(() => OutroService))` no construtor que injeta o serviço. Necessário
porque `SessionsService.revealNext` precisa checar stop de trades, e `TradesService`
precisa ler dados da sessão.

### Payload da IA é puramente numérico + contexto de estratégia

`EvaluationService.buildNumericPayload` monta um objeto com direction, entryPrice,
stopGain, stopLoss, exitPrice, result, estrategiaVinculada e o array de candles com
seq/o/h/l/c/ema9/ema21/vwap. Contexto de **12 candles antes da entrada** até a saída (usado
na avaliação). Para revisualização visual (`chart-context` endpoint), a janela é maior:
**20 antes, 10 depois**. Sem imagem, sem texto especulativo, em ambos os casos.

### Prompt da IA avalia seletivamente, não força os 3 critérios

Esse foi um bug real identificado em uso: o prompt antigo sempre pedia os 3 critérios
preenchidos no JSON de resposta, então a IA julgava todos mesmo quando a entrada não era
de reversão (ex: entrada por cruzamento de EMA9/21, que é lógica de continuação).

**Correção aplicada (versão inicial, depois evoluída para totalmente dinâmica — ver próxima
subseção):**
- O backend monta uma lista com só os critérios que o usuário marcou como `true`, e manda
  essa lista explicitamente no prompt.
- O system prompt instrui: avaliar **somente** os critérios dessa lista; para os demais,
  retornar `null` em vez de `true`/`false`. Se a estratégia vinculada for claramente
  não-reversão, não penalizar por "critérios de reversão não confirmados".
- O parsing da resposta preserva `null` em vez de forçar conversão booleana (que
  converteria `null` incorretamente em `false`).
- No frontend, os componentes de exibição têm uma função helper que mostra
  **"Não avaliado"** em cinza quando o valor é `null`, em vez de mostrar "Não" (que seria
  enganoso — pareceria reprovação de algo que nem foi alegado).

### Critérios de confirmação totalmente dinâmicos por estratégia

**Evolução importante:** os 3 critérios (fechamento contrário, rompimento de referência,
EMA9 mudou de direção) eram **fixos no código** — 3 campos boolean hardcoded no schema, 3
checkboxes hardcoded no frontend, 3 chaves hardcoded no prompt. Isso forçava qualquer
estratégia a ser avaliada pela régua de reversão, mesmo quando a lógica era outra (cruzamento
de médias, pullback de VWAP), o que já tinha sido parcialmente mitigado (seção acima) mas
continuava estruturalmente errado: a tela sempre mostrava os mesmos 3 checkboxes,
independente da estratégia vinculada ao trade.

**Solução implementada — catálogo central + resolução dinâmica:**

- **`backend/src/common/criteria-catalog.ts`** — registro central de critérios possíveis.
  Cada entrada tem `chave` (técnica, snake_case), `label` (texto exibido no checkbox) e
  `descricao` (usada no prompt da IA para explicar o critério). Adicionar um critério novo
  é só adicionar uma entrada aqui — não precisa tocar em mais nenhum lugar do código.
  Critérios hoje no catálogo: `fechamento_contrario`, `rompimento_referencia`,
  `media_mudou_direcao` (os 3 originais de reversão), `cruzamento_confirmado` (cruzamento
  EMA9/21 + fechamento de confirmação, numa chave só), `toque_vwap_com_rejeicao` (toque na
  VWAP + rejeição a favor da tendência).
- **`Strategy.criterios.confirmacao`** (já existia no schema, JSON livre) passou a ser a
  fonte da verdade de quais critérios uma estratégia usa — é um array de chaves técnicas que
  devem existir no catálogo. Ex: `{ confirmacao: ['cruzamento_confirmado'] }`.
- **`resolveCriteriaForStrategy(strategyCriterios)`** — função que resolve as chaves de
  `confirmacao` para as definições completas (label + descrição) do catálogo. Chaves
  desconhecidas são ignoradas silenciosamente (não quebram se uma estratégia antiga
  referenciar uma chave removida). Se a lista resultante ficar vazia ou a estratégia não
  tiver `confirmacao` definido, cai no fallback genérico via `getDefaultCriteria()`.
- **`getDefaultCriteria()`** — fallback usado quando o trade NÃO tem estratégia vinculada:
  os 3 critérios completos de reversão (comportamento histórico do produto, preservado como
  default).
- **`GET /evaluation/criteria/:tradeId`** (endpoint novo) — resolve e devolve a lista de
  critérios aplicáveis a um trade específico, considerando a estratégia vinculada. Chamado
  pelo frontend ANTES de mostrar o formulário de justificativa, para montar os checkboxes
  dinamicamente.
- **`TradeJustification.criteriosMarcados`** — trocou de 3 campos boolean fixos
  (`criterioFechamentoContrario` etc., REMOVIDOS) para um único campo `Json` no formato
  `{ [chaveCriterio]: boolean }`. Mesma mudança em `criteriosConfirmadosIA` (resposta da
  IA), que também é `Json` dinâmico em vez de 3 campos fixos.
- **Prompt da IA (`callGemini`)** — agora recebe `criteriaDefinitions` (resolvido a partir
  da estratégia do trade) e monta a descrição de cada critério aplicável dinamicamente no
  system prompt, em vez de descrever sempre os mesmos 3 critérios de reversão. A IA é
  instruída a usar as mesmas chaves técnicas exatas (não traduzir, não inventar chaves) na
  resposta.
- **Frontend `JustificationPanel.tsx`** — busca os critérios via
  `GET /evaluation/criteria/:tradeId` ao montar (só quando o trade ainda não foi
  justificado), e renderiza um checkbox por critério retornado, com o label do catálogo.
  Quando já avaliado, itera dinamicamente sobre as chaves presentes em
  `criteriosConfirmadosIA` (não mais 3 chaves fixas).
- **Frontend `SessionHistory.tsx`** — mesma lógica de iteração dinâmica sobre
  `criteriosConfirmadosIA`; como o catálogo de definições não está carregado no histórico,
  usa uma função simples (`chaveParaLabel`) que converte a chave técnica snake_case em texto
  capitalizado legível, como fallback visual.

**Migration necessária:** essa mudança alterou o schema (campos removidos e adicionados em
`TradeJustification`), então requer `npx prisma migrate dev --name <nome>` — não é só
aditiva como as migrations anteriores, **remove** colunas antigas
(`criterioFechamentoContrario`, `criterioRompimentoReferencia`, `criterioMediaMudouDirecao`).
Justificativas antigas salvas antes dessa mudança perdem essas colunas; se precisar
preservar dados históricos antes de migrar, fazer backup manual da tabela
`trade_justifications` antes de rodar a migration.

### Indicador IFR2 (RSI período 2) para estratégias de sobrevenda estatística

**Motivação:** usuário cadastrou manualmente uma estratégia "IFR2 (Mean Reversion/Sobrevenda)"
referenciando o critério `ifr_abaixo_limite` e o indicador IFR2 — mas o sistema não tinha esse
indicador implementado ainda (só EMA9/EMA21/VWAP). Sem o IFR2 calculado e salvo, a IA não
tinha como avaliar o critério (o número simplesmente não existia nos dados mandados pra ela),
e o gráfico não tinha como mostrar a condição de sobrevenda visualmente.

**Implementação:**
- **`calculateIFR2(closes)`** em `common/indicators.ts` — fórmula clássica de Wilder
  (suavização exponencial de ganhos/perdas médios), fixa em período 2 (não generalizada para
  outros períodos, por decisão consciente — único uso atual é IFR2). Testado isoladamente
  com casos de queda/alta/lateralização consistentes antes de integrar, confirmando
  comportamento esperado (queda consistente → IFR2 tende a 0, alta consistente → tende a
  100, lateral → oscila perto de 50).
- **`HistoricalCandle.ifr2`** (campo novo, `Float?`) — calculado e persistido junto dos
  outros indicadores em `CandlesService.fetchAndStore`.
- **`criteria-catalog.ts`** — adicionado `ifr_abaixo_limite` (IFR2 do candle de entrada
  abaixo do limite de sobrevenda definido pela estratégia, tipicamente 10).
- **`buildNumericPayload`** (evaluation.service.ts) — `ifr2` incluído em cada candle do
  payload mandado pra IA, tanto na avaliação por critérios quanto na dica de coaching
  (mesma função usada nos dois fluxos).
- **`TradeChart.tsx`** — painel separado embaixo do gráfico de candles (técnica de
  `priceScaleId` customizado + `scaleMargins`, já que o `lightweight-charts` v4 não tem
  painéis nativos — isso só chega na v5). Escala 0-100, linha do IFR2 em verde, duas linhas
  tracejadas fixas marcando os níveis 10 (sobrevenda) e 90 (sobrecompra). O painel só
  aparece quando há dados de IFR2 na sessão atual (`hasIFR2` checado antes de renderizar),
  pra não reservar espaço vazio em sessões com ativos sem esse indicador calculado.

**Atenção — candles antigos não têm IFR2 retroativamente:** candles baixados antes dessa
mudança não têm `ifr2` no banco (campo fica `null`). Para usar a estratégia IFR2 num ativo já
baixado anteriormente, é necessário **rebaixar o histórico** desse ativo (`POST
/candles/fetch` de novo com o mesmo ticker/timeframe).

**Mudança relacionada — `createMany` virou `upsert` transacional:** o método de gravação de
candles usava `createMany` com `skipDuplicates: true`, que **pulava** candles já existentes
em vez de atualizá-los. Isso significava que rebaixar um ativo não recalculava indicadores
novos (como o IFR2) em candles antigos — eles continuavam com os valores antigos (sem o
indicador novo) pra sempre. Corrigido para uma transação de `upsert` por candle (usando a
unique constraint `assetId_timeframe_timestamp`), que atualiza todos os campos, incluindo
indicadores, ao rebaixar um período já existente.

### Revisualização de gráfico (sem print)

O endpoint de chart-context busca a janela de candles (20 antes / 10 depois) e retorna
junto com o trade e o asset. O modal de gráfico reaproveita o componente de chart já
existente (mesmo usado na tela de treino), passando o trade específico pra desenhar os
marcadores de entrada/saída. Botão "Ver gráfico" aparece em dois lugares: no painel de
justificativa (ambos os estados — antes e depois de avaliar) e em cada trade dentro do
histórico.

---

## 9. Como rodar (passo a passo)


### 1. Banco
```
docker-compose up -d
```
Postgres em localhost:5440, Adminer em http://localhost:8090
(sistema PostgreSQL, server postgres, user trader, pwd trader123, db trade_trainer).

### 2. Backend
```
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
```
cd frontend
npm install
npm run dev   # http://localhost:5490
```

---

## 10. Fluxo de uso (UX final)

1. **Aba "Treino" → "Baixar histórico"**: digita ticker (ex: PETR4 — ações B3, não WIN),
   timeframe (1 ou 2 min), dias. Backend baixa via Yahoo Finance, calcula EMA9/EMA21/VWAP,
   salva.

2. **"Iniciar sessão de treino"**: sorteia trecho aleatório do histórico. **Sessão de tempo
   aberto** — sem prazo nem contador, vai até onde o usuário quiser.

3. **Tela de treino**: gráfico mostra só o primeiro candle. Clica em "Próximo candle" no
   seu ritmo. EMA9/EMA21/VWAP aparecem como overlay. Mostra "N candle(s) revelado(s)" em
   vez de barra de progresso.

4. **Abrir entrada**: direção + entry (preço de fechamento do candle atual, locked) +
   stopGain + stopLoss + estratégia opcional. **Stop trava depois de confirmar.**

5. A cada novo candle revelado, backend verifica se stop foi tocado. Se sim, fecha
   automaticamente como GAIN ou LOSS. Se a sessão acabar (fim do histórico) com trade
   aberta, fecha a mercado.

6. **Justificativa pós-trade (sempre imediata)**: 3 checkboxes (os critérios) + texto livre +
   botão "Ver gráfico" (reabre o gráfico daquele trade específico). Clica em "Salvar
   justificativa" — isso só grava no banco, **não chama a IA ainda**.

7. **Avaliação por IA (desacoplada, quando você quiser)**: depois de salvar, aparecem dois
   botões: "Avaliar com IA agora" (chama o Gemini na hora, mostra o veredito completo:
   comentário, score 0-100, critérios **dentre os marcados** que realmente bateram — os não
   marcados aparecem como "Não avaliado", não como reprovação) ou "Deixar para depois" (você
   volta a operar imediatamente, e a avaliação fica pendente, acessível depois no Histórico).

8. **Aba "Histórico"**: accordion com todas as sessões passadas. Cada trade mostra seu
   status — avaliado (veredito completo), pendente (botão "Avaliar com IA" ali mesmo), ou
   com erro na última tentativa (botão "Tentar avaliar de novo"). Também dá pra "Ver
   gráfico" de qualquer trade antigo pra reestudar o movimento com calma.

9. **Aba "Estratégias"**: cadastrar/listar estratégias, ver taxa de acerto e score IA médio
   por estratégia.

---

## 11. Roadmap / possíveis evoluções (não implementado ainda)

- **Import de CSV** para usar WIN real (broker → CSV → endpoint de import → mesma estrutura
  de tabelas). Depende do usuário confirmar uma fonte de exportação (Toro, MetaTrader,
  etc.) — ainda não resolvido se há acesso fácil.
- **MACD** como indicador adicional (estrutura igual à EMA, só somar duas EMAs)
- **Timeframe M5** já está no enum, falta expor no frontend
- Replay automático com velocidade configurável (foi descartado pra MVP mas pode voltar
  como opção)
- Filtro de histórico por estratégia/resultado/período
- Modo de revisão: olhar histórico do dia D+1 sem estar treinando (analisar)
- Comparativo de evolução: gráfico de score IA médio ao longo do tempo
- Exportar relatório de sessão em PDF

---

## 12. Erros já resolvidos (anti-padrões — não repetir)

- Tentar usar import direto do yahoo-finance2 com v2.x → erro "No exports main defined"
  (mapa de exports incompleto na v2). Fix: usar v3 + instanciar com new YahooFinance().
- Setar moduleResolution "Bundler" + module "ES2022" no tsconfig pra "resolver" o erro
  acima → quebra resolução de imports relativos do Nest ("Cannot find module
  './app.module'"), porque transforma o projeto em ESM nativo. Fix: manter module
  "commonjs" / moduleResolution "node" e resolver via versão correta da lib, não via
  configuração do compilador.
- ignoreDeprecations "6.0" → erro TS5103 "Invalid value". Fix: usar "5.0".
- Sessão com contador fixo de candles → induz ansiedade de entrar antes de acabar o tempo.
  Fix: sessão de tempo aberto, sorteando só o ponto de partida.
- Tela de justificativa some depois de enviar pra IA e veredito não fica visível. Fix: aba
  "Histórico" preserva tudo, com accordion por sessão.
- Prompt de avaliação sempre força os 3 critérios de reversão, mesmo quando a entrada é por
  outra lógica (cruzamento de médias, pullback, etc.) → IA reprova entradas válidas por
  critérios que nem se aplicavam. Fix: avaliar somente os critérios marcados pelo usuário,
  retornar null para os demais, considerar a estratégia vinculada como contexto.
- Tentar buscar WIN/mini índice no Yahoo Finance com qualquer variação de ticker → sempre
  vazio/erro, não é problema de ticker, é ausência de cobertura de futuros B3 na fonte.
  Fix: usar ações B3 pro treino (habilidade transferível), ou implementar import de CSV no
  futuro se houver fonte de exportação do broker.
- Groq apresentou instabilidade severa de rede ("Connection error." persistente) mesmo após
  atualizar para modelos vigentes (llama3-70b-8192) — não era erro de código, confirmado
  isolando o fallback local (que funcionava normalmente, gravando no Postgres). Fix: migrar
  para Google Gemini (@google/genai, modelo gemini-2.5-flash).
- Ao adicionar uma lib nova, nunca assumir a versão "de cabeça" sem checar. @google/genai
  saltou de versões 0.x/1.x direto pra 2.x; fixar uma versão chutada no package.json sem
  verificar quebraria a instalação. Fix: sempre conferir as versões reais publicadas (ex:
  npm view <pacote> versions) antes de fixar uma versão nova.
- Fazer "salvar justificativa" e "chamar a IA" na mesma operação atômica → se a IA falhar,
  perde a justificativa que o usuário escreveu, e força avaliar no calor do momento sem
  opção de adiar. Fix: separar em dois endpoints/passos independentes (ver seção 8,
  "Avaliação por IA é desacoplada da justificativa").
- Ter os 3 critérios de confirmação hardcoded (3 campos boolean fixos no schema, 3
  checkboxes fixos no frontend, 3 chaves fixas no prompt) → toda estratégia era avaliada
  pela régua de reversão, mesmo quando a lógica era outra (cruzamento, pullback). Fix:
  catálogo central de critérios (`criteria-catalog.ts`) + resolução dinâmica a partir de
  `Strategy.criterios.confirmacao` + `criteriosMarcados` como JSON dinâmico em vez de
  campos fixos (ver seção 8, "Critérios de confirmação totalmente dinâmicos por
  estratégia").

---

## 13. Contexto pessoal (para tom de comunicação)

Sou Augusto, desenvolvedor full-stack brasileiro em Blumenau-SC. Trabalho com sistemas
internos de uma manufatura de injeção plástica (Grupo Zanotti), stack diário é
React/TypeScript + PrimeReact (front) + Node.js/TypeScript + Oracle + Sequelize (back).
Comunico em português brasileiro casual. Tenho hands-on, gosto de inventar features, catch
meus próprios bugs, e prefiro arquivo completo a diff quando for editar.

Estou aprendendo análise técnica do zero junto com a construção da ferramenta — conceitos
como "fechamento contrário" e "rompimento de referência" ainda estão sendo internalizados,
então é esperado eu confundir critérios às vezes (é justamente o que a ferramenta serve
pra treinar).

Outras coisas que mexo: day trade WINQ26 (atualmente o foco), crypto (multi-chain Ledger),
DIY de eletrônica/robótica, fabricação de cockpit de sim racing.

---

## 14. Como retomar esse projeto numa nova conversa

1. Cola este documento inteiro como primeira mensagem
2. Diz o que quer fazer (ex: "quero adicionar MACD", "quero importar CSV", "está dando
   erro X")
3. A IA tem todo o contexto pra ajudar sem precisar perguntar de novo decisões já tomadas

---

*Última atualização: documento revisado após a adição do indicador IFR2 (RSI período 2) para
suportar estratégias de sobrevenda estatística, incluindo painel separado no gráfico e
correção de `createMany`/`skipDuplicates` para `upsert` transacional (permite recalcular
indicadores em candles já existentes ao rebaixar um ativo).*
