import {parseArgs} from 'node:util';

export interface CliOptions {
  /** Limite de commits; sem ele a TUI carrega sob demanda e o pipe imprime tudo. */
  maxCount: number | undefined;
  color: boolean;
  ascii: boolean;
  help: boolean;
  version: boolean;
}

/** Erro de uso da linha de comando (a CLI sai com código 2). */
export class UsageError extends Error {}

export const HELP = `gitgraph: mostra o grafo de branches do repositório git atual no terminal.

Uso: gitgraph [opções]

Opções:
  -n, --max-count <n>  mostra no máximo n commits (padrão: sem limite)
      --no-color       desliga as cores (também vale a variável NO_COLOR)
      --ascii          usa só caracteres ASCII no grafo
  -h, --help           mostra esta ajuda
  -v, --version        mostra a versão

No terminal a interface é interativa (j/k, setas, PgUp/PgDn, g/G, / filtra
por branch, q sai). Com a saída redirecionada (pipe), imprime texto puro.
`;

export function parseCliArgs(argv: string[], env: NodeJS.ProcessEnv = {}): CliOptions {
  let values;
  try {
    ({values} = parseArgs({
      args: argv,
      allowPositionals: false,
      options: {
        'max-count': {type: 'string', short: 'n'},
        'no-color': {type: 'boolean'},
        ascii: {type: 'boolean'},
        help: {type: 'boolean', short: 'h'},
        version: {type: 'boolean', short: 'v'},
      },
    }));
  } catch (error) {
    throw new UsageError(translate(error));
  }

  const raw = values['max-count'];
  if (raw !== undefined && !/^[1-9]\d*$/.test(raw)) {
    throw new UsageError(`--max-count deve ser um inteiro positivo (recebido: "${raw}")`);
  }
  return {
    maxCount: raw === undefined ? undefined : Number(raw),
    color: !values['no-color'] && !env['NO_COLOR'],
    ascii: values.ascii ?? false,
    help: values.help ?? false,
    version: values.version ?? false,
  };
}

function translate(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  const code = (error as NodeJS.ErrnoException).code;
  const quoted = /'([^']+)'/.exec(message)?.[1] ?? '';
  switch (code) {
    case 'ERR_PARSE_ARGS_UNKNOWN_OPTION':
      return `opção desconhecida: ${quoted}`;
    case 'ERR_PARSE_ARGS_INVALID_OPTION_VALUE':
      return `a opção ${quoted || 'informada'} exige um valor`;
    case 'ERR_PARSE_ARGS_UNEXPECTED_POSITIONAL':
      return `argumento inesperado: ${quoted}`;
    default:
      return message;
  }
}
