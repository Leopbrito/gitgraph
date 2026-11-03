# gitgraph

CLI que mostra o grafo de branches e commits de um repositório git no terminal.
Num terminal, a interface é interativa; com a saída redirecionada, imprime texto puro.

```
●      be7c08a (HEAD -> main) octopus  Ana, 2026-10-28
├─┬─╮
│ │ ●  baf5f20 (b2) b2  Ana, 2026-10-28
│ ● │  5f7e4d6 (b1) b1  Ana, 2026-10-28
│ │╱
● │    05c7c80 main 2  Ana, 2026-10-28
│╱
●      d6cda52 (tag: v1) merge hotfix  Ana, 2026-10-28
```

## Requisitos

- Node.js 22 ou superior (exigência do Ink).
- `git` 2.23 ou superior no `PATH` (o checkout usa `git switch`).

## Instalação

```sh
npm install
npm run build
npm link      # opcional: disponibiliza o comando `gitgraph`
```

Sem o `npm link`, use `node dist/cli.js` dentro do repositório que quer ver, ou `npm run dev` durante o desenvolvimento.

## Uso

```sh
gitgraph [opções]
```

| Opção | Efeito |
| --- | --- |
| `-n`, `--max-count <n>` | Mostra no máximo `n` commits. Sem ela, a interface carrega 500 e busca mais conforme você desce, e a saída por pipe imprime tudo. |
| `--no-color` | Desliga as cores (também vale a variável `NO_COLOR`). |
| `--ascii` | Usa só caracteres ASCII no grafo e nos símbolos da interface. |
| `--compact` | Uma linha por commit, sem a linha de ligação (`│`) entre eles. Por padrão, commits seguidos são ligados por um traço, o que ocupa mais linhas. |
| `--order <ordem>` | Ordem dos commits: `date` (padrão, por data do commit), `author-date` (por data do autor) ou `topo` (mantém cada linha de história junta). A ordem por data intercala as branches e deixa o grafo bem mais estreito; `topo` pode ser melhor em históricos com poucas branches longas e simultâneas. |
| `--no-stash` | Não mostra os stashes no grafo. |
| `--no-mouse` | Desliga o suporte a mouse (veja abaixo). |
| `-h`, `--help` | Mostra a ajuda. |
| `-v`, `--version` | Mostra a versão. |

Mostra todas as branches locais e remotas e as tags. Cada **stash** aparece como um nó oco (`○`, `o` com `--ascii`) com o rótulo `(stash@{0})`, logo acima do commit em que foi feito; os commits internos que o git cria para o stash (índice e arquivos não rastreados) ficam escondidos. Um stash só aparece se o commit-base estiver na lista (por exemplo, `-n` pode cortá-lo, e um filtro de branch que não inclua o commit-base também). Use `--no-stash` para não mostrá-los.

### Teclas (modo interativo)

| Tecla | Ação |
| --- | --- |
| `j` / `↓`, `k` / `↑` | Move a seleção |
| `PgDn`, `PgUp` | Anda uma página |
| `Enter` / `d` | Abre a **visão do commit** em tela cheia: mensagem completa, arquivos alterados (status `A`/`M`/`D`/`R`, linhas `+`/`-`, `bin` para binários) e diff. `Tab` alterna entre mensagem e arquivos; `j`/`k`/`PgUp`/`PgDn`/`g`/`G` movem ou rolam. Nela, `Enter` abre o arquivo selecionado **lado a lado**: à esquerda a versão anterior, à direita a nova, o arquivo inteiro alinhado, com linhas removidas (`-`, vermelho) e adicionadas (`+`, verde) destacadas; abre já na primeira mudança, e `n`/`N` pulam para a próxima/anterior. `u` alterna para o diff unificado (hunks `@@`); arquivos binários abrem direto no unificado. `d` mostra o diff unificado do commit inteiro. `Esc`/`q` volta (do diff para a visão, da visão para a lista). Num merge ou stash o diff é contra o primeiro pai. Diffs de commit com mais de 5000 linhas (20000 no lado a lado) são cortados, com aviso. Linhas longas são truncadas, sem rolagem horizontal. |
| `c` | Checkout do commit selecionado, com confirmação (`Enter`/`y` confirma, `Esc`/`n` cancela). Troca para a branch local que aponta para o commit (uma lista, se forem várias) ou deixa o HEAD destacado nele. Num stash, só avisa que não dá para fazer checkout. Se o commit é a ponta de uma branch remota (`origin/x`) e a branch local `x` está em outro commit, a lista oferece também **`x` e pull**. |
| `g` / `Home`, `G` / `End` | Vai ao início, ao fim |
| `m` | Merge na branch atual, com confirmação (`Enter`/`y` confirma, `Esc`/`n` cancela): da branch que aponta para o commit selecionado (uma lista, se forem várias, incluindo remotas) ou do próprio commit. Em conflito, você escolhe entre abortar e deixar em andamento. |
| `s` | Busca commits já carregados por mensagem (assunto e corpo), autor, e-mail ou hash, sem diferenciar maiúsculas: digite e a seleção pula para o primeiro resultado a partir de onde você estava; `Enter` confirma, `Esc` cancela e volta. |
| `n` / `N` | Próximo / anterior resultado da busca (voltam ao início/fim ao chegar na ponta). `Esc` limpa a busca. |
| `/` | Filtra por uma ou mais branches: digite para buscar, `↑`/`↓` movem, `Espaço` marca/desmarca, `Enter` aplica, `Esc` cancela |
| `q` | Sai |

