
# FinTrack / FinTrack Pro — Documentação do projeto

Este documento descreve o que a aplicação faz, como os dados são guardados e o papel de cada painel da interface. O comportamento descrito reflete a implementação em `src/App.tsx` e a configuração em `index.html`.

---

## Visão geral

**FinTrack** é uma SPA (Single Page Application) de **controle financeiro pessoal**, pensada para uso **100% no navegador**, **sem servidor ou banco de dados**: lançamentos mensais, cadastro de contas e categorias, registro de **fontes de renda** por mês e **importação de extratos em PDF** para gerar lançamentos automaticamente.

- **Nome na interface:** sidebar exibe a marca **FinTrack**; a aba do navegador usa o título **FinTrack Pro** (`index.html`).
- **Stack:** React 19, TypeScript, Vite 7 (`package.json`).
- **PDF:** biblioteca **PDF.js** (versão 3.11.174) carregada por CDN em `index.html`; o *worker* é configurado em tempo de execução para o mesmo CDN.
- **Arquitetura:** quase toda a lógica de negócio, manipulação de DOM (tabelas, gráficos SVG, strings HTML injetadas) e modais está em um único arquivo grande, `src/App.tsx` (milhares de linhas), com um componente React `App` que monta o layout e dispara a inicialização (`useEffect`).

---

## Persistência (localStorage)

Todos os dados ficam no **localStorage** do navegador. Trocar de navegador, limpar dados do site ou usar aba anônima implica perder ou não ver o mesmo conjunto de informações.

| Chave | Conteúdo |
|-------|-----------|
| `bills_<ano>_<MM>` | Lista de lançamentos (`Bill[]`) do mês. Ex.: `bills_2026_03` é março de 2026. |
| `fintrack_accounts` | Contas / métodos de pagamento (`Account[]`): nome e tipo de cartão. |
| `fintrack_categories` | Categorias customizadas (`Category[]`: id, nome, cor). Se não existir ou estiver vazia, o app usa categorias padrão derivadas de `CAT_COLORS` no código. |
| `fintrack_income_sources` | Fontes de renda cadastradas (`IncomeSource[]`: id, nome, flag recorrente). |
| `income_<ano>_<MM>` | Valores recebidos no mês por fonte (`MonthIncomeEntry[]`: `sourceId`, `value`). |
| `recurring_bills` | Templates de **contas recorrentes** (`RecurringTemplate[]`), usados para pré-preencher meses novos. |

**Salvar Mês** (sidebar): dispara `saveMonth()` → `autoSave()`, que grava `currentBills` em `bills_<mês atual>` e atualiza histórico/sparkline. **Alterações na tabela de lançamentos** também chamam `autoSave()` após edições relevantes — na prática os dados do mês costumam estar salvos sem precisar clicar em “Salvar Mês”, mas o botão reforça o hábito de persistir explicitamente.

**Limpar dados** (`resetAllData`): apaga **apenas** chaves que começam com `bills_`. **Não** remove contas, categorias, fontes de renda, `income_*` nem `recurring_bills`. Em seguida recarrega o mês atual com lista vazia (ou o que `loadMonth` aplicar em seguida).

---

## Modelo de dados (resumo)

### Lançamento (`Bill`)

- `name`: descrição (ex.: “Luz”, “Supermercado”).
- `category`: nome da categoria (string; deve existir na lista de categorias efetiva).
- `value`: valor numérico (reais).
- `status`: `pago` | `pendente` | `divida` | `vazio`.
- `obs`: observação livre; importações de PDF usam texto fixo do tipo extrato.
- `accountId` (opcional): vínculo com uma conta cadastrada.

### Conta (`Account`)

- `id`, `name`.
- `cardType`: `nenhum` | `credito` | `debito`.

### Item extraído do PDF (`ExtractedItem`)

- Mesma ideia de nome, valor, categoria e status, mais `selected` (se entra no lote de importação).

### Recorrente (`RecurringTemplate`)

- Espelha campos principais do lançamento (nome, categoria, valor, status, opcional `accountId`). Valor pode ser mantido ou zerado ao criar o template a partir de um lançamento.

---

## Layout global

### Sidebar

