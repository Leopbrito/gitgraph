# AGENTS.md

Guide for AI agents working in this repository.

## About the project

`gitgraph` is a CLI that shows the branch graph of a git repository in the terminal.
The interface is built with [Ink](https://github.com/vadimdemedes/ink) (React for CLIs).

## Documentation for agents

Read before changing the code:

- [`docs/ia/ARCHITECTURE.md`](docs/ia/ARCHITECTURE.md): overview of the architecture, modules and data flow.
- [`docs/ia/conventions/`](docs/ia/conventions/): conventions for code, tests, commits etc. One file per topic.

When an architecture or convention decision changes, update these documents in the same piece of work.

## General rules

- Write the code, the comments, the interface texts and the documentation in English.
- Make small, focused changes.
- Do not commit or push without an explicit request. Before committing, show the diff and the proposed message and wait for approval.
- Do not add dependencies without justifying the need.
