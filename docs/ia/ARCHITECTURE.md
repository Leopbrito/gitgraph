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
    exec.ts        # executa `git` (execFile, LC_ALL=C) e traduz os erros comuns
    log.ts         # loadCommits(): git log -> Commit[] (all/revs/maxCount; `all` exclui o stash; repo vazio devolve [])
    parse.ts       # parseLog(): texto -> Commit[] (puro)
    refs.ts        # loadRefs()/parseRefs(): branches, remotos, tags e HEAD por commit
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

- `j`/`k`/setas movem a seleção; `PgUp`/`PgDn` andam uma página; `g`/`G` (ou `Home`/`End`) vão ao início/fim; `q` sai.
- `/` abre o seletor de branch (locais e remotas): digitar filtra, `↑`/`↓` escolhem, `Enter` aplica, `Esc` cancela. Aplicar recarrega com `git log <branch>` (a opção "todas" volta ao `--all`).
- A janela visível é calculada em linhas, não em commits, porque um commit com linha de ligação ocupa 2 linhas (`viewport.ts`). O deslocamento é recalculado a cada render, então redimensionar o terminal não esconde o cursor.
- Carga sob demanda: a CLI começa com 500 commits; quando a lista está cheia e a seleção chega a 20 commits do fim, recarrega com o dobro do limite. O prefixo do `--topo-order` não muda com `--max-count`, então o layout dos commits já mostrados permanece igual.
- `Browser` recebe `load(rev, limit)` por parâmetro, o que isola o git da UI e permite testar com dados falsos. As refs são lidas uma vez por sessão.

### Opções e erros

- **Argumentos:** `parseCliArgs` usa `util.parseArgs` (sem dependência). `-n/--max-count` é um teto rígido: na TUI vira o limite inicial e o máximo da carga sob demanda (`Browser.maxCommits`); sem ele a TUI começa em 500 e cresce, e o pipe imprime tudo.
- **Cor:** `--no-color` ou `NO_COLOR` desligam só as cores (`tint()`), mas o Ink/chalk lê `--no-color` do `argv` e desliga todo estilo, inclusive o inverso. Por isso a linha selecionada também leva o marcador `>`.
- **Linha de ligação:** `--compact` desliga `spaced` (`Display.spaced`). O padrão ligado deixa o grafo mais legível, mas cabem menos commits por tela e a saída em pipe tem mais linhas.
- **ASCII:** `--ascii` troca os caracteres de desenho (`toAscii` em `glyphs.ts`), o separador e os símbolos dos textos. O `…` da truncagem é do Ink.
- **Erros do git:** `exec.ts` roda o git com `LC_ALL=C` (o código reconhece mensagens como "does not have any commits" em qualquer idioma) e traduz "não é um repositório" e `ENOENT` (git ausente). `cli.tsx` sai com 2 em erro de uso e 1 nos demais; repositório sem commits não é erro.
