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
  cli.tsx          # entrada: carrega dados e escolhe Browser (TTY) ou texto puro (pipe)
  git/
    exec.ts        # executa `git` (execFile) e rejeita com o stderr
    log.ts         # loadCommits(): git log -> Commit[] (all/revs/maxCount; repo vazio devolve [])
    parse.ts       # parseLog(): texto -> Commit[] (puro)
    refs.ts        # loadRefs()/parseRefs(): branches, remotos, tags e HEAD por commit
  graph/
    types.ts       # Commit, Ref, Edge, GraphRow
    layout.ts      # layoutGraph(): Commit[] -> GraphRow[] (puro, sem UI)
    glyphs.ts      # GraphRow -> células de caracteres (nó e linha de ligação), puro
  ui/
    Browser.tsx    # TUI: seleção, rolagem, filtro por branch e carga sob demanda
    GraphRowView.tsx # uma linha do grafo em Ink (cores por lane, truncada, destaque)
    CommitDetail.tsx # painel com os detalhes do commit selecionado (5 linhas fixas)
    BranchPicker.tsx # seletor de branch (ocupa o lugar do painel de detalhes)
    viewport.ts    # janela de linhas visíveis com itens de altura 1 ou 2 (puro)
    picker.ts      # lista e filtro de branches (puro)
    format.ts      # etiquetas de refs (HEAD, branches, remotos, tags)
    plain.ts       # formatPlain(): mesma saída em texto puro, para pipes
tests/
  graph/           # layout e glyphs com commits sintéticos (sem git)
  ui/              # viewport/picker/format/plain puros; Browser e GraphRowView via ink-testing-library
  git/             # parse/refs puros e integração com repos git temporários (helpers.ts)
```


### Modelo de layout

`layoutGraph` recebe commits em ordem topológica (filhos antes dos pais) e mantém uma lista de *lanes*, em que cada coluna guarda o hash do commit esperado. Regras:

- O commit fica na lane que o espera; sem lane (ponta nova), usa a primeira livre.
- O primeiro pai herda a coluna do filho; os demais pais abrem lanes livres.
- Pai que já tem lane recebe a aresta nela, sem duplicar lane.
- Cada `GraphRow` expõe `lanesBefore`, `lanesAfter` e `edges`, o suficiente para desenhar linhas passantes, bifurcações e merges. Lanes livres à esquerda não são compactadas.

### Saída

- **TTY:** `Browser` roda em tela alternativa (`alternateScreen` do Ink), então o scrollback do terminal não é afetado. O layout tem altura fixa: cabeçalho, lista, separador, detalhes (5 linhas) e rodapé, mais 1 linha de folga (se a saída ocupar todas as linhas, o Ink limpa a tela a cada render). Cada linha é truncada na largura do terminal.
- **Sem TTY (pipe/redirecionamento):** `formatPlain` imprime texto puro, sem cor nem quebra, como o `git log`. Não passa pelo Ink.
- Cada coluna do grafo ocupa 2 caracteres (glifo + espaço ou `─`); a linha de ligação só existe quando alguma aresta muda de coluna.

### Interação (TTY)

- `j`/`k`/setas movem a seleção; `PgUp`/`PgDn` andam uma página; `g`/`G` (ou `Home`/`End`) vão ao início/fim; `q` sai.
- `/` abre o seletor de branch (locais e remotas): digitar filtra, `↑`/`↓` escolhem, `Enter` aplica, `Esc` cancela. Aplicar recarrega com `git log <branch>` (a opção "todas" volta ao `--all`).
- A janela visível é calculada em linhas, não em commits, porque um commit com linha de ligação ocupa 2 linhas (`viewport.ts`). O deslocamento é recalculado a cada render, então redimensionar o terminal não esconde o cursor.
- Carga sob demanda: a CLI começa com 500 commits; quando a lista está cheia e a seleção chega a 20 commits do fim, recarrega com o dobro do limite. O prefixo do `--topo-order` não muda com `--max-count`, então o layout dos commits já mostrados permanece igual.
- `Browser` recebe `load(rev, limit)` por parâmetro, o que isola o git da UI e permite testar com dados falsos. As refs são lidas uma vez por sessão.
