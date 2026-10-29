# AGENTS.md

Guia para agentes de IA que trabalham neste repositório.

## Sobre o projeto

`gitgraph` é uma CLI que mostra o grafo de branches de um repositório git no terminal.
A interface é construída com [Ink](https://github.com/vadimdemedes/ink) (React para CLIs).

## Documentação para agentes

Leia antes de alterar o código:

- [`docs/ia/ARCHITECTURE.md`](docs/ia/ARCHITECTURE.md): visão geral da arquitetura, módulos e fluxo de dados.
- [`docs/ia/conventions/`](docs/ia/conventions/): convenções de código, testes, commits etc. Um arquivo por tema.

Quando uma decisão de arquitetura ou convenção mudar, atualize esses documentos no mesmo trabalho.

## Regras gerais

- Responda e documente em português do Brasil.
- Faça mudanças pequenas e focadas.
- Não faça commit nem push sem pedido explícito. Antes de commitar, mostre o diff e a mensagem proposta e espere aprovação.
- Não adicione dependências sem justificar a necessidade.
