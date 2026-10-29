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
  /** Coluna da lane do pai logo após esta linha (índice em `lanesAfter`). */
  column: number;
}

export interface GraphRow {
  commit: Commit;
  /** Coluna do commit em `lanesBefore`. */
  column: number;
  /**
   * Lanes ao chegar nesta linha, sem buracos: cada posição é um hash esperado
   * e o índice é a coluna na tela. Uma ponta nova entra no fim da lista.
   */
  lanesBefore: string[];
  /** Idem, depois de processar o commit. */
  lanesAfter: string[];
  /** Cor de cada lane (paralelo a `lanesBefore`); a lane mantém a cor ao se deslocar. */
  colorsBefore: number[];
  /** Cor de cada lane (paralelo a `lanesAfter`). */
  colorsAfter: number[];
  /** Uma aresta por pai, na ordem de `commit.parents`. */
  edges: Edge[];
  /** Número de colunas necessárias para desenhar esta linha. */
  width: number;
}
