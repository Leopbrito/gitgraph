# Convenções de código

- **TypeScript estrito** (`strict` e `noUncheckedIndexedAccess`), ESM com `NodeNext`: os imports relativos levam a extensão `.js` (`import {x} from './x.js'`).
- **Módulos puros primeiro.** `graph/` e `git/parse.ts` não dependem de UI nem de processo: recebem dados e devolvem dados. Só `git/exec.ts` e `cli.tsx` tocam o sistema.
- **A UI recebe dependências por props.** O `Browser` recebe `load(rev, limit)` em vez de chamar o git, o que permite testá-lo com dados falsos.
- **Opções de exibição por contexto** (`ui/display.ts`: cor e ASCII), não por props repassadas em todos os componentes.
- **Comentários em português**, só onde o porquê não é óbvio (decisões, armadilhas do git ou do Ink), não para repetir o código.
- **Sem dependência nova sem justificativa.** Preferir a biblioteca padrão do Node (ex.: `util.parseArgs`).
- **Mudou uma decisão de arquitetura ou convenção?** Atualize `ARCHITECTURE.md` e esta pasta no mesmo trabalho.
