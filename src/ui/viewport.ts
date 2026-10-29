/**
 * Janela de linhas visíveis de uma lista cujos itens ocupam alturas
 * diferentes (um commit com linha de ligação ocupa 2 linhas).
 */

/** Índice (exclusivo) do último item que cabe em `viewHeight` a partir de `offset`. */
export function visibleEnd(heights: number[], offset: number, viewHeight: number): number {
  let used = 0;
  let i = offset;
  for (; i < heights.length; i++) {
    const h = heights[i] ?? 1;
    // O primeiro item sempre aparece, mesmo que sozinho exceda a janela.
    if (i > offset && used + h > viewHeight) break;
    used += h;
  }
  return i;
}

/** Menor deslocamento que mantém `selected` visível, partindo de `offset`. */
export function scrollIntoView(
  heights: number[],
  offset: number,
  selected: number,
  viewHeight: number,
): number {
  if (selected < offset) return selected;
  let next = offset;
  while (next < selected && visibleEnd(heights, next, viewHeight) <= selected) next++;
  return next;
}

export function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(value, max));
}

/** Início de uma janela de `size` itens que mantém `index` perto do centro. */
export function centerWindow(length: number, index: number, size: number): number {
  return clamp(index - Math.floor(size / 2), 0, Math.max(0, length - size));
}
