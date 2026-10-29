# Arquitetura

> Documento vivo. Seções marcadas como **A definir** ainda não têm decisão.

## Objetivo

CLI que lê um repositório git e renderiza no terminal o grafo de branches e commits.

## Stack

- **UI:** React + [Ink](https://github.com/vadimdemedes/ink)
- **Linguagem:** TypeScript (strict, ESM), executado em dev com `tsx`
- **Leitura do git:** chamar `git log` via `child_process` (sem biblioteca)
- **Testes:** Vitest + ink-testing-library
- **Gerenciador de pacotes:** npm

## Visão geral

```
repositório git ──▶ leitura dos dados ──▶ montagem do grafo ──▶ renderização (Ink)
```

1. **Leitura dos dados:** obtém commits, pais, branches e tags do repositório.
2. **Montagem do grafo:** transforma os commits em um modelo com linhas, colunas e arestas, sem depender da UI.
3. **Renderização:** componentes Ink que desenham o modelo no terminal.

## Estrutura de diretórios

```
src/
  cli.tsx          # entrada: argumentos, carga dos dados e escolha entre Browser (TTY) e texto puro (pipe)
  args.ts          # parseCliArgs() (util.parseArgs), HELP e UsageError
  git/
    exec.ts        # executa `git` (execFile, LC_ALL=C), traduz os erros comuns; opção `network` para remotas
    log.ts         # loadCommits(): git log -> Commit[] (all/revs/maxCount/order/stashes; `all` exclui o stash; repo vazio devolve [])
    parse.ts       # parseLog(): texto -> Commit[] (puro)
    stash.ts       # loadStashes()/parseStashList(): entradas do `git stash list` (hash e stash@{n})
    refs.ts        # loadRefs()/parseRefs(): branches, remotos, tags e HEAD por commit
    merge.ts       # mergeTargets()/describeMergeTarget() (puros), merge(), abortMerge(), mergeInProgress(), conflictedFiles(), MergeConflictError
    checkout.ts    # checkoutTargets()/isCurrent()/describeTarget()/describeOption() (puros) e checkout() via `git switch` (+ `pull --ff-only`)
  graph/
    types.ts       # Commit, Ref, Edge, GraphRow
    layout.ts      # layoutGraph(): Commit[] -> GraphRow[] (puro, sem UI)
    glyphs.ts      # GraphRow -> células de caracteres (nó e linha de ligação), puro
  ui/
    Browser.tsx    # TUI: seleção, rolagem, filtro por branch e carga sob demanda
    display.ts     # DisplayContext (cor/ASCII), tint() e separator()
    GraphRowView.tsx # uma linha do grafo em Ink (cores por lane, truncada, destaque)
    CommitDetail.tsx # painel com os detalhes do commit selecionado (5 linhas fixas)
    BranchPicker.tsx # seletor de branch (ocupa o lugar do painel de detalhes)
    CheckoutPrompt.tsx # confirmação do checkout (ocupa o lugar do painel de detalhes)
    MergePrompt.tsx # confirmação do merge (idem)
    ConflictPrompt.tsx # merge em andamento: abortar ou deixar (idem)
    viewport.ts    # janela de linhas visíveis com itens de altura 1 ou 2 (puro)
    picker.ts      # lista e filtro de branches (puro)
    format.ts      # etiquetas de refs (HEAD, branches, remotos, tags)
    plain.ts       # formatPlain(): mesma saída em texto puro, para pipes (aceita ascii)
tests/
  graph/           # layout e glyphs com commits sintéticos (sem git)
  ui/              # viewport/picker/format/plain puros; Browser e GraphRowView via ink-testing-library
  git/             # parse/refs puros e integração com repos git temporários (helpers.ts)
```


### Modelo de layout

`layoutGraph` recebe commits em ordem topológica (filhos antes dos pais) e mantém uma lista **densa** de *lanes* (hashes esperados, sem buracos): o índice da lane é a coluna na tela. Regras:

- O commit fica na lane que o espera; sem lane (ponta nova), entra no **fim** da lista, para não empurrar as lanes existentes sem uma linha de ligação.
- O primeiro pai herda a lane (e a cor) do filho; os demais abrem lanes logo à direita dele.
- Pai que já tem lane recebe a aresta nela, sem duplicar lane.
- Quando uma lane termina (raiz, ou primeiro pai já presente em outra lane), as da direita deslizam para a esquerda. Por isso o grafo não deixa colunas vazias.
- Cada `GraphRow` expõe `lanesBefore`/`lanesAfter` (e as cores paralelas) e `edges` (coluna do pai em `lanesAfter`). A lane mantém a cor ao deslizar: a cor é da lane, não da coluna.

### Desenho (glyphs)

A linha do commit mostra `●` e as lanes passantes (`│`) de `lanesBefore`. A **linha de ligação** existe só se alguma lane muda de coluna (`needsConnector`) e desenha, para cada trajeto (aresta do commit ou lane passante), sobe-anda-desce entre a coluna de origem e a de destino. As direções que se encontram numa célula se somam e viram o glifo (`├ ┤ ┬ ┴ ┼ ╭ ╮ ╰ ╯`). Lanes que só deslizam uma coluna usam `╱` (esquerda) ou `╲` (direita) no espaço entre as colunas, se ele estiver livre.

Com `spaced` (padrão da CLI), a linha de ligação existe depois de **todo** commit que ainda tem lanes seguindo, mesmo sem nenhuma lane mudar de coluna: ela só desenha o `│` que liga um commit ao próximo. Sem `spaced` (`--compact`), uma linha por commit e a linha de ligação só aparece quando alguma lane muda de coluna. A opção chega aos componentes pelo `DisplayContext` e à saída em texto por `formatPlain`; `Browser` usa `needsConnector(row, {spaced})` para calcular a altura de cada linha (1 ou 2), então a rolagem continua correta.

### Saída

- **TTY:** `Browser` roda em tela alternativa (`alternateScreen` do Ink), então o scrollback do terminal não é afetado. O layout tem altura fixa: cabeçalho, lista, separador, detalhes (5 linhas) e rodapé, mais 1 linha de folga (se a saída ocupar todas as linhas, o Ink limpa a tela a cada render). Cada linha é truncada na largura do terminal.
- **Sem TTY (pipe/redirecionamento):** `formatPlain` imprime texto puro, sem cor nem quebra, como o `git log`. Não passa pelo Ink.
- Cada coluna do grafo ocupa 2 caracteres (glifo + espaço, `─`, `╱` ou `╲`).

### Interação (TTY)

- `j`/`k`/setas movem a seleção; `PgUp`/`PgDn` andam uma página; `g`/`G` (ou `Home`/`End`) vão ao início/fim; `c` faz checkout; `m` faz merge na branch atual; `q` sai.
- `/` abre o seletor de branch (locais e remotas) com seleção múltipla: digitar filtra a lista, `↑`/`↓` movem, `Espaço` marca/desmarca (em "todas", limpa as marcas), `Enter` aplica, `Esc` cancela. O filtro é uma lista `revs: string[]` (vazia = todas, via `--exclude=refs/stash --all`); aplicar recarrega com `git log <revs...>`, ou seja, a união dos commits alcançáveis de cada branch. As marcas são do estado do seletor (`selected`), sobrevivem à digitação, e o seletor abre já com o filtro atual marcado. `chosenRevs` (puro, em `picker.ts`) decide o que o `Enter` aplica: as marcadas na ordem da lista ou, sem nenhuma, a destacada.
- A janela visível é calculada em linhas, não em commits, porque um commit com linha de ligação ocupa 2 linhas (`viewport.ts`). O deslocamento é recalculado a cada render, então redimensionar o terminal não esconde o cursor.
- Carga sob demanda: a CLI começa com 500 commits; quando a lista está cheia e a seleção chega a 20 commits do fim, recarrega com o dobro do limite. O prefixo da ordem escolhida (veja "Ordem dos commits") não muda com `--max-count`, então o layout dos commits já mostrados permanece igual.
- `Browser` recebe `load(revs, limit)` por parâmetro, o que isola o git da UI e permite testar com dados falsos. As refs são relidas a cada `load` (são baratas), porque um checkout move o HEAD.
- **Checkout (`c`):** `checkoutTargets` escolhe o destino do commit selecionado: as branches locais cuja ponta ele é (ordenadas) ou, se não houver, HEAD destacado (`git switch --detach <hash>`); pontas só remotas caem em HEAD destacado. Sempre pede confirmação (`CheckoutPrompt`; com várias branches é uma lista). Se o HEAD já está no destino, só avisa no rodapé. Nunca usa `--force`: o git recusa quando alterações locais seriam sobrescritas, e a mensagem vira o erro de uma linha no rodapé.
- **Branch local atrás da remota:** se o commit é a ponta de `origin/x` e a branch local `x` (`localBranchTips` em `refs.ts`) está em outro commit, `checkoutTargets` devolve `[pull x, branches realmente no commit, x sem pull, HEAD destacado]` e o prompt é uma lista com a primeira opção selecionada. O nome da branch local é o que sobra depois da remota, tentando cada `/` (aguenta `origin/feature/x`). `checkout` de um alvo `pull` faz `git switch x` e depois `git pull --ff-only <remota> x`. Se o pull falha, lança `PartialCheckoutError` (a troca já aconteceu): o `Browser` recarrega para o HEAD refletir isso e mantém a mensagem, filtrada por `summarizeGitError` (tira o resumo do fetch e as `hint:`). O pull usa `git(..., {network: true})`: `GIT_TERMINAL_PROMPT=0`, processo sem terminal de controle (`detached`, para o ssh não pedir senha na TUI) e limite de 2 minutos.
- Depois do sucesso do checkout, `Browser` chama `reload` (cursor mantido) para o marcador HEAD acompanhar. `Browser` recebe `checkout(target)` por parâmetro, como `load`.

### Ordem dos commits

`loadCommits` aceita `order` (`COMMIT_ORDERS` em `log.ts`): `date` (padrão, `git log --date-order`), `author-date` e `topo` (`--topo-order`). Todas garantem que nenhum pai aparece antes dos filhos, de que o layout depende. A escolha muda muito a largura do grafo, porque decide quanto tempo cada lane fica aberta: com `--topo-order` cada linha de história sai inteira antes da seguinte, então um merge abre uma lane que espera por um commit distante; com `--date-order` os commits da branch ficam perto do merge que os incorporou e as lanes são curtas. Num histórico real com ~90 commits e PRs de uma mesma branch de feature, a largura foi de 14 colunas (`topo`) para 2 (`date`), que é também o que o Git Graph do VS Code faz por padrão. `--max-count` não muda o prefixo da lista nas três ordens (git ordena tudo antes de cortar), o que a carga sob demanda exige; há teste para isso.

### Merge e branch atual

O cabeçalho mostra `atual: <branch>` (`headLabel`, em `format.ts`), vindo de `RefInfo.head`, que `loadRefs` relê a cada carga; `head.merging` vem de `mergeInProgress` (existência de `.git/MERGE_HEAD`). `m` calcula as origens com `mergeTargets`: as branches locais e remotas cuja ponta é o commit (a atual fica de fora), ou o próprio commit. Recusas sem prompt: stash, HEAD destacado, e o commit de HEAD. A confirmação (`MergePrompt`) roda `merge()`: `git merge --no-edit <ref>` (fast-forward quando possível, senão merge commit; o resultado `up-to-date | fast-forward | merged` vira o aviso do rodapé). Depois do sucesso o `Browser` recarrega e **seleciona a primeira linha** (o commit novo), porque o índice do cursor mudaria. Recusas do git (alterações locais, ref inexistente) são um erro de uma linha e não mudam nada.

**Conflitos.** Se o `git merge` falha e `MERGE_HEAD` existe, `merge()` lança `MergeConflictError` com os arquivos (`git diff --name-only --diff-filter=U`) e deixa o merge em andamento. O `Browser` recarrega (para o cabeçalho avisar) e abre `ConflictPrompt`: `a` aborta (`git merge --abort`), `d`/`Esc` deixa em andamento. Como o estado vive no repositório e não na TUI, `m` com `head.merging` reabre o mesmo diálogo, mesmo que o merge tenha começado antes de abrir a TUI. O `Browser` recebe `merge: MergeActions` por parâmetro, como `load` e `checkout`.

### Stashes

Cada entrada do stash é um commit com 2 ou 3 pais: o commit-base e commits internos (índice e, com `-u`, arquivos não rastreados). Por isso o `--all` exclui `refs/stash`. Com `loadCommits({stashes: true})`, `withStashes` (em `log.ts`) lê as entradas (`loadStashes`) e insere cada uma como **um nó** (`Commit.stash = true`) com **só o commit-base como pai**, logo **acima do commit-base** e não na data: assim não abre uma lane longa do topo até a base, e as linhas já mostradas não se deslocam quando mais histórico é carregado. Vários stashes na mesma base ficam empilhados, do mais novo para o mais antigo. Um stash cuja base não está na lista (`-n`, filtro de branch) é omitido. Falhas ao ler o stash viram "sem stashes" para não derrubar o grafo. `loadRefs` etiqueta cada commit de stash com `{kind: 'stash', name: 'stash@{n}'}`; stash não é branch, então não entra em `branchNames` nem em `localBranchTips`. O desenho usa um nó oco (`○`, `o` em ASCII) e o rótulo em magenta. No `Browser`, `c` numa linha de stash só mostra um aviso: um commit de stash não é uma linha de história. `--no-stash` desliga tudo isso.

### Opções e erros

- **Argumentos:** `parseCliArgs` usa `util.parseArgs` (sem dependência). `-n/--max-count` é um teto rígido: na TUI vira o limite inicial e o máximo da carga sob demanda (`Browser.maxCommits`); sem ele a TUI começa em 500 e cresce, e o pipe imprime tudo.
- **Cor:** `--no-color` ou `NO_COLOR` desligam só as cores (`tint()`), mas o Ink/chalk lê `--no-color` do `argv` e desliga todo estilo, inclusive o inverso. Por isso a linha selecionada também leva o marcador `>`.
- **Linha de ligação:** `--compact` desliga `spaced` (`Display.spaced`). O padrão ligado deixa o grafo mais legível, mas cabem menos commits por tela e a saída em pipe tem mais linhas.
- **ASCII:** `--ascii` troca os caracteres de desenho (`toAscii` em `glyphs.ts`), o separador e os símbolos dos textos. O `…` da truncagem é do Ink.
- **Erros do git:** `exec.ts` roda o git com `LC_ALL=C` (o código reconhece mensagens como "does not have any commits" em qualquer idioma) e traduz "não é um repositório" e `ENOENT` (git ausente). `cli.tsx` sai com 2 em erro de uso e 1 nos demais; repositório sem commits não é erro.
