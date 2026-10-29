import React from 'react';
import {render} from 'ink-testing-library';
import {describe, expect, it, vi} from 'vitest';
import type {RefInfo} from '../../src/git/refs.js';
import {layoutGraph} from '../../src/graph/layout.js';
import type {Commit} from '../../src/graph/types.js';
import {PartialCheckoutError, type CheckoutTarget} from '../../src/git/checkout.js';
import {Browser as BrowserView, type GraphData, type LoadGraph} from '../../src/ui/Browser.js';
import {DisplayContext} from '../../src/ui/display.js';

const noCheckout = () => Promise.resolve();

/** The real Browser with a harmless default `checkout`, so older tests need not pass one. */
function Browser(props: Omit<React.ComponentProps<typeof BrowserView>, 'checkout'> & {
  checkout?: (target: CheckoutTarget) => Promise<void>;
}) {
  return <BrowserView checkout={noCheckout} {...props} />;
}

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
    expect(load).toHaveBeenCalledWith(['feature'], 100);
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
    expect(load).toHaveBeenCalledWith([], 60);
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

  it('marca a linha selecionada com > mesmo sem estilos', async () => {
    const load = vi.fn<LoadGraph>();
    const {lastFrame, stdin} = render(<Browser initial={data(5)} initialLimit={100} load={load} />);
    const marked = () => (lastFrame() ?? '').split('\n').filter(l => /● >h0000/.test(l) || / >h0000/.test(l));
    expect(lastFrame()).toMatch(/● >h000000/);
    await press(stdin, 'j');
    expect(lastFrame()).toMatch(/● >h000001/);
    expect(lastFrame()).not.toMatch(/● >h000000/);
    expect(marked().length).toBe(1);
  });

  it('respeita o teto de commits (--max-count) e não busca além dele', async () => {
    const load = vi.fn<LoadGraph>().mockResolvedValue(data(40));
    const {lastFrame, stdin} = render(
      <Browser initial={data(30)} initialLimit={30} maxCommits={40} load={load} />,
    );
    await press(stdin, 'G');
    await tick();
    // 30 -> min(60, 40) = 40; ao atingir o teto, não pede mais.
    expect(load).toHaveBeenCalledTimes(1);
    expect(load).toHaveBeenCalledWith([], 40);
    await press(stdin, 'G', 'k', 'G');
    expect(load).toHaveBeenCalledTimes(1);
    expect(lastFrame()).not.toContain('/40+');
  });

  it('não busca nada quando o teto já foi atingido de início', async () => {
    const load = vi.fn<LoadGraph>();
    const {stdin} = render(<Browser initial={data(30)} initialLimit={30} maxCommits={30} load={load} />);
    await press(stdin, 'G');
    expect(load).not.toHaveBeenCalled();
  });

  it('usa só ASCII nos textos de interface com ascii: true', () => {
    const load = vi.fn<LoadGraph>();
    const {lastFrame} = render(
      <DisplayContext.Provider value={{color: false, ascii: true, spaced: true}}>
        <Browser initial={data(5)} initialLimit={100} load={load} />
      </DisplayContext.Provider>,
    );
    const frame = lastFrame() ?? '';
    expect(frame).toContain('Up/Down');
    expect(frame).toContain('gitgraph | todas as branches | 1/5');
    expect(frame).toContain('*');
    expect(frame).not.toMatch(/[●│─·↑↓]/);
  });

  it('shows fewer commits per screen when connector lines are drawn between them', () => {
    const load = vi.fn<LoadGraph>();
    const visibleCommits = (spaced: boolean) => {
      const {lastFrame} = render(
        <DisplayContext.Provider value={{color: false, ascii: false, spaced}}>
          <Browser initial={data(60)} initialLimit={1000} load={load} />
        </DisplayContext.Provider>,
      );
      return ((lastFrame() ?? '').match(/● [> ]h0/g) ?? []).length;
    };
    const dense = visibleCommits(false);
    const spaced = visibleCommits(true);
    expect(dense).toBeGreaterThan(spaced);
    // Each commit takes two lines instead of one, so about half fit.
    expect(spaced).toBeLessThanOrEqual(Math.ceil(dense / 2) + 1);
  });

  it('keeps the selected commit visible while scrolling with two-line rows', async () => {
    const load = vi.fn<LoadGraph>();
    const {lastFrame, stdin} = render(<Browser initial={data(60)} initialLimit={1000} load={load} />);
    for (let i = 0; i < 30; i++) await press(stdin, 'j');
    expect(lastFrame()).toContain('31/60');
    expect(lastFrame()).toMatch(/● >h000030/);
  });

  describe('checkout', () => {
    const switched = (branch: string, hash: string): GraphData => ({
      rows: data(5).rows,
      refs: {...refs, head: {hash, branch}},
    });

    it('asks for confirmation and switches to the branch at the commit with Enter', async () => {
      const checkout = vi.fn<(t: CheckoutTarget) => Promise<void>>().mockResolvedValue();
      const load = vi.fn<LoadGraph>().mockResolvedValue(switched('feature', 'h000002'));
      const {lastFrame, stdin} = render(
        <Browser initial={data(5)} initialLimit={100} load={load} checkout={checkout} />,
      );
      await press(stdin, 'j', 'j', 'c');
      expect(lastFrame()).toContain('Checkout para feature?');
      expect(lastFrame()).toContain('Enter/y confirma');
      expect(checkout).not.toHaveBeenCalled();

      await press(stdin, '\r');
      await tick();
      expect(checkout).toHaveBeenCalledWith({kind: 'branch', name: 'feature'});
      // Refs are reloaded, so the HEAD marker moves and a notice is shown.
      expect(load).toHaveBeenCalledWith([], 100);
      expect(lastFrame()).toContain('HEAD -> feature');
      expect(lastFrame()).toContain('agora em feature');
      expect(lastFrame()).not.toContain('Checkout para');
    });

    it('also confirms with y', async () => {
      const checkout = vi.fn<(t: CheckoutTarget) => Promise<void>>().mockResolvedValue();
      const load = vi.fn<LoadGraph>().mockResolvedValue(data(5));
      const {stdin} = render(
        <Browser initial={data(5)} initialLimit={100} load={load} checkout={checkout} />,
      );
      await press(stdin, 'j', 'j', 'c', 'y');
      await tick();
      expect(checkout).toHaveBeenCalledTimes(1);
    });

    it.each([['\u001b'], ['n']])('cancels with %j without touching git', async key => {
      const checkout = vi.fn<(t: CheckoutTarget) => Promise<void>>();
      const {lastFrame, stdin} = render(
        <Browser initial={data(5)} initialLimit={100} load={vi.fn()} checkout={checkout} />,
      );
      await press(stdin, 'j', 'c');
      expect(lastFrame()).toContain('Checkout para');
      await press(stdin, key);
      await tick();
      expect(lastFrame()).not.toContain('Checkout para');
      expect(checkout).not.toHaveBeenCalled();
    });

    it('detaches HEAD at a commit that has no local branch', async () => {
      const checkout = vi.fn<(t: CheckoutTarget) => Promise<void>>().mockResolvedValue();
      const load = vi.fn<LoadGraph>().mockResolvedValue(data(5));
      const {lastFrame, stdin} = render(
        <Browser initial={data(5)} initialLimit={100} load={load} checkout={checkout} />,
      );
      await press(stdin, 'j', 'c');
      expect(lastFrame()).toContain('h000001 (HEAD destacado)');
      expect(lastFrame()).toContain('HEAD ficará destacado');
      await press(stdin, '\r');
      await tick();
      expect(checkout).toHaveBeenCalledWith({kind: 'detach', hash: 'h000001'});
    });

    it('lets you pick among several branches at the same commit', async () => {
      const checkout = vi.fn<(t: CheckoutTarget) => Promise<void>>().mockResolvedValue();
      const load = vi.fn<LoadGraph>().mockResolvedValue(data(5));
      const many: GraphData = {
        rows: data(5).rows,
        refs: {
          byCommit: new Map([
            ['h000000', [{name: 'main', kind: 'branch'}]],
            ['h000001', [{name: 'beta', kind: 'branch'}, {name: 'alpha', kind: 'branch'}]],
          ]),
          head: {hash: 'h000000', branch: 'main'},
        },
      };
      const {lastFrame, stdin} = render(
        <Browser initial={many} initialLimit={100} load={load} checkout={checkout} />,
      );
      await press(stdin, 'j', 'c');
      const lines = (lastFrame() ?? '').split('\n');
      expect(lines.some(l => l.includes('Checkout para qual branch?'))).toBe(true);
      // The list is sorted and starts on the first branch: "> alpha", then "beta".
      const selected = lines.findIndex(l => l.includes('> alpha'));
      expect(selected).toBeGreaterThan(-1);
      expect(lines[selected + 1]).toContain('beta');
      await press(stdin, '\u001b[B', '\r');
      await tick();
      expect(checkout).toHaveBeenCalledWith({kind: 'branch', name: 'beta'});
    });

    it('says so, without asking, when HEAD is already there', async () => {
      const checkout = vi.fn<(t: CheckoutTarget) => Promise<void>>();
      const {lastFrame, stdin} = render(
        <Browser initial={data(5)} initialLimit={100} load={vi.fn()} checkout={checkout} />,
      );
      await press(stdin, 'c');
      expect(lastFrame()).toContain('já está em main');
      expect(lastFrame()).not.toContain('Checkout para');
      expect(checkout).not.toHaveBeenCalled();
    });

    it('shows git failures on one line and changes nothing', async () => {
      const checkout = vi
        .fn<(t: CheckoutTarget) => Promise<void>>()
        .mockRejectedValue(
          new Error('error: Your local changes would be overwritten by checkout:\n\ta.txt\nAborting'),
        );
      const load = vi.fn<LoadGraph>();
      const {lastFrame, stdin} = render(
        <Browser initial={data(5)} initialLimit={100} load={load} checkout={checkout} />,
      );
      await press(stdin, 'j', 'j', 'c', '\r');
      await tick();
      expect(lastFrame()).toContain('erro: Your local changes would be overwritten by checkout: a.txt Aborting');
      // The selection stays and nothing was reloaded.
      expect(lastFrame()).toContain('3/5');
      expect(load).not.toHaveBeenCalled();
    });

    it('advertises the key in the footer', () => {
      const {lastFrame} = render(<Browser initial={data(5)} initialLimit={100} load={vi.fn()} />);
      expect(lastFrame()).toContain('c checkout');
      expect(lastFrame()).toContain('q sair');
    });

    it('does nothing without commits', async () => {
      const checkout = vi.fn<(t: CheckoutTarget) => Promise<void>>();
      const empty: GraphData = {rows: [], refs: {byCommit: new Map(), head: {hash: null, branch: 'main'}}};
      const {lastFrame, stdin} = render(
        <Browser initial={empty} initialLimit={100} load={vi.fn()} checkout={checkout} />,
      );
      await press(stdin, 'c');
      expect(lastFrame()).not.toContain('Checkout para');
      expect(checkout).not.toHaveBeenCalled();
    });

    describe('when the local branch is behind its remote', () => {
      // origin/feature is at h000002; the local feature is still at h000004.
      const outOfSync: GraphData = {
        rows: data(5).rows,
        refs: {
          byCommit: new Map([
            ['h000000', [{name: 'main', kind: 'branch'}]],
            ['h000002', [{name: 'origin/feature', kind: 'remote'}]],
            ['h000004', [{name: 'feature', kind: 'branch'}]],
          ]),
          head: {hash: 'h000000', branch: 'main'},
        },
      };
      const open = (checkout: (t: CheckoutTarget) => Promise<void>, load = vi.fn<LoadGraph>()) =>
        render(
          <Browser initial={outOfSync} initialLimit={100} load={load} checkout={checkout} />,
        );

      it('suggests checking out the local branch and pulling, selected by default', async () => {
        const checkout = vi.fn<(t: CheckoutTarget) => Promise<void>>().mockResolvedValue();
        const load = vi.fn<LoadGraph>().mockResolvedValue(outOfSync);
        const {lastFrame, stdin} = open(checkout, load);
        await press(stdin, 'j', 'j', 'c');
        const frame = lastFrame() ?? '';
        expect(frame).toContain('Branch local e remota estão em commits diferentes');
        expect(frame).toContain('> feature e pull de origin/feature');
        expect(frame).toContain('feature (sem pull)');
        expect(frame).toContain('HEAD destacado neste commit');

        await press(stdin, '\r');
        await tick();
        expect(checkout).toHaveBeenCalledWith({kind: 'pull', name: 'feature', remote: 'origin'});
        expect(load).toHaveBeenCalled();
        expect(lastFrame()).toContain('agora em feature (atualizada de origin/feature)');
      });

      it('lets you switch without pulling', async () => {
        const checkout = vi.fn<(t: CheckoutTarget) => Promise<void>>().mockResolvedValue();
        const {stdin} = open(checkout, vi.fn<LoadGraph>().mockResolvedValue(outOfSync));
        await press(stdin, 'j', 'j', 'c', '\u001b[B', '\r');
        await tick();
        expect(checkout).toHaveBeenCalledWith({kind: 'branch', name: 'feature', unsynced: true});
      });

      it('lets you detach HEAD at the selected commit', async () => {
        const checkout = vi.fn<(t: CheckoutTarget) => Promise<void>>().mockResolvedValue();
        const {stdin} = open(checkout, vi.fn<LoadGraph>().mockResolvedValue(outOfSync));
        await press(stdin, 'j', 'j', 'c', '\u001b[B', '\u001b[B', '\r');
        await tick();
        expect(checkout).toHaveBeenCalledWith({kind: 'detach', hash: 'h000002'});
      });

      it('shows a failed pull and still reloads, since the switch happened', async () => {
        const checkout = vi
          .fn<(t: CheckoutTarget) => Promise<void>>()
          .mockRejectedValue(
            new PartialCheckoutError('checkout feito para feature, mas o pull falhou: diverged'),
          );
        const load = vi.fn<LoadGraph>().mockResolvedValue(outOfSync);
        const {lastFrame, stdin} = open(checkout, load);
        await press(stdin, 'j', 'j', 'c', '\r');
        await tick();
        await tick();
        expect(load).toHaveBeenCalled();
        // The reload must not wipe the message.
        expect(lastFrame()).toContain('mas o pull falhou');
      });
    });
  });

  describe('filtering by several branches', () => {
    const DOWN = '\u001b[B';
    // The test refs have two branches, listed as: (todas), feature, main.
    const open = () => {
      const load = vi.fn<LoadGraph>().mockResolvedValue(data(3));
      const view = render(<Browser initial={data(5)} initialLimit={100} load={load} />);
      return {...view, load};
    };

    it('checks branches with Space and applies them all with Enter', async () => {
      const {lastFrame, stdin, load} = open();
      await press(stdin, '/', DOWN, ' ', DOWN, ' ');
      const frame = lastFrame() ?? '';
      expect(frame).toContain('[x] feature');
      expect(frame).toContain('[x] main');
      expect(frame).toContain('[ ] (todas as branches)');
      expect(frame).toContain('2 marcadas');
      expect(frame).toContain('Espaço marca');

      await press(stdin, '\r');
      await tick();
      expect(load).toHaveBeenCalledWith(['feature', 'main'], 100);
      expect(lastFrame()).toContain('feature, main · 1/3');
    });

    it('keeps checks while the query hides them', async () => {
      const {lastFrame, stdin, load} = open();
      await press(stdin, '/', DOWN, ' ');
      await press(stdin, 'm', 'a', 'i');
      // "feature" is hidden from the picker list by the query but still checked.
      expect(lastFrame()).not.toContain('] feature');
      expect(lastFrame()).toContain('[ ] main');
      expect(lastFrame()).toContain('1 marcada');
      await press(stdin, ' ', '\r');
      await tick();
      expect(load).toHaveBeenCalledWith(['feature', 'main'], 100);
    });

    it('applies the highlighted branch alone when nothing is checked', async () => {
      const {stdin, load} = open();
      await press(stdin, '/', DOWN, '\r');
      await tick();
      expect(load).toHaveBeenCalledWith(['feature'], 100);
    });

    it('shows the current filter checked when the picker is reopened', async () => {
      const {lastFrame, stdin} = open();
      await press(stdin, '/', DOWN, ' ', DOWN, ' ', '\r');
      await tick();
      await press(stdin, '/');
      expect(lastFrame()).toContain('[x] feature');
      expect(lastFrame()).toContain('[x] main');
    });

    it('goes back to all branches with Space on "all" and Enter', async () => {
      const {stdin, load} = open();
      await press(stdin, '/', DOWN, ' ', '\r');
      await tick();
      load.mockClear();
      await press(stdin, '/', ' ', '\r');
      await tick();
      expect(load).toHaveBeenCalledWith([], 100);
    });

    it('unchecks a branch with a second Space', async () => {
      const {lastFrame, stdin} = open();
      await press(stdin, '/', DOWN, ' ');
      expect(lastFrame()).toContain('[x] feature');
      await press(stdin, ' ');
      expect(lastFrame()).toContain('[ ] feature');
      expect(lastFrame()).not.toContain('marcada');
    });

    it('cancels with Esc, leaving the filter as it was', async () => {
      const {lastFrame, stdin, load} = open();
      await press(stdin, '/', DOWN, ' ', '\u001b');
      await tick();
      expect(load).not.toHaveBeenCalled();
      expect(lastFrame()).toContain('todas as branches · 1/5');
    });

    it('summarizes three or more branches in the header', async () => {
      const refs3: GraphData = {
        rows: data(5).rows,
        refs: {
          byCommit: new Map([
            ['h000000', [{name: 'a', kind: 'branch'}, {name: 'b', kind: 'branch'}]],
            ['h000001', [{name: 'c', kind: 'branch'}]],
          ]),
          head: {hash: 'h000000', branch: 'a'},
        },
      };
      const load = vi.fn<LoadGraph>().mockResolvedValue(refs3);
      const {lastFrame, stdin} = render(<Browser initial={refs3} initialLimit={100} load={load} />);
      await press(stdin, '/', DOWN, ' ', DOWN, ' ', DOWN, ' ', '\r');
      await tick();
      expect(load).toHaveBeenCalledWith(['a', 'b', 'c'], 100);
      expect(lastFrame()).toContain('a, b +1');
    });
  });
});
