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
gitgraph [opções] [<revisão>...] [-- <caminho>...]
```

| Opção | Efeito |
| --- | --- |
| `--author <padrão>` | Só commits cujo autor casa com o padrão (expressão regular, como no `git log --author`). |
| `--since <data>`, `--until <data>` | Só commits depois / até a data (`"2 weeks ago"`, `2026-01-31`; o git ignora datas no futuro). |
| `--first-parent` | Segue só o primeiro pai de cada merge: mostra a história da branch principal sem os commits que entraram por merge. |
| `--no-remotes`, `--no-tags` | Escondem as branches remotas / as tags da listagem de "todas as refs" (não valem com revisões explícitas). |
| `-C <caminho>` | Abre o repositório de outro diretório, sem precisar de `cd` (como `git -C`). |
| `-n`, `--max-count <n>` | Mostra no máximo `n` commits. Sem ela, a interface carrega 500 e busca mais conforme você desce, e a saída por pipe imprime tudo. |
| `--no-color` | Desliga as cores (também vale a variável `NO_COLOR`). |
| `--ascii` | Usa só caracteres ASCII no grafo e nos símbolos da interface. |
| `--compact` | Uma linha por commit, sem a linha de ligação (`│`) entre eles. Por padrão, commits seguidos são ligados por um traço, o que ocupa mais linhas. |
| `--date <formato>` | Formato das datas: `short` (padrão: `2026-03-04` na lista e `2026-03-04 10:00` nos detalhes), `iso` (data e hora em todo lugar) ou `relative` (`há 3 dias`, `ontem`; nos detalhes, com a hora exata entre parênteses). Vale também no pipe. A data é a do autor, no fuso em que foi gravada. |
| `--order <ordem>` | Ordem dos commits: `date` (padrão, por data do commit), `author-date` (por data do autor) ou `topo` (mantém cada linha de história junta). A ordem por data intercala as branches e deixa o grafo bem mais estreito; `topo` pode ser melhor em históricos com poucas branches longas e simultâneas. |
| `--no-stash` | Não mostra os stashes no grafo. |
| `--watch` | Recarrega o grafo sozinho quando o repositório muda fora da interface (commit, checkout, fetch em outro terminal). Observa `HEAD`, o índice, `packed-refs` e `refs/` com espera de 300 ms. Sem a opção, use `r`. |
| `--no-uncommitted` | Não mostra o nó das alterações não commitadas (`--uncommitted` mostra, é o padrão). |
| `--no-mouse` | Desliga o suporte a mouse (veja abaixo). |
| `-h`, `--help` | Mostra a ajuda. |
| `-v`, `--version` | Mostra a versão. |

**Revisões e caminhos.** Sem argumentos, mostra todas as branches locais e remotas e as tags. Com revisões (`gitgraph main feature-x`, `gitgraph v1.0..main`, um hash), mostra só o que é alcançável delas; na interface, elas viram o filtro de branch inicial (`/` muda). Depois de `--`, limita o histórico aos commits que mexeram nos caminhos (`gitgraph -- src/`), com o grafo religado entre os commits que sobram. Os filtros acima se combinam entre si, valem na interface e no pipe e aparecem em magenta no cabeçalho (`autor Ana, sem tags`). Com `--author`/`--since`/`--until` os commits que sobram ficam sem ligação com os escondidos: o grafo mostra só as ligações entre eles. Uma revisão inexistente é erro (`revisão desconhecida: x`); `--` separa revisões de caminhos quando o nome é ambíguo. Vale também na saída por pipe.

Mostra todas as branches locais e remotas e as tags. Se o repositório tem alterações não commitadas, um nó oco (`○`, `o` com `--ascii`) rotulado `working` aparece logo acima do commit do HEAD (e acima dos stashes dele) com a contagem de arquivos: `Alterações não commitadas (2 staged, 1 modificado, 3 não rastreados)`. Um arquivo com mudanças no índice e fora dele conta nas duas categorias, e conflitos aparecem à parte. O nó só existe se houver mudanças e se o HEAD estiver na lista (um filtro de branch ou `-n` pode escondê-lo); `r` o atualiza, e ele não é um commit: `Enter`, `y`, `c` e `m` só avisam. O painel de detalhes diz sobre qual HEAD ele está. Cada **stash** aparece como um nó oco (`○`, `o` com `--ascii`) com o rótulo `(stash@{0})`, logo acima do commit em que foi feito; os commits internos que o git cria para o stash (índice e arquivos não rastreados) ficam escondidos. Um stash só aparece se o commit-base estiver na lista (por exemplo, `-n` pode cortá-lo, e um filtro de branch que não inclua o commit-base também). Use `--no-stash` para não mostrá-los.

### Escopo

O `gitgraph` é um visualizador de histórico com algumas ações (checkout, merge, stash, branches e tags, fetch, cherry-pick, revert e reset), não um cliente git completo. **Ele não inicia rebase**, de propósito: o rebase reescreve vários commits e para em conflitos em série, o que pede um fluxo mais longo do que uma pergunta. Se um rebase (ou cherry-pick, revert ou merge) estiver **parado ou em andamento** no repositório, por exemplo iniciado em outro terminal, o cabeçalho mostra `(rebase em andamento)` e `m` abre um diálogo para **abortar** (`a`), **continuar** (`c`, depois de resolver os conflitos no terminal), **pular o passo** (`s`) ou **deixar** (`d`/`Esc`). A mensagem do commit é sempre a que o git propõe: a TUI não abre editor.

### Arquivo de configuração

Os padrões podem ficar em `$XDG_CONFIG_HOME/gitgraph/config.json` (ou `~/.config/gitgraph/config.json`). Todas as chaves são opcionais:

```json
{
  "order": "date",
  "date": "relative",
  "compact": false,
  "ascii": false,
  "color": true,
  "stash": true,
  "mouse": true,
  "watch": false,
  "maxCount": 500,
  "colors": {"lanes": ["cyan", "magenta", "#ff8800", "greenBright"]}
}
```

A precedência é **padrões do programa < arquivo < opções da linha de comando**. Para que uma opção da linha de comando possa desfazer o arquivo, cada opção liga/desliga tem as duas formas: `--compact`/`--no-compact`, `--ascii`/`--no-ascii`, `--color`/`--no-color`, `--stash`/`--no-stash`, `--mouse`/`--no-mouse` e `--watch`/`--no-watch` (se vierem as duas, a negativa vence). A variável `NO_COLOR` fica entre o padrão e o arquivo: o arquivo (`"color": true`) e `--color` a sobrepõem. `colors.lanes` troca as cores das lanes do grafo, usadas em ordem e repetidas (nomes como `red` e `cyanBright`, ou `#rrggbb`). Um arquivo inválido é erro com o nome do arquivo e da chave (uma chave desconhecida também, para um erro de digitação não passar em silêncio); `--help` e `--version` funcionam mesmo assim. **Atalhos de teclado ainda não são configuráveis**: ficam para depois de a tabela de teclas ser única (veja a tela de ajuda).

