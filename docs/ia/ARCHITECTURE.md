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
  cli.tsx          # entrada (Ink)
  git/
    exec.ts        # executa `git` (execFile) e rejeita com o stderr
    log.ts         # loadCommits(): git log -> Commit[] (repo vazio devolve [])
    parse.ts       # parseLog(): texto -> Commit[] (puro)
    refs.ts        # loadRefs()/parseRefs(): branches, remotos, tags e HEAD por commit
  graph/
    types.ts       # Commit, Ref, Edge, GraphRow
    layout.ts      # layoutGraph(): Commit[] -> GraphRow[] (puro, sem UI)
tests/
  graph/           # layout com commits sintéticos (sem git)
  git/             # parse/refs puros e integração com repos git temporários (helpers.ts)
```

Previstos nas próximas fases: `graph/glyphs.ts` e `ui/`.

### Modelo de layout

`layoutGraph` recebe commits em ordem topológica (filhos antes dos pais) e mantém uma lista de *lanes*, em que cada coluna guarda o hash do commit esperado. Regras:

- O commit fica na lane que o espera; sem lane (ponta nova), usa a primeira livre.
- O primeiro pai herda a coluna do filho; os demais pais abrem lanes livres.
- Pai que já tem lane recebe a aresta nela, sem duplicar lane.
- Cada `GraphRow` expõe `lanesBefore`, `lanesAfter` e `edges`, o suficiente para desenhar linhas passantes, bifurcações e merges. Lanes livres à esquerda não são compactadas.