- Logo e nome **FinTrack**.
- **Mês de referência:** `<select>` populado com **3 meses futuros** e **14 meses passados** (relativo à data do dispositivo). O valor interno é `ano_MM` (ex.: `2026_03`).
- Navegação em grupos:
  - **Principal:** Dashboard, Lançamentos.
  - **Cadastros:** Contas cadastradas, Categorias, Fontes de renda.
  - **Histórico:** Histórico.
  - **Ferramentas:** Importar Extrato.
- Rodapé: **Salvar Mês** e **Limpar dados**.

### Topbar

- Botão hambúrguer (abre/fecha sidebar em telas menores; overlay escurece o fundo).
- Título e subtítulo **mudam conforme a página** ativa (função `navigate`).
- Atalho **Importar PDF** leva à tela de importação.

### Badge em “Lançamentos”

- Exibe quantidade de lançamentos com status **pendente** ou **dívida** (função `updatePendBadge`). Oculto quando a contagem é zero.

---

## Painéis (páginas)

### Dashboard (`page-dashboard`)

Objetivo: **visão geral do mês selecionado** na sidebar.

1. **Cabeçalho:** título com nome do mês e ano (ex.: “Março 2026”).
2. **Grade de KPIs (4 cartões):**
   - **Total do Mês:** soma dos valores de todos os lançamentos; subtítulo com quantidade de linhas na lista.
   - **Pago:** soma onde `status === 'pago'`; barra de progresso com percentual **quitado** = pago ÷ total (arredondado); subtítulo com esse %.
   - **Pendente:** soma onde `status === 'pendente'`; subtítulo com número de contas abertas (itens pendentes).
   - **Quarto cartão (orçamento vs renda):** compara **total de gastos** com **renda do mês** (`income_<mês>`). O **valor** mostrado é o **módulo da diferença** `|gastos - renda|`. Os rótulos variam:
     - *Dentro do orçamento* / “Gastos iguais à renda” (diferença zero).
     - *Fora do orçamento* / “Gastos acima da renda” (gastos > renda) — destaque em vermelho.
     - *Lucro* / “Renda acima dos gastos” (renda > gastos) — destaque em verde.
3. **Card “Fontes de renda”:** barra comparando visualmente **renda restante** (verde) e **valor a pagar** (vermelho), com legenda; depende de renda e totais calculados. Link “Ver fontes →” abre a página de fontes.
4. **Card “Gastos por Conta”:** no **código** (`renderBarChart`), o gráfico mostra, para até **12 meses** com chaves `bills_*` no `localStorage`, barras **empilhadas por categoria** (cores das categorias), com rótulo mês/ano e total do mês. Ou seja, é uma **evolução mensal por categoria**, não uma quebra por “conta bancária” — o título da UI pode sugerir outra leitura, mas a implementação é por **categoria × mês**. Link “Ver todas →” vai para Lançamentos.
5. **Card “Distribuição”:** gráfico em **rosca (donut)** com fatias **Pago**, **Pendente** e **Dívida** (agrupa `status === 'divida'`). No centro costuma aparecer o % quitado.
6. **“Evolução Mensal”:** barras verticais tipo *sparkline* com o **total de gastos** de cada mês que tenha `bills_*` salvo. Link “Ver histórico →” abre a página Histórico.

---

### Lançamentos / Contas do Mês (`page-contas`)

- Reflete o **mesmo mês** da sidebar.
- **Quatro KPIs** compactos: Total, Pago, Pendente, **Em Dívida** — neste último, o valor exibido na grade de contas reutiliza o mesmo número do cartão “orçamento” do dashboard (módulo da diferença gastos vs renda), não apenas a soma das linhas com status `divida`.
- Botões **+ Adicionar conta** (modal de nova conta) e **+ Adicionar lançamento** (modal de lançamento).
- **Tabela** com colunas: Conta/Cartão, Descrição, Categoria, Valor, Status, Obs., Recorrente, ações. Células costumam ser editáveis inline (inputs/selects) e disparam atualização de KPIs, gráficos e `autoSave`.
- Ações de **recorrência:** marcar lançamento como recorrente (com diálogo para repetir valor ou zerar nos próximos meses) ou **descontinuar** template (não afeta meses já salvos).

---

### Contas cadastradas (`page-contas-cadastradas`)

- Lista tabelada de contas com tipo de cartão (rótulos amigáveis: Sem cartão, Crédito, Débito).
- **Nova conta**, **Editar**, **Excluir**. Ao excluir, lançamentos que apontavam para aquela conta **perdem o vínculo** (ficam sem conta associada), conforme mensagem de confirmação.

---