### Teclas (modo interativo)

O rodapé mostra só as principais; **`?` abre a lista completa** dentro da interface e `gitgraph --help` a imprime junto das opções. As três saem da mesma tabela (`src/ui/keymap.ts`), então não divergem.

| Tecla | Ação |
| --- | --- |
| `j` / `↓`, `k` / `↑` | Move a seleção |
| `PgDn`, `PgUp` | Anda uma página |
| `Enter` / `d` | Abre a **visão do commit** em tela cheia: mensagem completa, arquivos alterados (status `A`/`M`/`D`/`R`, linhas `+`/`-`, `bin` para binários) e diff. `Tab` alterna entre mensagem e arquivos; `j`/`k`/`PgUp`/`PgDn`/`g`/`G` movem ou rolam. Nela, `Enter` abre o arquivo selecionado **lado a lado**: à esquerda a versão anterior, à direita a nova, o arquivo inteiro alinhado, com linhas removidas (`-`, vermelho) e adicionadas (`+`, verde) destacadas; abre já na primeira mudança, e `n`/`N` pulam para a próxima/anterior. `u` alterna para o diff unificado (hunks `@@`); arquivos binários abrem direto no unificado. `d` mostra o diff unificado do commit inteiro. `Esc`/`q` volta (do diff para a visão, da visão para a lista). Num merge ou stash o diff é contra o primeiro pai. Diffs de commit com mais de 5000 linhas (20000 no lado a lado) são cortados, com aviso. Linhas longas são truncadas, sem rolagem horizontal. |
| `c` | Checkout do commit selecionado, com confirmação (`Enter`/`y` confirma, `Esc`/`n` cancela). Troca para a branch local que aponta para o commit (uma lista, se forem várias) ou deixa o HEAD destacado nele. Num stash, só avisa que não dá para fazer checkout. Se o commit é a ponta de uma branch remota (`origin/x`) e a branch local `x` está em outro commit, a lista oferece também **`x` e pull**. |
| `h` / `←`, `l` / `→` | **Rola o grafo** na horizontal (2 colunas por vez) quando ele é mais largo que o terminal. A área do grafo é limitada para o texto do commit (hash, assunto, autor) continuar visível; o cabeçalho mostra `grafo 5-30/50 (h/l)` com as colunas em vista. Mover a seleção para um commit fora da janela a traz de volta ao nó dele. Em grafos estreitos, não faz nada. |
| `g` / `Home`, `G` / `End` | Vai ao início, ao fim |
| `m` | Com uma operação parada (cherry-pick, revert, rebase): abre o diálogo de abortar, continuar, pular ou deixar. Senão, merge na branch atual, com confirmação (`Enter`/`y` confirma, `Esc`/`n` cancela): da branch que aponta para o commit selecionado (uma lista, se forem várias, incluindo remotas) ou do próprio commit. Em conflito, você escolhe entre abortar e deixar em andamento. |
| `C` / `v` | **Cherry-pick** / **revert** do commit selecionado na branch atual, com confirmação (`Enter`/`y`). Cria um commit novo (a mensagem é a original no cherry-pick e a do git no revert: a TUI não abre editor). Num commit de merge usa o 1º pai (`-m 1`). Se parar em **conflitos** (ou num resultado vazio), o diálogo da operação em andamento abre sozinho: abortar, continuar, pular ou deixar. Alterações locais que atrapalhem fazem o git recusar sem mudar nada. |
| `X` | **Reset** da branch atual para o commit selecionado: `--soft` (mantém índice e arquivos), `--mixed` (mantém os arquivos, desfaz o stage) ou `--hard`. O título mostra antes o efeito: quantos commits saem da branch e quantos deles só ficam no reflog (nenhuma outra ref os alcança). O `--hard` mostra também quantos arquivos modificados serão descartados e só roda se você **digitar o nome da branch** (`descartar`, com o HEAD destacado). |
| `b` / `t` / `T` | Cria uma **branch** / uma **tag** / uma **tag anotada** (pede também a mensagem) no commit selecionado, sem trocar de branch. Digite o nome e `Enter`; o nome é validado com `git check-ref-format` (sem espaços, `..`, `~`, `^`, `:`) e recusado se já existir. `Esc` cancela. |
| `R` | **Renomeia** uma branch local (inclusive a atual) ou uma tag do commit selecionado; com várias refs no commit, pergunta qual. A tag renomeada continua anotada. Branches remotas não são editadas. |
| `D` | **Apaga** uma branch local ou uma tag do commit, com confirmação. A branch atual não aparece (o git recusa). Uma branch **não mesclada** é recusada pelo `git branch -d`: a tela diz quantos commits só ela tem e só apaga (`-D`) se você digitar o nome dela. |
| `a` / `p` / `x` | Num **stash**: `a` aplica (`git stash apply`, o stash continua guardado), `p` dá pop (aplica e remove) e `x` apaga (`git stash drop`, com confirmação: `Enter`/`y` confirma, `Esc`/`n` cancela; o git não devolve um stash apagado). O stash é achado pelo hash do commit, não pelo número `stash@{n}`, que muda quando outro stash é criado ou removido, mesmo em outro terminal; se ele já sumiu, nada é tocado. Se as alterações locais atrapalham, o git recusa e nada muda. Com **conflitos**, as marcas ficam nos arquivos, o stash é mantido e o rodapé lista os arquivos para você resolver no terminal. Depois de cada operação o grafo é recarregado (as alterações aparecem no nó `working`). |
| `f` | Busca as remotas (`git fetch --all --prune`) em segundo plano, sem travar a interface: o cabeçalho mostra `buscando remotas…` e, ao terminar, o grafo é recarregado mantendo a seleção. Sem prompts de terminal: as credenciais precisam estar disponíveis (ssh-agent, credential helper), senão o rodapé mostra o erro e como resolver; limite de 2 minutos. |
| `y` | Copia o hash completo do commit selecionado para a área de transferência. Usa `pbcopy` (macOS), `wl-copy`/`xclip`/`xsel` (Linux, conforme `WAYLAND_DISPLAY`/`DISPLAY`) ou `clip` (Windows) e confirma no rodapé. Por SSH, ou se nenhum programa existir, usa a sequência **OSC 52** do terminal; como ela não tem resposta, o rodapé mostra o hash inteiro para você pegar à mão se nada colar. Dentro do tmux é preciso `set -g set-clipboard on`. |
| `r` | Recarrega o grafo (log, refs e stashes) mantendo o commit selecionado pelo hash; se ele sumiu (reset, branch apagada), vai para o ancestral mais próximo que ainda está na lista. O rodapé avisa `atualizado`. |
| `s` | Busca commits por mensagem (assunto e corpo), autor, e-mail ou hash, sem diferenciar maiúsculas: digite e a seleção pula para o primeiro resultado a partir de onde você estava; `Enter` confirma, `Esc` cancela e volta. |
| `n` / `N` | Próximo / anterior resultado da busca (o `n` carrega mais histórico se precisar; ao fim do histórico voltam ao outro lado). `Esc` limpa a busca. |
| `/` | Filtra por uma ou mais branches: digite para buscar, `↑`/`↓` movem, `Espaço` marca/desmarca, `Enter` aplica, `Esc` cancela |
| `?` | Abre a **tela de ajuda** com todas as teclas (rola com `j`/`k`/`PgUp`/`PgDn`; `?`, `Esc` ou `q` fecham). A mesma lista sai em `gitgraph --help`. |
| `q` | Sai |

