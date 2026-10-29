import type {RefInfo} from '../git/refs.js';

export const ALL_LABEL = '(todas as branches)';

export interface PickerOption {
  label: string;
  /** Revisão passada ao git; null significa todas as branches. */
  rev: string | null;
}

/** Branches locais e remotas, sem repetição e em ordem alfabética. */
export function branchNames(refs: RefInfo): string[] {
  const names = new Set<string>();
  for (const list of refs.byCommit.values()) {
    for (const ref of list) {
      if (ref.kind === 'branch' || ref.kind === 'remote') names.add(ref.name);
    }
  }
  return [...names].sort((a, b) => a.localeCompare(b));
}

/** Opções do seletor: "todas" aparece só sem filtro; o filtro ignora maiúsculas. */
export function pickerOptions(names: string[], query: string): PickerOption[] {
  const needle = query.trim().toLowerCase();
  if (needle === '') {
    return [{label: ALL_LABEL, rev: null}, ...names.map(n => ({label: n, rev: n}))];
  }
  return names
    .filter(n => n.toLowerCase().includes(needle))
    .map(n => ({label: n, rev: n}));
}

/** Adds the branch to the selection, or removes it if it is already there. */
export function toggleBranch(selected: string[], name: string): string[] {
  return selected.includes(name) ? selected.filter(n => n !== name) : [...selected, name];
}

/**
 * Revisions to filter by when Enter is pressed: the checked branches (in list
 * order) or, with none checked, the highlighted option on its own. An empty
 * result means all branches; undefined means there is nothing to apply (no
 * option matches the query).
 */
export function chosenRevs(
  selected: string[],
  branches: string[],
  highlighted: PickerOption | undefined,
): string[] | undefined {
  if (selected.length > 0) return branches.filter(name => selected.includes(name));
  if (!highlighted) return undefined;
  return highlighted.rev === null ? [] : [highlighted.rev];
}
