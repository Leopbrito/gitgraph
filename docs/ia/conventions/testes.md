# Convenções de testes

- Runner: **Vitest** (`npm test`). Os testes ficam em `tests/`, espelhando `src/`.
- **Lógica pura** (`parse`, `layout`, `glyphs`, `viewport`, `picker`, `args`): testes de tabela com commits sintéticos, sem git.
- **Git de verdade:** use `createRepo()` de `tests/git/helpers.ts`, que cria um repositório temporário com autor fixo e `gpgsign` desligado, e limpe com `cleanup()`. Não dependa da ordem entre commits paralelos (o `--topo-order` não a garante).
- **Componentes Ink:** `ink-testing-library`. Para teclas, escreva em `stdin` e espere um tick (veja `press()` em `tests/ui/Browser.test.tsx`). Em teste não há TTY, então não dá para afirmar sobre cores: teste texto e estrutura.
- **Desenhos do grafo:** confira a saída à mão contra o `git log --graph` antes de fixá-la como expectativa; não copie o que o código devolveu sem conferir.
- Mudou o formato de saída? Atualize os testes que o fixam e diga isso no commit.
- Antes de concluir: `npm run typecheck`, `npm run build` e `npm test`.