**Mouse.** Clique em um commit para selecioná-lo, dê **duplo clique** para abrir a visão do commit (como `Enter`) e use a roda para mover a seleção (3 commits por passo). Na **visão do commit**, clique em um arquivo para selecioná-lo (ou na mensagem, para focá-la), dê duplo clique para abrir o diff dele e use a roda para rolar a mensagem ou mover a seleção de arquivos. Com um diálogo ou o diff aberto, o mouse é ignorado. Com o mouse ligado o terminal não seleciona texto por arraste; segure `Shift` (`Option` no iTerm2 e no Terminal do macOS) ou use `--no-mouse`.

**Busca (`s`).** O cabeçalho mostra `busca "texto" 3/12` (posição do cursor entre os resultados e o total; `-` quando o cursor não está num resultado) e os commits que casam levam o assunto em amarelo e negrito, com `*` no lugar do marcador `>` (para funcionar também com `--no-color`). A busca casa em memória, mas **chega ao histórico ainda não carregado**: se `Enter` não acha nada nos commits carregados, ou o `n` passa do último resultado carregado, a lista é carregada em doses (o limite dobra a cada vez) até aparecer uma correspondência ou o histórico acabar; o rodapé mostra `procurando "x" no histórico…` e `Esc` cancela. Acabando o histórico, a busca volta ao primeiro resultado ou avisa que não há nenhum. Com `-n`, o teto vale (não se carrega além dele). Um `+` depois do total avisa que há mais histórico a carregar. O `N` (anterior) só anda entre os resultados já carregados. Trocar o filtro de branch (`/`) mantém a busca e a aplica à nova lista. Escolhi `s` para a busca porque `/` já é o filtro de branch.

