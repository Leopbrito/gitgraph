export interface Commit {
  hash: string;
  parents: string[];
  author: string;
  email: string;
  /** Data do autor em ISO 8601. */
  date: string;
  subject: string;
  body: string;
}

export type RefKind = 'branch' | 'remote' | 'tag';

export interface Ref {
  name: string;
  kind: RefKind;
}

/** Aresta de um commit para um de seus pais. */
export interface Edge {
  parent: string;
  /** Coluna da lane do pai logo após esta linha. */
  column: number;
}

export interface GraphRow {
  commit: Commit;
  /** Coluna onde o commit é desenhado. */
  column: number;
  /** Hash esperado por cada lane ao chegar nesta linha (null = livre). */
  lanesBefore: (string | null)[];
  /** Idem, depois de processar o commit. */
  lanesAfter: (string | null)[];
  /** Uma aresta por pai, na ordem de `commit.parents`. */
  edges: Edge[];
  /** Número de colunas necessárias para desenhar esta linha. */
  width: number;
}
