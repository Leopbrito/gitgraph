# Convenções de commits

- **Nunca commitar nem dar push sem pedido explícito.** Antes de commitar, mostre o diff (ou a lista de arquivos) e a mensagem proposta e espere o OK; só então rode `git commit`.
- Mensagens em **português**: título na 3ª pessoa do presente (`Adiciona…`, `Corrige…`, `Compacta…`), até ~70 caracteres, sem ponto final.
- Corpo opcional, separado por linha em branco, com ~72 colunas por linha, explicando o **porquê** e o que muda para quem usa.
- Um commit por mudança coesa (uma fase do plano, uma correção). Documentação alterada pela mudança vai no mesmo commit.
- Antes de commitar, `npm run typecheck`, `npm run build` e `npm test` passam.
