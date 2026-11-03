import React from 'react';
import {render} from 'ink-testing-library';
import {describe, expect, it, vi} from 'vitest';
import type {RefInfo} from '../../src/git/refs.js';
import {layoutGraph} from '../../src/graph/layout.js';
import type {Commit} from '../../src/graph/types.js';
import {PartialCheckoutError, type CheckoutTarget} from '../../src/git/checkout.js';
import type {ChangedFile, ChangesActions} from '../../src/git/changes.js';
import {OperationStoppedError, type HistoryActions} from '../../src/git/history.js';
import type {Operation, OperationActions} from '../../src/git/operation.js';
import type {RefActions} from '../../src/git/refsEdit.js';
import {StashConflictError, type StashOp} from '../../src/git/stash.js';
import {MergeConflictError, type MergeActions, type MergeTarget} from '../../src/git/merge.js';
import {Browser as BrowserView, type GraphData, type LoadGraph} from '../../src/ui/Browser.js';
import {DisplayContext} from '../../src/ui/display.js';
import type {MouseEvent} from '../../src/ui/mouse.js';

const noCheckout = () => Promise.resolve();
const noMerge: MergeActions = {
  merge: () => Promise.resolve('merged'),
  abort: () => Promise.resolve(),
  conflicts: () => Promise.resolve([]),
};

const noChanges: ChangesActions = {
  files: () => Promise.resolve([]),
  diff: () => Promise.resolve({lines: [], truncated: false}),
  fullDiff: () => Promise.resolve({lines: [], truncated: false}),
};

