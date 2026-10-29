import React from 'react';
import {render} from 'ink-testing-library';
import {describe, expect, it, vi} from 'vitest';
import type {RefInfo} from '../../src/git/refs.js';
import {layoutGraph} from '../../src/graph/layout.js';
import type {Commit} from '../../src/graph/types.js';
import {Browser, type GraphData, type LoadGraph} from '../../src/ui/Browser.js';

const commit = (n: number, parents: string[]): Commit => ({
  hash: `h${String(n).padStart(6, '0')}`,
  parents,
  author: 'Ana',
  email: 'ana@example.com',
  date: '2026-03-04T10:00:00+00:00',
  subject: `commit ${n}`,
  body: '',
});

/** Histórico linear de `count` commits (o 0 é o mais novo). */
function linear(count: number): Commit[] {
  return Array.from({length: count}, (_, i) =>
    commit(i, i + 1 < count ? [commit(i + 1, []).hash] : []),
  );
}

const refs: RefInfo = {
  byCommit: new Map([
    ['h000000', [{name: 'main', kind: 'branch'}]],
    ['h000002', [{name: 'feature', kind: 'branch'}]],
  ]),
  head: {hash: 'h000000', branch: 'main'},
};

const data = (count: number): GraphData => ({rows: layoutGraph(linear(count)), refs});

const tick = () => new Promise(resolve => setTimeout(resolve, 30));

async function press(stdin: {write: (s: string) => void}, ...keys: string[]) {
  for (const key of keys) {
    stdin.write(key);
    await tick();
  }
}

describe('Browser', () => {
  it('mostra cabeçalho, commits e detalhes do primeiro commit', () => {
    const load = vi.fn<LoadGraph>();
    const {lastFrame} = render(<Browser initial={data(5)} initialLimit={100} load={load} />);
    const frame = lastFrame() ?? '';
    expect(frame).toContain('todas as branches');
    expect(frame).toContain('1/5');
    expect(frame).toContain('commit 0');
    expect(frame).toContain('h000000');
    expect(frame).toContain('ana@example.com');
    expect(frame).toContain('pais: h000001');
  });

  it('move a seleção com j/k e mostra o detalhe do commit selecionado', async () => {
    const load = vi.fn<LoadGraph>();
    const {lastFrame, stdin} = render(<Browser initial={data(5)} initialLimit={100} load={load} />);
    await press(stdin, 'j', 'j');
    expect(lastFrame()).toContain('3/5');
    expect(lastFrame()).toContain('h000002');
    await press(stdin, 'k');
    expect(lastFrame()).toContain('2/5');
  });

  it('G vai ao último commit e g volta ao primeiro; não passa dos limites', async () => {
    const load = vi.fn<LoadGraph>();
    const {lastFrame, stdin} = render(<Browser initial={data(5)} initialLimit={100} load={load} />);
    await press(stdin, 'G', 'j');
    expect(lastFrame()).toContain('5/5');
    expect(lastFrame()).toContain('commit raiz');
    await press(stdin, 'g', 'k');
    expect(lastFrame()).toContain('1/5');
  });

  it('filtra por branch: abre o seletor, digita, confirma e recarrega', async () => {
    const load = vi.fn<LoadGraph>().mockResolvedValue(data(2));
    const {lastFrame, stdin} = render(<Browser initial={data(5)} initialLimit={100} load={load} />);
    await press(stdin, '/');
    expect(lastFrame()).toContain('Branch:');
    expect(lastFrame()).toContain('(todas as branches)');
    await press(stdin, 'f', 'e', 'a');
    expect(lastFrame()).toContain('feature');
    expect(lastFrame()).not.toContain('(todas as branches)');
    await press(stdin, '\r');
    await tick();
    expect(load).toHaveBeenCalledWith('feature', 100);
    expect(lastFrame()).toContain('feature · 1/2');
    expect(lastFrame()).not.toContain('Branch:');
  });

  it('Esc cancela o seletor sem recarregar', async () => {
    const load = vi.fn<LoadGraph>();
    const {lastFrame, stdin} = render(<Browser initial={data(5)} initialLimit={100} load={load} />);
    await press(stdin, '/', 'm');
    await press(stdin, '\u001b');
    await tick();
    expect(lastFrame()).not.toContain('Branch:');
    expect(load).not.toHaveBeenCalled();
  });

  it('busca mais histórico ao chegar perto do fim com a lista cheia', async () => {
    const load = vi.fn<LoadGraph>().mockResolvedValue(data(60));
    const {lastFrame, stdin} = render(<Browser initial={data(30)} initialLimit={30} load={load} />);
    await press(stdin, 'G');
    await tick();
    expect(load).toHaveBeenCalledWith(null, 60);
    expect(lastFrame()).toContain('/60');
  });

  it('não busca mais quando a lista não está cheia', async () => {
    const load = vi.fn<LoadGraph>();
    const {stdin} = render(<Browser initial={data(5)} initialLimit={100} load={load} />);
    await press(stdin, 'G');
    expect(load).not.toHaveBeenCalled();
  });

  it('mostra o erro de carregamento no rodapé', async () => {
    const load = vi.fn<LoadGraph>().mockRejectedValue(new Error('revisão inválida'));
    const {lastFrame, stdin} = render(<Browser initial={data(5)} initialLimit={100} load={load} />);
    await press(stdin, '/', '\u001b[B', '\r');
    await tick();
    expect(lastFrame()).toContain('erro: revisão inválida');
  });

  it('funciona sem commits', () => {
    const load = vi.fn<LoadGraph>();
    const empty: GraphData = {rows: [], refs: {byCommit: new Map(), head: {hash: null, branch: 'main'}}};
    const {lastFrame} = render(<Browser initial={empty} initialLimit={100} load={load} />);
    expect(lastFrame()).toContain('Nenhum commit');
    expect(lastFrame()).toContain('0/0');
  });
});
