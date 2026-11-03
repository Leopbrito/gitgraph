# Publicação no npm

O pacote se chama **`git-graph-tui`** e instala o comando **`gitgraph`** (o campo `bin` é independente do nome do pacote). O nome `gitgraph` já pertence a outro pacote no npm, e `gitgraph-tui` e `gitgraph-cli` também. Para mudar o nome, altere `name` em `package.json` e as instruções de instalação do README; nada mais depende dele.

**Publicar é uma ação externa e irreversível** (uma versão publicada não pode ser reutilizada, só despublicada em até 72 horas). Nenhum agente publica sem pedido explícito; o fluxo normal é o workflow de release.

## O que vai no pacote

`files` em `package.json` limita a publicação a `dist/`, `README.md` e `LICENSE` (o `package.json` entra sempre). Nada de `src/`, `tests/` nem `docs/`. Confira com:

```sh
npm pack --dry-run
```

O `prebuild` apaga `dist/` antes de compilar, para arquivos de uma compilação antiga não irem junto. O `bin` aponta para `dist/cli.js`, que começa com `#!/usr/bin/env node`; o npm marca o arquivo como executável na instalação.

## Versionamento

[SemVer](https://semver.org/lang/pt-BR/): enquanto estiver em `0.x`, uma mudança incompatível (opção removida, tecla trocada, formato do arquivo de configuração) sobe o número do meio (`0.1.0` → `0.2.0`), e correções e novidades compatíveis sobem o último. A `1.0.0` sai quando a interface de linha de comando e o formato do `config.json` forem considerados estáveis.

## Como lançar uma versão

1. Na `main`, com tudo commitado e a CI verde: `npm version minor` (ou `patch`/`major`). Isso muda `package.json`, cria o commit e a tag `vX.Y.Z`.
2. `git push --follow-tags`.
3. O workflow `.github/workflows/release.yml` confere que a tag bate com a versão do `package.json`, roda `prepublishOnly` (typecheck, testes e build), publica com `--provenance` e cria a release no GitHub com as notas geradas dos commits.

### Configuração única

Duas formas de o workflow se autenticar no npm; o npm tenta a primeira e cai na segunda ([docs](https://docs.npmjs.com/trusted-publishers)).

**1. Trusted publishing (OIDC), recomendado: nenhum segredo guardado.** Exige npm CLI 11.5.1+ e Node 22.14+ (o workflow atualiza o npm) e `id-token: write` (já está nas permissões). Falta só o cadastro, que é no site e só o dono do pacote faz:

1. npmjs.com → pacote `git-graph-tui` → *Settings* → *Trusted publishing* → GitHub Actions.
2. Preencha **Organization or user** = `Leopbrito`, **Repository** = `gitgraph`, **Workflow filename** = `release.yml` (só o nome, com a extensão; tudo diferencia maiúsculas). O `repository.url` do `package.json` tem de bater com o repositório.
3. O npm não valida ao salvar: o erro só aparece ao publicar, e uma configuração nova expira se não houver uma publicação bem-sucedida em 2 dias. Faça a próxima versão logo em seguida.
4. Depois de uma publicação que funcionou por OIDC: apague o bloco `env: NODE_AUTH_TOKEN` do passo de publicação, **revogue o token** no npm, apague o secret `NPM_TOKEN` do repositório e, em *Publishing access*, marque "Require two-factor authentication and disallow tokens". A proveniência passa a ser gerada sozinha (o `--provenance` pode ficar ou sair).

Limites: só runners hospedados pelo GitHub; sem cache no build de release (por isso o `package-manager-cache: false`).

**2. Token de automação (o fallback, enquanto o passo 1 não foi feito).** Crie um token no npm (Access Tokens → Granular, com permissão de publicação) e guarde-o em *Settings → Secrets and variables → Actions* do repositório como `NPM_TOKEN`. Nunca em arquivo, commit ou conversa.

Em qualquer caso, a primeira publicação de um nome novo reivindica o nome: confira antes que `npm view git-graph-tui` ainda dá 404.

## Publicar à mão (sem o workflow)

```sh
npm login
npm publish --dry-run   # confira
npm publish
```

`prepublishOnly` roda typecheck, testes e build antes. A proveniência (`--provenance`) só existe em CI.

## Testando a instalação antes de publicar

```sh
npm pack                       # gera git-graph-tui-X.Y.Z.tgz
mkdir /tmp/try && cd /tmp/try && npm init -y && npm install /caminho/git-graph-tui-X.Y.Z.tgz
./node_modules/.bin/gitgraph --version
```
