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