/** The real Browser with harmless default `checkout`, `merge` and `changes`, so most tests need not pass them. */
function Browser(props: Omit<React.ComponentProps<typeof BrowserView>, 'checkout' | 'merge' | 'changes'> & {
  checkout?: (target: CheckoutTarget) => Promise<void>;
  merge?: MergeActions;
  changes?: ChangesActions;
}) {
  return <BrowserView checkout={noCheckout} merge={noMerge} changes={noChanges} {...props} />;
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

/** Linear history of `count` commits (0 is the newest). */
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
    expect(frame).toContain('gitgraph | atual: main | todas as branches | 1/5');
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

  describe('stashes', () => {
    const withStash = (): GraphData => {
      const commits = linear(4);
      // The newest row is a stash node whose only parent is the next commit.
      commits[0] = {...commits[0]!, subject: 'On main: wip', stash: true};
      return {
        rows: layoutGraph(commits),
        refs: {
          byCommit: new Map([['h000000', [{name: 'stash@{0}', kind: 'stash' as const}]]]),
          head: {hash: 'h000001', branch: 'main'},
        },
      };
    };

    describe('apply, pop and drop', () => {
      const run = (stash: (op: StashOp, hash: string) => Promise<string>, load = vi.fn<LoadGraph>().mockImplementation(() => Promise.resolve(withStash()))) => {
        const rendered = render(<Browser initial={withStash()} initialLimit={100} load={load} stash={stash} />);
        return {...rendered, load};
      };

      it('a applies and p pops the selected stash, then reloads and says what happened', async () => {
        const stash = vi.fn().mockResolvedValue('stash@{0}');
        const {lastFrame, stdin, load} = run(stash);
        await press(stdin, 'a');
        await tick();
        expect(stash).toHaveBeenCalledWith('apply', 'h000000');
        expect(load).toHaveBeenCalledTimes(1);
        expect(lastFrame()).toContain('stash@{0} aplicado (continua guardado)');

        await press(stdin, 'p');
        await tick();
        expect(stash).toHaveBeenLastCalledWith('pop', 'h000000');
        expect(lastFrame()).toContain('stash@{0} aplicado e removido');
      });

      it('x asks before dropping: n cancels, y drops', async () => {
        const stash = vi.fn().mockResolvedValue('stash@{0}');
        const {lastFrame, stdin} = run(stash);
        await press(stdin, 'x');
        expect(lastFrame()).toContain('Apagar stash@{0}?');
        expect(lastFrame()).toContain('Enter/y confirma');
        await press(stdin, 'n');
        expect(stash).not.toHaveBeenCalled();
        expect(lastFrame()).not.toContain('Apagar stash@{0}?');

        await press(stdin, 'x', 'y');
        await tick();
        expect(stash).toHaveBeenCalledWith('drop', 'h000000');
        expect(lastFrame()).toContain('stash@{0} apagado');
      });

      it('other keys do nothing while the drop is being confirmed', async () => {
        const stash = vi.fn().mockResolvedValue('stash@{0}');
        const {lastFrame, stdin} = run(stash);
        await press(stdin, 'x', 'j', 'a', 'q');
        expect(stash).not.toHaveBeenCalled();
        expect(lastFrame()).toContain('Apagar stash@{0}?');
        await press(stdin, '\u001B');
        expect(lastFrame()).not.toContain('Apagar');
      });

      it('on conflicts it reloads, keeps the stash and lists the files', async () => {
        const stash = vi.fn().mockRejectedValue(new StashConflictError('pop', 'stash@{0}', ['a.txt', 'b.txt']));
        const {lastFrame, stdin, load} = run(stash);
        await press(stdin, 'p');
        await tick();
        expect(load).toHaveBeenCalledTimes(1);
        expect(lastFrame()).toContain('stash@{0}: conflitos em a.txt, b.txt; resolva no terminal (stash mantido)');
      });

      it('other failures show the reason and do not reload', async () => {
        const stash = vi.fn().mockRejectedValue(new Error('as alterações locais atrapalham'));
        const {lastFrame, stdin, load} = run(stash);
        await press(stdin, 'a');
        await tick();
        expect(lastFrame()).toContain('erro: as alterações locais atrapalham');
        expect(load).not.toHaveBeenCalled();
      });

      it('only works on a stash row', async () => {
        const stash = vi.fn();
        const {lastFrame, stdin} = run(stash);
        await press(stdin, 'j', 'a');
        expect(lastFrame()).toContain('só vale em um stash');
        await press(stdin, 'x');
        expect(lastFrame()).not.toContain('Apagar');
        expect(stash).not.toHaveBeenCalled();
      });
    });

    it('shows the stash as a hollow node with its label', () => {
      const {lastFrame} = render(<Browser initial={withStash()} initialLimit={100} load={vi.fn()} />);
      expect(lastFrame()).toMatch(/○ >h000000 \(stash@\{0\}\) On main: wip/);
      expect(lastFrame()).toContain('●');
    });

    it('does not offer a checkout for a stash row', async () => {
      const checkout = vi.fn<(t: CheckoutTarget) => Promise<void>>();
      const {lastFrame, stdin} = render(
        <Browser initial={withStash()} initialLimit={100} load={vi.fn()} checkout={checkout} />,
      );
      await press(stdin, 'c');
      expect(lastFrame()).toContain('um stash não pode ser usado em checkout');
      expect(lastFrame()).not.toContain('Checkout para');
      expect(checkout).not.toHaveBeenCalled();
    });

    it('still offers a checkout on the commit below the stash', async () => {
      const {lastFrame, stdin} = render(<Browser initial={withStash()} initialLimit={100} load={vi.fn()} />);
      await press(stdin, 'j', 'c');
      expect(lastFrame()).toContain('Checkout para');
    });
  });

  describe('current branch in the header', () => {
    const withHead = (head: GraphData['refs']['head']): GraphData => ({
      rows: data(3).rows,
      refs: {...refs, head},
    });
    const header = (initial: GraphData) => {
      const {lastFrame} = render(<Browser initial={initial} initialLimit={100} load={vi.fn()} />);
      return (lastFrame() ?? '').split('\n')[0] ?? '';
    };

    it('shows the current branch', () => {
      expect(header(data(3))).toContain('atual: main');
    });

    it('shows the commit when HEAD is detached', () => {
      expect(header(withHead({hash: 'h000001', branch: null}))).toContain('atual: HEAD destacado em h000001');
    });

    it('says when a merge is in progress', () => {
      expect(header(withHead({hash: 'h000000', branch: 'main', merging: true}))).toContain(
        'atual: main (merge em andamento)',
      );
    });

    it('follows the branch after a checkout', async () => {
      const load = vi
        .fn<LoadGraph>()
        .mockResolvedValue({rows: data(5).rows, refs: {...refs, head: {hash: 'h000002', branch: 'feature'}}});
      const {lastFrame, stdin} = render(
        <Browser initial={data(5)} initialLimit={100} load={load} checkout={() => Promise.resolve()} />,
      );
      await press(stdin, 'j', 'j', 'c', '\r');
      await tick();
      expect((lastFrame() ?? '').split('\n')[0]).toContain('atual: feature');
    });
  });

  describe('merge', () => {
    const branchTarget = (name: string, remote = false): MergeTarget => ({kind: 'branch', name, remote});
    const actions = (overrides: Partial<MergeActions> = {}): MergeActions => ({...noMerge, ...overrides});
    const open = (merge: MergeActions, initial: GraphData = data(5), load = vi.fn<LoadGraph>().mockResolvedValue(initial)) => ({
      load,
      ...render(<Browser initial={initial} initialLimit={100} load={load} merge={merge} />),
    });
    // The test refs put "feature" at h000002 (third row) and HEAD (main) at h000000.
    const toFeature = ['j', 'j', 'm'];

    it('asks for confirmation and merges the branch at the commit into the current one', async () => {
      const merge = vi.fn().mockResolvedValue('merged');
      const {lastFrame, stdin, load} = open(actions({merge}));
      await press(stdin, ...toFeature);
      expect(lastFrame()).toContain('Merge de feature em main?');
      expect(lastFrame()).toContain('Fast-forward quando possível');
      expect(merge).not.toHaveBeenCalled();

      await press(stdin, '\r');
      await tick();
      expect(merge).toHaveBeenCalledWith(branchTarget('feature'));
      expect(load).toHaveBeenCalled();
      expect(lastFrame()).toContain('merge de feature em main concluído');
    });

    it('also confirms with y and cancels with Esc or n', async () => {
      const merge = vi.fn().mockResolvedValue('merged');
      const {stdin} = open(actions({merge}));
      await press(stdin, ...toFeature, 'y');
      await tick();
      expect(merge).toHaveBeenCalledTimes(1);

      for (const key of ['\u001b', 'n']) {
        merge.mockClear();
        await press(stdin, 'm', key);
        await tick();
        expect(merge).not.toHaveBeenCalled();
      }
    });

    it.each([
      ['fast-forward', 'fast-forward: main avançou até feature'],
      ['up-to-date', 'feature já está incluído em main'],
    ] as const)('reports %s', async (result, text) => {
      const {lastFrame, stdin} = open(actions({merge: vi.fn().mockResolvedValue(result)}));
      await press(stdin, ...toFeature, '\r');
      await tick();
      expect(lastFrame()).toContain(text);
    });

    it('lets you pick among several branches, remote ones marked', async () => {
      const merge = vi.fn().mockResolvedValue('merged');
      const many: GraphData = {
        rows: data(5).rows,
        refs: {
          byCommit: new Map([
            ['h000000', [{name: 'main', kind: 'branch'}]],
            ['h000001', [{name: 'zeta', kind: 'branch'}, {name: 'origin/alpha', kind: 'remote'}, {name: 'main', kind: 'branch'}]],
          ]),
          head: {hash: 'h000000', branch: 'main'},
        },
      };
      const {lastFrame, stdin} = open(actions({merge}), many);
      await press(stdin, 'j', 'm');
      const lines = (lastFrame() ?? '').split('\n');
      expect(lines.some(l => l.includes('Merge de qual branch em main?'))).toBe(true);
      // Local branches first, the current branch (main) left out, remote marked.
      const first = lines.findIndex(l => l.includes('> zeta'));
      expect(first).toBeGreaterThan(-1);
      expect(lines[first + 1]).toContain('origin/alpha (remota)');
      expect(lines.some(l => /\s> main\b|> main$/.test(l))).toBe(false);

      await press(stdin, '\u001b[B', '\r');
      await tick();
      expect(merge).toHaveBeenCalledWith(branchTarget('origin/alpha', true));
    });

    it('merges the commit itself when no branch points at it', async () => {
      const merge = vi.fn().mockResolvedValue('merged');
      const {lastFrame, stdin} = open(actions({merge}));
      await press(stdin, 'j', 'm');
      expect(lastFrame()).toContain('Merge de h000001 (commit) em main?');
      expect(lastFrame()).toContain('Nenhuma branch aponta para este commit');
      await press(stdin, '\r');
      await tick();
      expect(merge).toHaveBeenCalledWith({kind: 'commit', hash: 'h000001'});
    });

    it('refuses with a notice where a merge makes no sense', async () => {
      const merge = vi.fn();
      // The first row is the current commit.
      const {lastFrame, stdin} = open(actions({merge}));
      await press(stdin, 'm');
      expect(lastFrame()).toContain('esse já é o commit da branch atual');

      const detached = open(actions({merge}), {rows: data(3).rows, refs: {...refs, head: {hash: 'h000000', branch: null}}});
      await press(detached.stdin, 'j', 'm');
      expect(detached.lastFrame()).toContain('HEAD destacado: troque para uma branch antes do merge');

      const stashed = data(3);
      stashed.rows = layoutGraph([{...linear(3)[0]!, stash: true}, ...linear(3).slice(1)]);
      const onStash = open(actions({merge}), stashed);
      await press(onStash.stdin, 'm');
      expect(onStash.lastFrame()).toContain('um stash não pode ser mesclado');
      expect(merge).not.toHaveBeenCalled();
    });

    it('shows a refusal from git on one line and changes nothing', async () => {
      const merge = vi.fn().mockRejectedValue(new Error('error: Your local changes would be overwritten by merge:\n\ta.txt\nAborting'));
      const {lastFrame, stdin, load} = open(actions({merge}), data(5), vi.fn<LoadGraph>());
      await press(stdin, ...toFeature, '\r');
      await tick();
      expect(lastFrame()).toContain('erro: Your local changes would be overwritten by merge: a.txt Aborting');
      expect(load).not.toHaveBeenCalled();
    });

    describe('with conflicts', () => {
      const conflicted = (files = ['a.txt', 'b.txt']) =>
        vi.fn().mockRejectedValue(new MergeConflictError(files));

      it('names the files and offers to abort or leave it in progress', async () => {
        const {lastFrame, stdin, load} = open(actions({merge: conflicted()}));
        await press(stdin, ...toFeature, '\r');
        await tick();
        const frame = lastFrame() ?? '';
        expect(frame).toContain('Merge com conflitos (2 arquivos)');
        expect(frame).toContain('a.txt, b.txt');
        expect(frame).toContain('> Abortar o merge (git merge --abort)');
        expect(frame).toContain('Deixar em andamento (resolva no terminal)');
        expect(frame).toContain('a aborta');
        // The view is refreshed so the header can say a merge is in progress.
        expect(load).toHaveBeenCalled();
      });

      it('aborts with a, or with Enter on the first option', async () => {
        for (const keys of [['a'], ['\r']]) {
          const abort = vi.fn().mockResolvedValue(undefined);
          const {lastFrame, stdin} = open(actions({merge: conflicted(), abort}));
          await press(stdin, ...toFeature, '\r');
          await tick();
          await press(stdin, ...keys);
          await tick();
          expect(abort).toHaveBeenCalledTimes(1);
          expect(lastFrame()).toContain('merge abortado');
          expect(lastFrame()).not.toContain('Merge com conflitos');
        }
      });

      it('leaves it in progress with d, Esc, or the second option', async () => {
        for (const keys of [['d'], ['\u001b'], ['\u001b[B', '\r']]) {
          const abort = vi.fn();
          const {lastFrame, stdin} = open(actions({merge: conflicted(), abort}));
          await press(stdin, ...toFeature, '\r');
          await tick();
          await press(stdin, ...keys);
          await tick();
          expect(abort).not.toHaveBeenCalled();
          expect(lastFrame()).toContain('merge deixado em andamento');
          expect(lastFrame()).not.toContain('Merge com conflitos');
        }
      });

      it('shows a failed abort as an error', async () => {
        const abort = vi.fn().mockRejectedValue(new Error('fatal: There is no merge to abort'));
        const {lastFrame, stdin} = open(actions({merge: conflicted(), abort}));
        await press(stdin, ...toFeature, '\r');
        await tick();
        await press(stdin, 'a');
        await tick();
        expect(lastFrame()).toContain('erro: There is no merge to abort');
      });
    });

    it('reopens the dialog for a merge already in progress', async () => {
      const conflicts = vi.fn().mockResolvedValue(['x.txt']);
      const abort = vi.fn().mockResolvedValue(undefined);
      const inProgress: GraphData = {rows: data(5).rows, refs: {...refs, head: {hash: 'h000000', branch: 'main', merging: true}}};
      const {lastFrame, stdin} = open(actions({conflicts, abort}), inProgress);
      await press(stdin, 'm');
      await tick();
      expect(conflicts).toHaveBeenCalled();
      expect(lastFrame()).toContain('Merge com conflitos (1 arquivo)');
      expect(lastFrame()).toContain('x.txt');
      await press(stdin, 'a');
      await tick();
      expect(abort).toHaveBeenCalled();
    });

    it('shows a merge in progress with no conflicted files as such', async () => {
      const inProgress: GraphData = {rows: data(5).rows, refs: {...refs, head: {hash: 'h000000', branch: 'main', merging: true}}};
      const {lastFrame, stdin} = open(actions({conflicts: vi.fn().mockResolvedValue([])}), inProgress);
      await press(stdin, 'm');
      await tick();
      expect(lastFrame()).toContain('Merge em andamento');
    });

    it('advertises the key in the footer', () => {
      const {lastFrame} = open(noMerge);
      expect(lastFrame()).toContain('m merge');
      expect(lastFrame()).toContain('q sair');
    });
  });

  describe('commit view', () => {
    const files: ChangedFile[] = [
      {path: 'src/a.ts', status: 'M', added: 3, deleted: 1},
      {path: 'new name.ts', oldPath: 'old.ts', status: 'R', added: 0, deleted: 0},
      {path: 'logo.png', status: 'A', added: null, deleted: null},
    ];
    const diffOf = (lines: string[]) => Promise.resolve({lines, truncated: false});

    const open = async (extra: Partial<ChangesActions> = {}) => {
      const changes: ChangesActions = {
        files: vi.fn(() => Promise.resolve(files)),
        diff: vi.fn(() => diffOf(['diff --git a/src/a.ts b/src/a.ts', '@@ -1 +1 @@', '-old line', '+new line'])),
        fullDiff: vi.fn(() =>
          diffOf(['diff --git a/src/a.ts b/src/a.ts', '@@ -1,3 +1,3 @@', ' keep', '-old line', '+new line', ' tail']),
        ),
        ...extra,
      };
      const rendered = render(<Browser initial={data(5)} initialLimit={100} load={vi.fn<LoadGraph>()} changes={changes} />);
      await press(rendered.stdin, '\r');
      await tick();
      return {...rendered, changes};
    };

    it('abre com Enter e lista os arquivos com status e contagem', async () => {
      const {lastFrame, changes} = await open();
      const frame = lastFrame() ?? '';
      expect(changes.files).toHaveBeenCalledWith(expect.objectContaining({hash: 'h000000'}));
      expect(frame).toContain('Arquivos alterados (3)');
      expect(frame).toContain('src/a.ts');
      expect(frame).toContain('+3');
      expect(frame).toContain('old.ts → new name.ts');
      expect(frame).toContain('bin');
      expect(frame).not.toContain('1/5');
    });

    it('Enter num arquivo mostra o diff dele e Esc volta à lista de arquivos', async () => {
      const {lastFrame, stdin, changes} = await open();
      await press(stdin, 'j', '\r');
      expect(changes.fullDiff).toHaveBeenCalledWith(expect.objectContaining({hash: 'h000000'}), files[1]);
      await press(stdin, '\u001B');
      expect(lastFrame()).toContain('Arquivos alterados (3)');
    });

    it('mostra o arquivo inteiro lado a lado, com antes e depois alinhados', async () => {
      const {lastFrame, stdin} = await open();
      await press(stdin, '\r', );
      await tick();
      const frame = lastFrame() ?? '';
      expect(frame).toContain('antes: src/a.ts');
      expect(frame).toContain('depois: src/a.ts');
      expect(frame).toMatch(/ 1 keep\s+│\s+1 keep/);
      expect(frame).toMatch(/-2 old line\s+│\+2 new line/);
      expect(frame).toMatch(/ 3 tail\s+│\s+3 tail/);
    });

    it('u alterna para o diff unificado e de volta', async () => {
      const {lastFrame, stdin, changes} = await open();
      await press(stdin, '\r');
      await press(stdin, 'u');
      await tick();
      expect(changes.diff).toHaveBeenCalledWith(expect.objectContaining({hash: 'h000000'}), files[0]);
      expect(lastFrame()).toContain('@@ -1 +1 @@');
      expect(lastFrame()).toContain('+new line');
      await press(stdin, 'u');
      await tick();
      expect(lastFrame()).toContain('antes: src/a.ts');
    });

    it('arquivo binário abre direto no unificado', async () => {
      const {lastFrame, stdin, changes} = await open();
      await press(stdin, 'j', 'j', '\r');
      await tick();
      expect(changes.fullDiff).not.toHaveBeenCalled();
      expect(changes.diff).toHaveBeenCalledWith(expect.anything(), files[2]);
      expect(lastFrame()).not.toContain('antes:');
    });

    it('d abre o diff do commit inteiro, sem arquivo', async () => {
      const {stdin, changes} = await open();
      await press(stdin, 'd');
      expect(changes.diff).toHaveBeenCalledWith(expect.objectContaining({hash: 'h000000'}), undefined);
    });

    it('q fecha a visão sem sair e mantém a seleção', async () => {
      const {lastFrame, stdin} = render(
        <Browser initial={data(5)} initialLimit={100} load={vi.fn<LoadGraph>()} />,
      );
      await press(stdin, 'j', 'j', '\r', 'q');
      expect(lastFrame()).toContain('3/5');
    });

    it('mostra o erro do git ao listar os arquivos', async () => {
      const {lastFrame} = await open({files: () => Promise.reject(new Error('fatal: bad object'))});
      expect(lastFrame()).toContain('erro: fatal: bad object');
    });

    it('rola o diff com j', async () => {
      const lines = Array.from({length: 200}, (_, i) => `+line ${i}`);
      const {lastFrame, stdin} = await open({diff: () => diffOf(lines)});
      await press(stdin, 'd');
      await tick();
      expect(lastFrame()).toContain('+line 0');
      await press(stdin, 'G');
      expect(lastFrame()).toContain('+line 199');
      expect(lastFrame()).not.toContain('+line 0\n');
    });
  });

  describe('mouse', () => {
    const wheelDown = '\u001B[<65;1;1M';
    const click = (line: number) => `\u001B[<0;1;${line}M`;

    /** A fake source: tests call `emit` instead of writing to stdin. */
    function fakeMouse() {
      const listeners = new Set<(event: MouseEvent) => void>();
      return {
        source: {
          subscribe: (l: (event: MouseEvent) => void) => {
            listeners.add(l);
            return () => listeners.delete(l);
          },
        },
        emit: (event: MouseEvent) => listeners.forEach(l => l(event)),
      };
    }

    // One line per commit, so screen line n is commit n - 1 (line 0 is the header).
    const compact = (node: React.ReactNode) => (
      <DisplayContext.Provider value={{color: false, ascii: false, spaced: false}}>{node}</DisplayContext.Provider>
    );

    it('selects the commit that was clicked', async () => {
      const mouse = fakeMouse();
      const {lastFrame} = render(
        compact(<Browser initial={data(8)} initialLimit={100} load={vi.fn<LoadGraph>()} mouse={mouse.source} />),
      );
      mouse.emit({type: 'click', row: 3, col: 5});
      await tick();
      expect(lastFrame()).toContain('3/8');
      expect(lastFrame()).toContain('h000002');
    });

    it('opens the commit view on a double click on the same commit', async () => {
      const mouse = fakeMouse();
      const files = vi.fn<ChangesActions['files']>().mockResolvedValue([]);
      const {lastFrame} = render(
        compact(
          <Browser
            initial={data(8)}
            initialLimit={100}
            load={vi.fn<LoadGraph>()}
            mouse={mouse.source}
            changes={{...noChanges, files}}
          />,
        ),
      );
      mouse.emit({type: 'click', row: 3, col: 0});
      await tick();
      expect(files).not.toHaveBeenCalled();
      mouse.emit({type: 'click', row: 3, col: 0});
      await tick();
      expect(files).toHaveBeenCalledWith(expect.objectContaining({hash: 'h000002'}));
      expect(lastFrame()).not.toContain('3/8');
    });

    it('does not open the view for two clicks on different commits or too far apart', async () => {
      const mouse = fakeMouse();
      const files = vi.fn<ChangesActions['files']>().mockResolvedValue([]);
      render(
        compact(
          <Browser
            initial={data(8)}
            initialLimit={100}
            load={vi.fn<LoadGraph>()}
            mouse={mouse.source}
            changes={{...noChanges, files}}
          />,
        ),
      );
      mouse.emit({type: 'click', row: 3, col: 0});
      mouse.emit({type: 'click', row: 4, col: 0});
      await tick();
      expect(files).not.toHaveBeenCalled();
      await new Promise(resolve => setTimeout(resolve, 450));
      mouse.emit({type: 'click', row: 4, col: 0});
      await tick();
      expect(files).not.toHaveBeenCalled();
    });

    describe('in the commit view', () => {
      const files: ChangedFile[] = [
        {path: 'src/a.ts', status: 'M', added: 3, deleted: 1},
        {path: 'src/b.ts', status: 'M', added: 1, deleted: 0},
        {path: 'src/c.ts', status: 'A', added: 5, deleted: 0},
      ];

      const open = async () => {
        const mouse = fakeMouse();
        const changes: ChangesActions = {
          files: vi.fn(() => Promise.resolve(files)),
          diff: vi.fn(() => Promise.resolve({lines: ['@@ -1 +1 @@', '-a', '+b'], truncated: false})),
          fullDiff: vi.fn(() => Promise.resolve({lines: ['@@ -1 +1 @@', '-a', '+b'], truncated: false})),
        };
        const rendered = render(
          compact(
            <Browser initial={data(5)} initialLimit={100} load={vi.fn<LoadGraph>()} changes={changes} mouse={mouse.source} />,
          ),
        );
        await press(rendered.stdin, '\r');
        await tick();
        // Header takes lines 0-3, the files heading is line 4 and the first file line 5.
        return {...rendered, mouse, changes};
      };
      const selectedLine = (frame: string | undefined) => (frame ?? '').split('\n').find(l => l.startsWith('>'));

      it('selects the clicked file', async () => {
        const {mouse, lastFrame} = await open();
        mouse.emit({type: 'click', row: 6, col: 3});
        await tick();
        expect(selectedLine(lastFrame())).toContain('src/b.ts');
      });

      it('opens the diff of the file on a double click', async () => {
        const {mouse, lastFrame, changes} = await open();
        mouse.emit({type: 'click', row: 7, col: 3});
        mouse.emit({type: 'click', row: 7, col: 3});
        await tick();
        expect(changes.fullDiff).toHaveBeenCalledWith(expect.objectContaining({hash: 'h000000'}), files[2]);
        expect(lastFrame()).toContain('src/c.ts');
      });

      it('ignores clicks past the last file and on the header', async () => {
        const {mouse, lastFrame, changes} = await open();
        mouse.emit({type: 'click', row: 9, col: 3});
        mouse.emit({type: 'click', row: 9, col: 3});
        mouse.emit({type: 'click', row: 0, col: 3});
        mouse.emit({type: 'click', row: 0, col: 3});
        await tick();
        expect(changes.fullDiff).not.toHaveBeenCalled();
        expect(selectedLine(lastFrame())).toContain('src/a.ts');
      });

      it('moves the file selection with the wheel', async () => {
        const {mouse, lastFrame} = await open();
        mouse.emit({type: 'wheelDown', row: 5, col: 0});
        await tick();
        expect(selectedLine(lastFrame())).toContain('src/c.ts');
        mouse.emit({type: 'wheelUp', row: 5, col: 0});
        await tick();
        expect(selectedLine(lastFrame())).toContain('src/a.ts');
      });

      it('does not change the list behind the view', async () => {
        const {mouse, stdin, lastFrame} = await open();
        mouse.emit({type: 'wheelDown', row: 5, col: 0});
        await tick();
        await press(stdin, '\u001B');
        expect(lastFrame()).toContain('1/5');
      });
    });

    it('ignores clicks on the header, the details and past the last commit', async () => {
      const mouse = fakeMouse();
      const {lastFrame} = render(
        compact(<Browser initial={data(3)} initialLimit={100} load={vi.fn<LoadGraph>()} mouse={mouse.source} />),
      );
      mouse.emit({type: 'click', row: 2, col: 0});
      await tick();
      expect(lastFrame()).toContain('2/3');
      mouse.emit({type: 'click', row: 0, col: 0});
      mouse.emit({type: 'click', row: 4, col: 0});
      await tick();
      expect(lastFrame()).toContain('2/3');
    });

    it('moves the selection with the wheel and stops at the ends', async () => {
      const mouse = fakeMouse();
      const {lastFrame} = render(
        compact(<Browser initial={data(8)} initialLimit={100} load={vi.fn<LoadGraph>()} mouse={mouse.source} />),
      );
      mouse.emit({type: 'wheelDown', row: 2, col: 0});
      await tick();
      expect(lastFrame()).toContain('4/8');
      mouse.emit({type: 'wheelUp', row: 2, col: 0});
      mouse.emit({type: 'wheelUp', row: 2, col: 0});
      await tick();
      expect(lastFrame()).toContain('1/8');
    });

    it('does nothing while a dialog is open', async () => {
      const mouse = fakeMouse();
      const {lastFrame, stdin} = render(
        compact(<Browser initial={data(8)} initialLimit={100} load={vi.fn<LoadGraph>()} mouse={mouse.source} />),
      );
      await press(stdin, '/');
      mouse.emit({type: 'wheelDown', row: 2, col: 0});
      mouse.emit({type: 'click', row: 3, col: 0});
      await tick();
      expect(lastFrame()).toContain('1/8');
    });

    it('does not type mouse reports written to stdin as keys', async () => {
      // Without a source Ink gets the raw report; it must not reach the key handlers.
      const {lastFrame, stdin} = render(<Browser initial={data(5)} initialLimit={100} load={vi.fn<LoadGraph>()} />);
      await press(stdin, wheelDown, click(2));
      expect(lastFrame()).toContain('1/5');
    });
  });

  it('shows the active log filters in the header', () => {
    const {lastFrame} = render(
      <Browser initial={data(3)} initialLimit={100} load={vi.fn<LoadGraph>()} filters={['autor Ana', 'sem tags']} />,
    );
    expect(lastFrame()).toContain('autor Ana, sem tags');
  });

  it('starts filtered by the revisions given on the command line', () => {
    const {lastFrame} = render(
      <Browser initial={data(3)} initialLimit={100} initialRevs={['main', 'feature']} load={vi.fn<LoadGraph>()} />,
    );
    expect(lastFrame()).toContain('main, feature');
    expect(lastFrame()).not.toContain('todas as branches');
  });

  describe('help screen (?)', () => {
    it('? opens it with every section and ? or Esc closes it', async () => {
      const {stdin, lastFrame} = render(<Browser initial={data(5)} initialLimit={100} load={vi.fn<LoadGraph>()} />);
      await press(stdin, '?');
      const frame = lastFrame() ?? '';
      expect(frame).toContain('gitgraph · ajuda');
      expect(frame).toContain('Lista de commits');
      expect(frame).toContain('move a seleção');
      expect(frame).not.toContain('1/5');
      await press(stdin, '?');
      expect(lastFrame()).toContain('1/5');
      expect(lastFrame()).not.toContain('gitgraph · ajuda');
      await press(stdin, '?', '\u001B');
      expect(lastFrame()).toContain('1/5');
    });

    it('the list keys do nothing while it is open, and it scrolls when it does not fit', async () => {
      const {stdin, lastFrame} = render(<Browser initial={data(5)} initialLimit={100} load={vi.fn<LoadGraph>()} />);
      await press(stdin, '?', 'j', 'q');
      // q closes the help (it does not quit the program), and j scrolled the help, not the list.
      expect(lastFrame()).toContain('1/5');
      await press(stdin, '?', 'G');
      // The last section is in view after jumping to the end.
      expect(lastFrame()).toContain('campos de nome e de busca');
      await press(stdin, 'g');
      expect(lastFrame()).toContain('Lista de commits');
    });

    it('uses words instead of arrows with --ascii', async () => {
      const {stdin, lastFrame} = render(
        <DisplayContext.Provider value={{color: false, ascii: true, spaced: true}}>
          <Browser initial={data(5)} initialLimit={100} load={vi.fn<LoadGraph>()} />
        </DisplayContext.Provider>,
      );
      await press(stdin, '?');
      expect(lastFrame()).toContain('j / Down');
      expect(lastFrame()).not.toMatch(/[↑↓←→]/);
    });

    it('the footer of the list points to it', () => {
      const {lastFrame} = render(<Browser initial={data(5)} initialLimit={100} load={vi.fn<LoadGraph>()} />);
      expect(lastFrame()).toContain('? ajuda');
    });
  });

  describe('wide graphs', () => {
    // 50 tips, each waiting for its own parent that shows up later: 50 open lanes, about twice the
    // 26 columns a 100-column terminal leaves for the graph.
    const wide = (): GraphData => {
      const tips = Array.from({length: 50}, (_, i) => commit(i, [commit(100 + i, []).hash]));
      const parents = Array.from({length: 50}, (_, i) => commit(100 + i, []));
      return {rows: layoutGraph([...tips, ...parents]), refs: {...refs, head: {hash: 'h000100', branch: 'main'}}};
    };
    const open = () => render(<Browser initial={wide()} initialLimit={100} load={vi.fn<LoadGraph>()} />);

    it('limits the graph so the commit text stays visible, and says which columns are shown', () => {
      const frame = open().lastFrame() ?? '';
      expect(frame).toContain('grafo 1-26/50 (h/l)');
      const first = frame.split('\n').find(l => l.includes('h000000')) ?? '';
      expect(first).toContain('commit 0');
      expect(first).toContain('Ana,');
    });

    it('l and h pan the graph by two columns, within the limits', async () => {
      const {stdin, lastFrame} = open();
      await press(stdin, 'h');
      expect(lastFrame()).toContain('grafo 1-26/50');
      await press(stdin, 'l', 'l');
      expect(lastFrame()).toContain('grafo 5-30/50');
      await press(stdin, 'h');
      expect(lastFrame()).toContain('grafo 3-28/50');
      // Pressed back to back, without waiting for a render: every press still counts.
      for (let i = 0; i < 20; i++) stdin.write('l');
      await tick();
      expect(lastFrame()).toContain('grafo 25-50/50');
    });

    it('the arrows pan too', async () => {
      const {stdin, lastFrame} = open();
      await press(stdin, '\u001B[C');
      expect(lastFrame()).toContain('grafo 3-28/50');
      await press(stdin, '\u001B[D');
      expect(lastFrame()).toContain('grafo 1-26/50');
    });

    it('moving the selection to a node outside the window brings it into view', async () => {
      const {stdin, lastFrame} = open();
      // The row of tip 40 has its node in column 40.
      await press(stdin, ...Array<string>(40).fill('j'));
      expect(lastFrame()).toContain('41/100');
      expect(lastFrame()).toContain('grafo 16-41/50');
      await press(stdin, 'g');
      expect(lastFrame()).toContain('grafo 1-26/50');
    });

    it('a narrow graph is not clipped and h/l do nothing', async () => {
      const {stdin, lastFrame} = render(<Browser initial={data(5)} initialLimit={100} load={vi.fn<LoadGraph>()} />);
      await press(stdin, 'l');
      expect(lastFrame()).not.toContain('grafo ');
    });
  });

  describe('cherry-pick, revert and reset (C, v, X)', () => {
    const history = (over: Partial<HistoryActions> = {}): HistoryActions => ({
      cherryPick: vi.fn().mockResolvedValue(undefined),
      revert: vi.fn().mockResolvedValue(undefined),
      resetPreview: vi.fn().mockResolvedValue({ahead: 1, orphaned: 0, changed: 0}),
      reset: vi.fn().mockResolvedValue(undefined),
      ...over,
    });
    const open = (act = history(), operation?: OperationActions) => {
      const load = vi.fn<LoadGraph>().mockResolvedValue(data(5));
      const rendered = render(
        <Browser initial={data(5)} initialLimit={100} load={load} history={act} operation={operation} />,
      );
      return {...rendered, act, load};
    };

    it('C asks first, then cherry-picks the selected commit and reloads', async () => {
      const {stdin, lastFrame, act, load} = open();
      await press(stdin, 'j', 'C');
      expect(lastFrame()).toContain('Cherry-pick de h000001 em main?');
      expect(lastFrame()).toContain('commit 1');
      await press(stdin, 'n');
      expect(act.cherryPick).not.toHaveBeenCalled();
      await press(stdin, 'C', 'y');
      await tick();
      expect(act.cherryPick).toHaveBeenCalledWith('h000001', false);
      expect(load).toHaveBeenCalledTimes(1);
      expect(lastFrame()).toContain('cherry-pick de h000001 aplicado');
    });

    it('v asks first, then reverts', async () => {
      const {stdin, lastFrame, act} = open();
      // Reverting the HEAD commit is allowed (it is the usual case).
      await press(stdin, 'v');
      expect(lastFrame()).toContain('Reverter h000000?');
      await press(stdin, 'y');
      await tick();
      expect(act.revert).toHaveBeenCalledWith('h000000', false);
      expect(lastFrame()).toContain('h000000 revertido');
    });

    it('a merge commit is applied relative to its first parent, and the prompt says so', async () => {
      const merge: Commit = {...commit(0, ['h000001', 'h000002']), subject: 'merge'};
      const rows = layoutGraph([merge, commit(1, ['h000003']), commit(2, ['h000003']), commit(3, [])]);
      const act = history();
      const {stdin, lastFrame} = render(
        <Browser initial={{rows, refs: {...refs, head: {hash: 'hzzzzzz', branch: 'main'}}}} initialLimit={100} load={vi.fn<LoadGraph>()} history={act} />,
      );
      await press(stdin, 'C');
      expect(lastFrame()).toContain('Commit de merge: aplicado em relação ao 1º pai');
      await press(stdin, 'y');
      await tick();
      expect(act.cherryPick).toHaveBeenCalledWith('h000000', true);
    });

    it('when it stops on conflicts it reloads and opens the dialog with the files', async () => {
      const cherryPick = vi.fn().mockRejectedValue(new OperationStoppedError('cherry-pick', ['a.txt']));
      const {stdin, lastFrame, load} = open(history({cherryPick}));
      await press(stdin, 'j', 'C', 'y');
      await tick();
      expect(load).toHaveBeenCalledTimes(1);
      expect(lastFrame()).toContain('cherry-pick com conflitos (1 arquivo): a.txt');
      expect(lastFrame()).toContain('Pular este passo');
    });

    it('other failures show the reason and do not reload', async () => {
      const revert = vi.fn().mockRejectedValue(new Error('error: your local changes would be overwritten'));
      const {stdin, lastFrame, load} = open(history({revert}));
      await press(stdin, 'v', 'y');
      await tick();
      expect(lastFrame()).toContain('erro: your local changes would be overwritten');
      expect(load).not.toHaveBeenCalled();
    });

    it('X opens the reset prompt on the selected commit; the HEAD itself is refused', async () => {
      const {stdin, lastFrame} = open();
      await press(stdin, 'X');
      expect(lastFrame()).toContain('o HEAD já está nesse commit');
      await press(stdin, 'j', 'X');
      await tick();
      expect(lastFrame()).toContain('Reset de main para h000001');
      // The list keys are the prompt's now.
      await press(stdin, 'q');
      expect(lastFrame()).toContain('Reset de main para h000001');
      await press(stdin, '\u001B');
      expect(lastFrame()).not.toContain('Reset de');
    });

    it('C on the HEAD commit is refused', async () => {
      const {stdin, lastFrame, act} = open();
      await press(stdin, 'C');
      expect(lastFrame()).toContain('esse commit já é o HEAD');
      expect(act.cherryPick).not.toHaveBeenCalled();
    });

    it('is refused while another operation is in progress', async () => {
      const inProgress: GraphData = {rows: layoutGraph(linear(3)), refs: {...refs, head: {...refs.head, operation: 'rebase'}}};
      const act = history();
      const {stdin, lastFrame} = render(
        <Browser initial={inProgress} initialLimit={100} load={vi.fn<LoadGraph>()} history={act} />,
      );
      await press(stdin, 'j', 'C');
      expect(lastFrame()).toContain('rebase em andamento: aperte m');
      expect(act.cherryPick).not.toHaveBeenCalled();
    });

    it('is refused on a stash, on the uncommitted node and without the actions', async () => {
      const bare = render(<Browser initial={data(3)} initialLimit={100} load={vi.fn<LoadGraph>()} />);
      await press(bare.stdin, 'j', 'v');
      expect(bare.lastFrame()).toContain('indisponíveis');

      const commits = linear(3);
      commits[0] = {...commits[0]!, stash: true};
      const stashed = render(
        <Browser initial={{rows: layoutGraph(commits), refs}} initialLimit={100} load={vi.fn<LoadGraph>()} history={history()} />,
      );
      await press(stashed.stdin, 'C');
      expect(stashed.lastFrame()).toContain('um stash não é um commit da história');
      expect(stashed.lastFrame()).not.toContain('Cherry-pick de');
    });
  });

  describe('operation in progress (cherry-pick, revert, rebase)', () => {
    const during = (operation: Operation): GraphData => ({
      rows: layoutGraph(linear(3)),
      refs: {...refs, head: {...refs.head, operation, merging: false}},
    });
    const actions = (over: Partial<OperationActions> = {}): OperationActions => ({
      abort: vi.fn().mockResolvedValue(undefined),
      proceed: vi.fn().mockResolvedValue(undefined),
      skip: vi.fn().mockResolvedValue(undefined),
      conflicts: vi.fn().mockResolvedValue(['a.txt', 'b.txt', 'c.txt']),
      ...over,
    });
    const open = (op: Operation, act = actions(), load = vi.fn<LoadGraph>().mockResolvedValue(during(op))) => {
      const rendered = render(<Browser initial={during(op)} initialLimit={100} load={load} operation={act} />);
      return {...rendered, act, load};
    };

    it('the header says which operation is stopped', () => {
      expect(open('rebase').lastFrame()).toContain('atual: main (rebase em andamento)');
      expect(open('cherry-pick').lastFrame()).toContain('(cherry-pick em andamento)');
    });

    it('m opens the dialog with the files and the options, skip included', async () => {
      const {stdin, lastFrame} = open('rebase');
      await press(stdin, 'm');
      await tick();
      const frame = lastFrame() ?? '';
      expect(frame).toContain('rebase com conflitos (3 arquivos): a.txt, b.txt +1');
      expect(frame).toContain('> Abortar o rebase (git rebase --abort)');
      expect(frame).toContain('Continuar (git rebase --continue)');
      expect(frame).toContain('Pular este passo (git rebase --skip)');
      expect(frame).toContain('a aborta');
    });

    it.each([
      ['a', 'abort', 'rebase abortado'],
      ['c', 'proceed', 'rebase continuado'],
      ['s', 'skip', 'rebase passo pulado'],
    ] as const)('%s runs %s, reloads and says what happened', async (key, method, message) => {
      const {stdin, lastFrame, act, load} = open('rebase');
      await press(stdin, 'm');
      await tick();
      await press(stdin, key);
      await tick();
      expect(act[method]).toHaveBeenCalledWith('rebase');
      expect(load).toHaveBeenCalledTimes(1);
      expect(lastFrame()).toContain(message);
    });

    it('Enter runs the highlighted option and the arrows move it', async () => {
      const {stdin, act} = open('revert');
      await press(stdin, 'm');
      await tick();
      await press(stdin, '\u001B[B', '\r');
      await tick();
      expect(act.proceed).toHaveBeenCalledWith('revert');
      expect(act.abort).not.toHaveBeenCalled();
    });

    it('d and Esc leave it in progress without running anything', async () => {
      for (const key of ['d', '\u001B']) {
        const {stdin, lastFrame, act, load} = open('cherry-pick');
        await press(stdin, 'm');
        await tick();
        await press(stdin, key);
        expect(lastFrame()).toContain('cherry-pick deixado em andamento');
        expect(act.abort).not.toHaveBeenCalled();
        expect(load).not.toHaveBeenCalled();
      }
    });

    it('a failure shows the reason, refreshes the state and keeps going', async () => {
      const proceed = vi.fn().mockRejectedValue(new Error('error: you must resolve conflicts first'));
      const {stdin, lastFrame, load} = open('rebase', actions({proceed}));
      await press(stdin, 'm');
      await tick();
      await press(stdin, 'c');
      await tick();
      expect(lastFrame()).toContain('erro: you must resolve conflicts first');
      expect(load).toHaveBeenCalledTimes(1);
    });

    it('without conflicts it says the step is ready to continue', async () => {
      const {stdin, lastFrame} = open('rebase', actions({conflicts: vi.fn().mockResolvedValue([])}));
      await press(stdin, 'm');
      await tick();
      expect(lastFrame()).toContain('rebase em andamento: sem conflitos pendentes');
    });

    it('ignores the list keys and the mouse while the dialog is open', async () => {
      const {stdin, lastFrame} = open('rebase');
      await press(stdin, 'm');
      await tick();
      await press(stdin, 'j', 'q');
      expect(lastFrame()).toContain('Abortar o rebase');
      expect(lastFrame()).toContain('1/3');
    });
  });

  describe('branches and tags (b, t, T, R, D)', () => {
    const editor = (): RefActions => ({
      validate: vi.fn().mockResolvedValue(null),
      createBranch: vi.fn().mockResolvedValue(undefined),
      createTag: vi.fn().mockResolvedValue(undefined),
      renameBranch: vi.fn().mockResolvedValue(undefined),
      renameTag: vi.fn().mockResolvedValue(undefined),
      deleteBranch: vi.fn().mockResolvedValue(undefined),
      deleteTag: vi.fn().mockResolvedValue(undefined),
      uniqueCommits: vi.fn().mockResolvedValue(0),
    });
    const open = (refEdit: RefActions | undefined = editor(), load = vi.fn<LoadGraph>().mockResolvedValue(data(5))) => {
      const rendered = render(<Browser initial={data(5)} initialLimit={100} load={load} refEdit={refEdit} />);
      return {...rendered, load, refEdit};
    };

    it('b opens the name field on the selected commit; creating reloads and confirms', async () => {
      const {stdin, lastFrame, refEdit, load} = open();
      await press(stdin, 'j', 'b');
      expect(lastFrame()).toContain('Nova branch em h000001');
      // The list keys are the field's now: q and j are letters, not commands.
      await press(stdin, 'q', 'j');
      expect(lastFrame()).toContain('Nome: qj');
      await press(stdin, '\u007F', '\u007F', 'n', 'e', 'w', '\r');
      await tick();
      expect(refEdit.createBranch).toHaveBeenCalledWith('new', 'h000001');
      expect(load).toHaveBeenCalledTimes(1);
      expect(lastFrame()).toContain('branch new criada em h000001');
      expect(lastFrame()).not.toContain('Nova branch');
    });

    it('Esc closes it without doing anything', async () => {
      const {stdin, lastFrame, refEdit, load} = open();
      await press(stdin, 't');
      expect(lastFrame()).toContain('Nova tag em h000000');
      await press(stdin, '\u001B');
      expect(lastFrame()).not.toContain('Nova tag');
      expect(refEdit.createTag).not.toHaveBeenCalled();
      expect(load).not.toHaveBeenCalled();
    });

    it('R and D work on the refs of the commit; with none it says so', async () => {
      const {stdin, lastFrame} = open();
      // Row 0 holds the current branch main only: nothing to delete, but it can be renamed.
      await press(stdin, 'D');
      expect(lastFrame()).toContain('não dá para apagar a branch atual');
      await press(stdin, 'R');
      expect(lastFrame()).toContain('Renomear branch main');
      await press(stdin, '\u001B', 'j', 'R');
      expect(lastFrame()).toContain('nenhuma branch local nem tag neste commit');
      await press(stdin, 'D');
      expect(lastFrame()).toContain('nenhuma branch local nem tag neste commit');
      await press(stdin, 'j', 'D');
      expect(lastFrame()).toContain('Apagar branch feature?');
    });

    it('says so without the actions, on a stash and on the uncommitted node', async () => {
      const bare = render(<Browser initial={data(3)} initialLimit={100} load={vi.fn<LoadGraph>()} />);
      await press(bare.stdin, 'b');
      expect(bare.lastFrame()).toContain('indisponível');

      const commits = linear(3);
      commits[0] = {...commits[0]!, stash: true};
      const stashed = render(
        <Browser initial={{rows: layoutGraph(commits), refs}} initialLimit={100} load={vi.fn<LoadGraph>()} refEdit={editor()} />,
      );
      await press(stashed.stdin, 'b');
      expect(stashed.lastFrame()).toContain('um stash não é um commit da história');
      expect(stashed.lastFrame()).not.toContain('Nova branch');

      const wip: Commit = {
        ...commit(9, ['h000000']),
        hash: 'uncommitted',
        uncommitted: {staged: 0, modified: 1, untracked: 0, conflicted: 0},
      };
      const dirty = render(
        <Browser
          initial={{rows: layoutGraph([wip, ...linear(3)]), refs}}
          initialLimit={100}
          load={vi.fn<LoadGraph>()}
          refEdit={editor()}
        />,
      );
      await press(dirty.stdin, 'b');
      expect(dirty.lastFrame()).toContain('as alterações não commitadas não são um commit');
      expect(dirty.lastFrame()).not.toContain('Nova branch');
    });
  });

  describe('fetch (f) and upstream', () => {
    it('shows how far the current branch is from its upstream', () => {
      const upstreamRefs: RefInfo = {...refs, head: {...refs.head, upstream: {name: 'origin/main', ahead: 2, behind: 3}}};
      const {lastFrame} = render(
        <Browser initial={{rows: layoutGraph(linear(3)), refs: upstreamRefs}} initialLimit={100} load={vi.fn<LoadGraph>()} />,
      );
      expect(lastFrame()).toContain('atual: main ↑2 ↓3');
    });

    it('f fetches in the background, shows progress and reloads when done', async () => {
      let finish = () => {};
      const fetch = vi.fn(() => new Promise<void>(resolve => (finish = resolve)));
      const load = vi.fn<LoadGraph>().mockResolvedValue(data(5));
      const {lastFrame, stdin} = render(<Browser initial={data(5)} initialLimit={100} load={load} fetch={fetch} />);
      await press(stdin, 'f');
      expect(fetch).toHaveBeenCalledTimes(1);
      expect(lastFrame()).toContain('buscando remotas');
      // A second f while fetching does not start another one.
      await press(stdin, 'f');
      expect(fetch).toHaveBeenCalledTimes(1);
      expect(lastFrame()).toContain('já estou buscando');
      expect(load).not.toHaveBeenCalled();
      finish();
      await tick();
      await tick();
      expect(load).toHaveBeenCalledTimes(1);
      expect(lastFrame()).not.toContain('buscando remotas');
      expect(lastFrame()).toContain('remotas atualizadas');
    });

    it('shows the reason in the footer when the fetch fails and does not reload', async () => {
      const fetch = vi.fn().mockRejectedValue(new Error('fatal: unable to access remote'));
      const load = vi.fn<LoadGraph>();
      const {lastFrame, stdin} = render(<Browser initial={data(5)} initialLimit={100} load={load} fetch={fetch} />);
      await press(stdin, 'f');
      await tick();
      expect(lastFrame()).toContain('erro: unable to access remote');
      expect(lastFrame()).not.toContain('buscando remotas');
      expect(load).not.toHaveBeenCalled();
    });

    it('says so when there is no way to fetch', async () => {
      const {lastFrame, stdin} = render(<Browser initial={data(5)} initialLimit={100} load={vi.fn<LoadGraph>()} />);
      await press(stdin, 'f');
      expect(lastFrame()).toContain('fetch indisponível');
    });
  });

  describe('uncommitted changes node', () => {
    const withNode = (): GraphData => {
      const real = linear(3);
      const node: Commit = {
        hash: 'uncommitted',
        parents: [real[0]?.hash ?? ''],
        author: '',
        email: '',
        date: '2026-03-04T10:00:00+00:00',
        subject: 'Alterações não commitadas (1 modificado, 2 não rastreados)',
        body: '',
        uncommitted: {staged: 0, modified: 1, untracked: 2, conflicted: 0},
      };
      return {rows: layoutGraph([node, ...real]), refs};
    };
    const open = () => {
      const changes = {...noChanges, files: vi.fn(() => Promise.resolve([]))};
      const copy = vi.fn().mockResolvedValue('native');
      const checkout = vi.fn(() => Promise.resolve());
      const rendered = render(
        <Browser initial={withNode()} initialLimit={100} load={vi.fn<LoadGraph>()} changes={changes} copy={copy} checkout={checkout} />,
      );
      return {...rendered, changes, copy, checkout};
    };

    it('shows the node on top with its counts, without author or hash', () => {
      const {lastFrame} = open();
      const frame = lastFrame() ?? '';
      expect(frame).toContain('working');
      expect(frame).toContain('Alterações não commitadas (1 modificado, 2 não rastreados)');
      expect(frame).toContain('1/4');
      const line = frame.split('\n').find(l => l.includes('working')) ?? '';
      expect(line).not.toContain('Ana');
      expect(line).not.toMatch(/\d{4}-\d{2}-\d{2}/);
    });

    it('describes it in the details panel instead of a commit', () => {
      const {lastFrame} = open();
      const frame = lastFrame() ?? '';
      expect(frame).toContain('sobre o HEAD (h000000)');
      expect(frame).toContain('1 modificado, 2 não rastreados');
      expect(frame).not.toContain('@example.com');
    });

    it('does not open, copy or check out the node, and says why', async () => {
      const {lastFrame, stdin, changes, copy, checkout} = open();
      await press(stdin, '\r');
      expect(lastFrame()).toContain('não há o que abrir');
      expect(changes.files).not.toHaveBeenCalled();
      await press(stdin, 'y');
      expect(lastFrame()).toContain('não há hash');
      expect(copy).not.toHaveBeenCalled();
      await press(stdin, 'c');
      expect(lastFrame()).toContain('não há o que fazer checkout');
      expect(lastFrame()).not.toContain('Enter/y confirma');
      expect(checkout).not.toHaveBeenCalled();
      await press(stdin, 'm');
      expect(lastFrame()).toContain('não há o que mesclar');
    });

    it('the commits under it still open normally', async () => {
      const {lastFrame, stdin, changes} = open();
      await press(stdin, 'j', '\r');
      expect(changes.files).toHaveBeenCalledWith(expect.objectContaining({hash: 'h000000'}));
      expect(lastFrame()).toContain('Arquivos alterados');
    });
  });

  describe('date style', () => {
    const withDate = (date: 'short' | 'iso' | 'relative') =>
      render(
        <DisplayContext.Provider value={{color: false, ascii: false, spaced: true, date}}>
          <Browser initial={data(3)} initialLimit={100} load={vi.fn<LoadGraph>()} />
        </DisplayContext.Provider>,
      ).lastFrame() ?? '';

    it('writes the date in the list and details as asked', () => {
      const short = withDate('short');
      expect(short).toContain('Ana, 2026-03-04');
      expect(short).toContain('2026-03-04 10:00');
      expect(withDate('iso')).toContain('Ana, 2026-03-04 10:00');
      const relative = withDate('relative');
      expect(relative).toMatch(/Ana, há (\d+ (anos?|meses|mês)|\d+ semanas?)/);
      expect(relative).toContain('(2026-03-04 10:00)');
    });
  });

  describe('copy hash', () => {
    it('y copies the full hash of the selected commit and confirms', async () => {
      const copy = vi.fn().mockResolvedValue('native');
      const {lastFrame, stdin} = render(<Browser initial={data(5)} initialLimit={100} load={vi.fn<LoadGraph>()} copy={copy} />);
      await press(stdin, 'j', 'y');
      await tick();
      expect(copy).toHaveBeenCalledWith('h000001');
      expect(lastFrame()).toContain('hash copiado: h000001');
    });

    it('with OSC 52 it cannot confirm, so it shows the whole hash', async () => {
      const copy = vi.fn().mockResolvedValue('osc52');
      const {lastFrame, stdin} = render(<Browser initial={data(5)} initialLimit={100} load={vi.fn<LoadGraph>()} copy={copy} />);
      await press(stdin, 'y');
      await tick();
      expect(lastFrame()).toContain('OSC 52');
      expect(lastFrame()).toContain('h000000');
    });

    it('shows the hash when copying fails or there is no way to copy', async () => {
      const failing = vi.fn().mockRejectedValue(new Error('no clipboard'));
      const first = render(<Browser initial={data(5)} initialLimit={100} load={vi.fn<LoadGraph>()} copy={failing} />);
      await press(first.stdin, 'y');
      await tick();
      expect(first.lastFrame()).toContain('não foi possível copiar; hash: h000000');

      const second = render(<Browser initial={data(5)} initialLimit={100} load={vi.fn<LoadGraph>()} />);
      await press(second.stdin, 'y');
      expect(second.lastFrame()).toContain('hash: h000000');
    });
  });

  describe('refresh', () => {
    /** The history grown by one commit on top: what a `git commit` elsewhere would produce. */
    const grown = (): GraphData => {
      const old = linear(5);
      const fresh = commit(9, [old[0]?.hash ?? '']);
      return {rows: layoutGraph([fresh, ...old]), refs};
    };

    it('r reloads, keeps the selected commit and says so', async () => {
      const load = vi.fn<LoadGraph>().mockResolvedValue(grown());
      const {lastFrame, stdin} = render(<Browser initial={data(5)} initialLimit={100} load={load} />);
      await press(stdin, 'j', 'j');
      expect(lastFrame()).toContain('h000002');
      await press(stdin, 'r');
      await tick();
      expect(load).toHaveBeenCalledWith([], 100);
      // h000002 moved from row 3 to row 4 because of the new commit on top.
      expect(lastFrame()).toContain('4/6');
      expect(lastFrame()).toContain('atualizado');
    });

    it('a change reported by the watcher reloads the same way', async () => {
      const load = vi.fn<LoadGraph>().mockResolvedValue(grown());
      let notify = () => {};
      const watch = {
        subscribe: (listener: () => void) => {
          notify = listener;
          return () => {};
        },
      };
      const {lastFrame, stdin} = render(<Browser initial={data(5)} initialLimit={100} load={load} watch={watch} />);
      await press(stdin, 'j');
      notify();
      await tick();
      expect(load).toHaveBeenCalledTimes(1);
      expect(lastFrame()).toContain('3/6');
      expect(lastFrame()).toContain('o repositório mudou');
    });

    it('shows the error when the reload fails and keeps the list', async () => {
      const load = vi.fn<LoadGraph>().mockRejectedValue(new Error('boom'));
      const {lastFrame, stdin} = render(<Browser initial={data(5)} initialLimit={100} load={load} />);
      await press(stdin, 'r');
      await tick();
      expect(lastFrame()).toContain('erro: boom');
      expect(lastFrame()).toContain('1/5');
    });
  });

  describe('search', () => {
    // Subjects (index): 0 fix login, 1 add search, 2 fix cache, 3 docs, 4 fix typo.
    const subjects = ['fix login', 'add search', 'fix cache', 'docs', 'fix typo'];
    const searchable = (): GraphData => ({
      rows: layoutGraph(linear(5).map((c, i) => ({...c, subject: subjects[i] ?? '', author: i === 3 ? 'Bruno' : 'Ana'}))),
      refs,
    });
    const open = () => render(<Browser initial={searchable()} initialLimit={100} load={vi.fn<LoadGraph>()} />);
    const typeQuery = async (stdin: {write: (s: string) => void}, text: string) => {
      await press(stdin, 's', ...text.split(''));
    };

    it('jumps to the first match from the cursor as you type and shows the counter', async () => {
      const {lastFrame, stdin} = open();
      await typeQuery(stdin, 'fix');
      expect(lastFrame()).toContain('Buscar: fix');
      expect(lastFrame()).toContain('3 resultados');
      // The cursor is already on a match (row 0), so it stays.
      expect(lastFrame()).toContain('1/5');
      await press(stdin, '\u007F', '\u007F', '\u007F');
      await press(stdin, 'c', 'a', 'c');
      expect(lastFrame()).toContain('3/5');
      expect(lastFrame()).toContain('1 resultado');
    });

    it('finds by author and by hash', async () => {
      const {lastFrame, stdin} = open();
      await typeQuery(stdin, 'bruno');
      expect(lastFrame()).toContain('4/5');
      await press(stdin, '\u001B');
      await typeQuery(stdin, 'h000001');
      expect(lastFrame()).toContain('2/5');
    });

    it('Enter keeps the search; n and N walk the matches and wrap around', async () => {
      const {lastFrame, stdin} = open();
      await typeQuery(stdin, 'fix');
      await press(stdin, '\r');
      expect(lastFrame()).toContain('busca "fix" 1/3');
      expect(lastFrame()).toContain('n/N próximo/anterior');
      await press(stdin, 'n');
      expect(lastFrame()).toContain('3/5');
      expect(lastFrame()).toContain('busca "fix" 2/3');
      await press(stdin, 'n', 'n');
      expect(lastFrame()).toContain('1/5');
      await press(stdin, 'N');
      expect(lastFrame()).toContain('5/5');
    });

    it('marks the matching rows with * while the search is active', async () => {
      const {lastFrame, stdin} = open();
      await typeQuery(stdin, 'fix');
      await press(stdin, '\r');
      // Row 0 is the cursor (>); the other two matches carry the * marker.
      const lines = (lastFrame() ?? '').split('\n');
      expect(lines.filter(l => l.includes('*'))).toHaveLength(2);
      expect(lines.find(l => l.includes('fix cache'))).toContain('*');
      expect(lines.find(l => l.includes('fix typo'))).toContain('*');
      expect(lines.find(l => l.includes('add search'))).not.toContain('*');
      await press(stdin, '\u001B');
      expect(lastFrame()).not.toContain('busca "fix"');
      expect(lastFrame()).not.toContain('*');
    });

    it('Esc while typing restores the cursor and the previous search', async () => {
      const {lastFrame, stdin} = open();
      await typeQuery(stdin, 'docs');
      await press(stdin, '\r');
      expect(lastFrame()).toContain('4/5');
      await press(stdin, 'g');
      await typeQuery(stdin, 'typo');
      expect(lastFrame()).toContain('5/5');
      await press(stdin, '\u001B');
      expect(lastFrame()).toContain('1/5');
      expect(lastFrame()).toContain('busca "docs"');
    });

    it('says so when nothing is found and drops the search', async () => {
      const {lastFrame, stdin} = open();
      await typeQuery(stdin, 'zzz');
      expect(lastFrame()).toContain('nenhum resultado');
      await press(stdin, '\r');
      expect(lastFrame()).toContain('nenhum commit encontrado para "zzz"');
      expect(lastFrame()).not.toContain('busca "zzz"');
    });

    it('n without a search explains how to start one', async () => {
      const {lastFrame, stdin} = open();
      await press(stdin, 'n');
      expect(lastFrame()).toContain('aperte s para buscar');
    });

    describe('through history that is not loaded yet', () => {
      // 600 commits ("commit 0" newest); the list holds 100 at first and doubles on demand.
      const TOTAL = 600;
      const growing = () => {
        const load = vi.fn<LoadGraph>((_revs, limit) =>
          Promise.resolve({rows: layoutGraph(linear(Math.min(limit, TOTAL))), refs}),
        );
        const rendered = render(<Browser initial={{rows: layoutGraph(linear(100)), refs}} initialLimit={100} load={load} />);
        return {...rendered, load};
      };
      const settle = async () => {
        for (let i = 0; i < 6; i++) await tick();
      };

      it('Enter with no match among the loaded commits keeps loading until it finds one', async () => {
        const {stdin, lastFrame, load} = growing();
        await press(stdin, 's', ...'commit 450'.split(''));
        expect(lastFrame()).toContain('nenhum resultado carregado');
        expect(lastFrame()).toContain('Enter procura no resto do histórico');
        await press(stdin, '\r');
        await settle();
        // 100 -> 200 -> 400 -> 800 (600 exist).
        expect(load.mock.calls.map(c => c[1])).toEqual([200, 400, 800]);
        expect(lastFrame()).toContain('451/600');
        expect(lastFrame()).toContain('busca "commit 450" 1/1');
        expect(lastFrame()).not.toContain('procurando');
      });

      it('shows that it is searching, and Esc cancels it keeping the search', async () => {
        const pending: (() => void)[] = [];
        const load = vi.fn<LoadGraph>(
          () =>
            new Promise(resolve => {
              pending.push(() => resolve({rows: layoutGraph(linear(200)), refs}));
            }),
        );
        const {stdin, lastFrame} = render(
          <Browser initial={{rows: layoutGraph(linear(100)), refs}} initialLimit={100} load={load} />,
        );
        await press(stdin, 's', ...'commit 450'.split(''), '\r');
        expect(lastFrame()).toContain('procurando "commit 450" no histórico');
        await press(stdin, '\u001B');
        expect(lastFrame()).toContain('busca no histórico cancelada');
        // The load that was already running ends without taking the cursor anywhere.
        pending.forEach(resolve => resolve());
        await settle();
        expect(lastFrame()).toContain('1/200');
        expect(load).toHaveBeenCalledTimes(1);
      });

      it('gives up after the whole history, saying so', async () => {
        const {stdin, lastFrame, load} = growing();
        await press(stdin, 's', ...'zzz'.split(''), '\r');
        await settle();
        expect(load.mock.calls.map(c => c[1])).toEqual([200, 400, 800]);
        expect(lastFrame()).toContain('nenhum commit encontrado para "zzz" em todo o histórico');
        expect(lastFrame()).not.toContain('busca "zzz"');
      });

      it('n at the last loaded match goes on searching instead of wrapping around', async () => {
        const {stdin, lastFrame, load} = growing();
        // Matches in the first 100: 5, 50..59. After 59 the next one, 500, is not loaded yet.
        await press(stdin, 's', ...'commit 5'.split(''), '\r');
        expect(lastFrame()).toContain('6/100');
        for (let i = 0; i < 10; i++) await press(stdin, 'n');
        expect(lastFrame()).toContain('60/100');
        expect(load).not.toHaveBeenCalled();
        await press(stdin, 'n');
        await settle();
        expect(lastFrame()).toContain('501/600');
        expect(load.mock.calls.map(c => c[1])).toEqual([200, 400, 800]);
      });

      it('wraps around once the whole history is loaded', async () => {
        const {stdin, lastFrame, load} = growing();
        await press(stdin, 's', ...'commit 599'.split(''), '\r');
        await settle();
        expect(lastFrame()).toContain('600/600');
        load.mockClear();
        // 599 is the only match and the list is complete: n comes back to it, saying so.
        await press(stdin, 'n');
        await settle();
        expect(load).not.toHaveBeenCalled();
        expect(lastFrame()).toContain('a busca recomeçou do outro lado');
      });

      it('with a -n ceiling there is nothing more to load, so Enter reports it right away', async () => {
        const load = vi.fn<LoadGraph>();
        const {stdin, lastFrame} = render(
          <Browser initial={{rows: layoutGraph(linear(100)), refs}} initialLimit={100} maxCommits={100} load={load} />,
        );
        await press(stdin, 's', ...'commit 450'.split(''), '\r');
        expect(lastFrame()).toContain('nenhum commit encontrado para "commit 450"');
        expect(load).not.toHaveBeenCalled();
      });
    });

    it('does not take keys such as q or j as commands while typing', async () => {
      const {lastFrame, stdin} = open();
      await typeQuery(stdin, 'qj');
      expect(lastFrame()).toContain('Buscar: qj');
      expect(lastFrame()).toContain('nenhum resultado');
    });
  });
});