O painel abaixo da lista mostra os detalhes do commit selecionado.

No filtro (`/`), marque quantas branches quiser com `Espaço`: o grafo mostra os commits alcançáveis de qualquer uma delas (a união, como `git log a b`). `Enter` aplica as marcadas; sem nenhuma marcada, aplica a branch destacada. As marcas continuam valendo enquanto você digita para filtrar a lista, e reabrir o seletor mostra o filtro atual marcado. Para voltar a todas as branches, aperte `Espaço` em "(todas as branches)" e `Enter`.

Quando a branch local está desatualizada em relação à remota, a lista do `c` traz três opções: `x e pull de origin/x` (já selecionada), `x (sem pull)` e HEAD destacado no commit. O pull é `git pull --ff-only <remota> <branch>`: só avança por fast-forward e nunca cria merge nem rebase. Se as branches divergiram, ou há alterações locais que seriam sobrescritas, o git recusa; como a troca de branch já aconteceu, a mensagem diz "checkout feito para x, mas o pull falhou: ...". O pull fala com a rede sem prompts de terminal: as credenciais precisam estar disponíveis sem interação (ssh-agent, credential helper) e há um limite de 2 minutos.

O cabeçalho mostra a **branch atual** (`atual: main`; com o HEAD destacado, `atual: HEAD destacado em abc1234`) e avisa quando há um merge em andamento. Ele acompanha checkouts e merges. Ao lado do nome, `↑2 ↓3` diz quantos commits a branch tem a mais e a menos que a remota que acompanha (`^2 v3` com `--ascii`); nada aparece sem upstream, com os dois lados iguais ou com o upstream apagado na remota. As contagens usam as refs remotas já baixadas, então `f` (fetch) as atualiza.

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