### Categorias (`page-categorias`)

- Tabela: nome, amostra de cor (hex), ações **Editar** / **Excluir**.
- Modal permite nome + seletor de **cor**.
- **Excluir categoria** não renomeia automaticamente lançamentos antigos que ainda carregam aquele texto como categoria.

---

### Fontes de renda (`page-fontes-renda`)

- Cadastro global de fontes (salário, freela, etc.).
- Colunas: nome, se é **recorrente**, **valor informado para o mês atual** da sidebar, ações (editar, alternar recorrente, excluir).
- Ao **editar**, o modal permite ajustar nome, flag recorrente e **valor no mês** (um valor por fonte por mês).
- O dashboard usa a soma desses valores (chaves `income_<ano>_<MM>`) como “renda do mês” nos KPIs e na barra verde/vermelha.

---

### Importar Extrato (`page-importar`)

- **Área de arrastar/soltar** ou clique para escolher arquivo; apenas **PDF**.
- Processamento local: leitura com PDF.js, extração de texto página a página, depois **parse** heurístico (`parseTransactions`) que tenta identificar linhas de lançamento.
- Barra de “processando” e mensagens de status.
- Após sucesso: seção com **lista de itens** extraídos; cada linha pode ser selecionada, com ajuste de categoria, valor e status. Botões **Marcar todos** / **Desmarcar**.
- **Importar selecionados:** converte itens marcados em `Bill` (observação indica origem em extrato), salva/atualiza lista, atualiza telas e **navega para Lançamentos**.
- Link **Ver texto bruto do PDF** expande caixa com o texto concatenado (útil para depurar extratos com layout ruim).

**Categorização automática (palavras-chave):** o código define mapas `CAT_KW` por categoria (Moradia, Transporte, Alimentação, Saúde, Lazer, Financeiro) com termos comuns no Brasil (contas de luz/água, apps de transporte, supermercados, streaming, nomes de banco/digital, etc.). Se nada casar, categorias podem cair em **Outros** ou na lógica complementar do parser.

---

### Histórico (`page-historico`)

- **Grade de cartões** dos meses que possuem entrada `bills_*` no `localStorage`.
- Clicar em um cartão ajusta o seletor de mês, recarrega dados (`loadMonth`) e navega de volta ao **Dashboard**, permitindo revisar aquele mês.

---

## Modais

| Modal | Função |
|-------|--------|
| Nova conta / Editar conta | Nome; tipo: Nenhum, Crédito ou Débito. |
| Nova categoria / Editar categoria | Nome + cor. |
| Nova fonte / Editar fonte | Nome; checkbox recorrente; ao editar, valor no mês atual. |
| Novo lançamento / Editar lançamento | Conta (select populado com cadastro), descrição, categoria, valor, status (Pendente/Pago/Dívida), observação, opção **Conta recorrente** (alimenta `recurring_bills` com confirmação de valor). |

Fechamento costuma ser por backdrop, botão × ou Cancelar. Mensagens curtas aparecem no elemento **toast** no canto da tela.

---

## Comportamentos importantes

- **Carregar mês** (`loadMonth`): lê `bills_<mês>`. Se não existir dados salvos, preenche com cópias dos templates em `recurring_bills`, se houver; senão, lista vazia.
- **autoSave** grava sempre o mês atual em `localStorage` e atualiza componentes dependentes de histórico.
- **Importação PDF:** depende de texto extraível; PDFs protegidos por senha, imagens escaneadas sem OCR ou layouts muito irregulares tendem a falhar ou gerar lixo — o app avisa erro genérico na leitura.
- **Privacidade:** os dados não são enviados a servidores da aplicação; apenas o carregamento do PDF.js/worker a partir do CDN, como qualquer site que usa essa biblioteca.

---

## Como rodar o projeto (desenvolvimento)

```bash
npm install
npm run dev
```

O endereço padrão do Vite é `http://localhost:5173/` (ou outra porta se 5173 estiver ocupada).

---

## Arquivos principais

| Arquivo | Papel |
|---------|--------|
| `index.html` | Shell HTML, título, script PDF.js CDN, raiz `#root`. |
| `src/main.tsx` | Monta React no DOM. |
| `src/App.tsx` | Toda a aplicação FinTrack descrita neste documento. |
| `src/App.css` / `src/index.css` | Estilos da interface. |
| `package.json` | Dependências e scripts (`dev`, `build`, `preview`). |