**Mouse.** Clique em um commit para selecioná-lo, dê **duplo clique** para abrir a visão do commit (como `Enter`) e use a roda para mover a seleção (3 commits por passo). Na **visão do commit**, clique em um arquivo para selecioná-lo (ou na mensagem, para focá-la), dê duplo clique para abrir o diff dele e use a roda para rolar a mensagem ou mover a seleção de arquivos. Com um diálogo ou o diff aberto, o mouse é ignorado. Com o mouse ligado o terminal não seleciona texto por arraste; segure `Shift` (`Option` no iTerm2 e no Terminal do macOS) ou use `--no-mouse`.

**Busca (`s`).** O cabeçalho mostra `busca "texto" 3/12` (posição do cursor entre os resultados e o total; `-` quando o cursor não está num resultado) e os commits que casam levam o assunto em amarelo e negrito, com `*` no lugar do marcador `>` (para funcionar também com `--no-color`). A busca é em memória, só nos commits **já carregados** (a lista cresce sob demanda; um `+` depois do total avisa que há mais histórico). Trocar o filtro de branch (`/`) mantém a busca e a aplica à nova lista. Escolhi `s` para a busca porque `/` já é o filtro de branch.

O painel abaixo da lista mostra os detalhes do commit selecionado.

No filtro (`/`), marque quantas branches quiser com `Espaço`: o grafo mostra os commits alcançáveis de qualquer uma delas (a união, como `git log a b`). `Enter` aplica as marcadas; sem nenhuma marcada, aplica a branch destacada. As marcas continuam valendo enquanto você digita para filtrar a lista, e reabrir o seletor mostra o filtro atual marcado. Para voltar a todas as branches, aperte `Espaço` em "(todas as branches)" e `Enter`.

Quando a branch local está desatualizada em relação à remota, a lista do `c` traz três opções: `x e pull de origin/x` (já selecionada), `x (sem pull)` e HEAD destacado no commit. O pull é `git pull --ff-only <remota> <branch>`: só avança por fast-forward e nunca cria merge nem rebase. Se as branches divergiram, ou há alterações locais que seriam sobrescritas, o git recusa; como a troca de branch já aconteceu, a mensagem diz "checkout feito para x, mas o pull falhou: ...". O pull fala com a rede sem prompts de terminal: as credenciais precisam estar disponíveis sem interação (ssh-agent, credential helper) e há um limite de 2 minutos.

O cabeçalho mostra a **branch atual** (`atual: main`; com o HEAD destacado, `atual: HEAD destacado em abc1234`) e avisa quando há um merge em andamento. Ele acompanha checkouts e merges.

**Merge (`m`).** É o `git merge --no-edit` normal: faz fast-forward quando dá e, senão, um merge commit com a mensagem automática do git (a TUI não abre editor). A origem é a branch cuja ponta é o commit selecionado (locais e remotas, menos a atual); sem nenhuma, o próprio commit. Não faz merge num stash, com o HEAD destacado nem do commit em que a branch atual já está. Se o git recusar (por exemplo, alterações locais seriam sobrescritas), nada muda e a mensagem aparece no rodapé. Se houver **conflitos**, o merge fica em andamento, o cabeçalho passa a dizer isso e um diálogo lista os arquivos e oferece: `a` abortar (`git merge --abort`, que restaura tudo) ou `d`/`Esc` deixar em andamento para você resolver no terminal. Mesmo depois de deixar em andamento, `m` reabre o diálogo para abortar. Se um commit de merge precisar de assinatura GPG com senha, o pedido de senha pode atrapalhar a tela.

O checkout nunca usa `--force`: se houver alterações locais que seriam sobrescritas (ou a branch estiver em uso em outro worktree), o git recusa, nada muda e a mensagem aparece no rodapé.

### Saída por pipe

Fora de um terminal, o grafo sai em texto puro, sem cor e sem quebra de linha, como o `git log`:

```sh
gitgraph | less
gitgraph -n 20 > grafo.txt
```

### Observações

- `--no-color` desliga também negrito e esmaecido (o Ink trata a flag assim). A linha selecionada continua marcada com `>`.
- `--ascii` não remove acentos dos textos; a truncagem de linhas longas usa `…`, que vem do Ink.
- Códigos de saída: `0` sucesso, `1` erro (fora de um repositório, `git` ausente...), `2` erro de uso.

## Desenvolvimento

```sh
npm run dev        # executa a CLI com tsx
npm test           # testes (Vitest)
npm run typecheck  # tsc --noEmit
npm run build      # gera dist/
```

A arquitetura e as convenções estão em [`docs/ia/`](docs/ia/ARCHITECTURE.md).

## Licença

[MIT](LICENSE)
