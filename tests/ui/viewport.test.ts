import {describe, expect, it} from 'vitest';
import {centerWindow, clamp, itemAt, scrollIntoView, visibleEnd} from '../../src/ui/viewport.js';

describe('visibleEnd', () => {
  it('conta itens de altura 1', () => {
    expect(visibleEnd([1, 1, 1, 1, 1], 0, 3)).toBe(3);
    expect(visibleEnd([1, 1, 1, 1, 1], 3, 3)).toBe(5);
  });

  it('considera itens de altura 2', () => {
    // 2 + 1 = 3 cabe; o próximo item (2) não.
    expect(visibleEnd([2, 1, 2, 1], 0, 3)).toBe(2);
    expect(visibleEnd([2, 1, 2, 1], 0, 5)).toBe(3);
  });

  it('mostra ao menos o primeiro item mesmo que exceda a janela', () => {
    expect(visibleEnd([5, 1], 0, 3)).toBe(1);
  });

  it('lista vazia', () => {
    expect(visibleEnd([], 0, 3)).toBe(0);
  });
});

describe('scrollIntoView', () => {
  const heights = [1, 1, 2, 1, 1, 2, 1, 1];

  it('mantém o offset quando o item já está visível', () => {
    expect(scrollIntoView(heights, 0, 2, 5)).toBe(0);
  });

  it('volta para o item acima da janela', () => {
    expect(scrollIntoView(heights, 4, 1, 5)).toBe(1);
  });

  it('avança o mínimo para mostrar o item abaixo', () => {
    const offset = scrollIntoView(heights, 0, 5, 5);
    expect(visibleEnd(heights, offset, 5)).toBeGreaterThan(5);
    // Um offset menor não mostraria o item.
    expect(visibleEnd(heights, offset - 1, 5)).toBeLessThanOrEqual(5);
  });
});

describe('clamp e centerWindow', () => {
  it('clamp limita ao intervalo', () => {
    expect(clamp(-1, 0, 4)).toBe(0);
    expect(clamp(9, 0, 4)).toBe(4);
    expect(clamp(2, 0, 4)).toBe(2);
  });

  it('centerWindow centraliza sem sair da lista', () => {
    expect(centerWindow(10, 0, 4)).toBe(0);
    expect(centerWindow(10, 5, 4)).toBe(3);
    expect(centerWindow(10, 9, 4)).toBe(6);
    expect(centerWindow(2, 1, 4)).toBe(0);
  });
});

describe('itemAt', () => {
  it('maps a line to the item shown there', () => {
    expect(itemAt([1, 1, 1, 1], 0, 0, 3)).toBe(0);
    expect(itemAt([1, 1, 1, 1], 0, 2, 3)).toBe(2);
    // The window starts at the offset.
    expect(itemAt([1, 1, 1, 1, 1], 2, 1, 3)).toBe(3);
  });

  it('counts the connector line as part of the item above it', () => {
    // Lines: 0-1 item 0, 2 item 1, 3-4 item 2.
    expect(itemAt([2, 1, 2], 0, 1, 5)).toBe(0);
    expect(itemAt([2, 1, 2], 0, 2, 5)).toBe(1);
    expect(itemAt([2, 1, 2], 0, 4, 5)).toBe(2);
  });

  it('returns null outside the window, past the last item or on a cut item', () => {
    expect(itemAt([1, 1, 1, 1], 0, -1, 3)).toBeNull();
    expect(itemAt([1, 1, 1, 1], 0, 3, 3)).toBeNull();
    expect(itemAt([1, 1], 0, 2, 5)).toBeNull();
    // The second item (2 lines) does not fit in the last line, so it is not shown.
    expect(itemAt([1, 2], 0, 2, 2)).toBeNull();
    expect(itemAt([2, 2], 0, 2, 3)).toBeNull();
  });
});
