import {createContext, useContext} from 'react';

/** Opções de exibição escolhidas na linha de comando. */
export interface Display {
  /** Cores de lane e de refs. Negrito, esmaecido e o destaque da seleção continuam. */
  color: boolean;
  /** Só caracteres ASCII no grafo e nos textos de interface. */
  ascii: boolean;
  /** Linha de ligação entre todos os commits (`│`); desligado, uma linha por commit. */
  spaced: boolean;
}

export const DisplayContext = createContext<Display>({color: true, ascii: false, spaced: true});

export const useDisplay = (): Display => useContext(DisplayContext);

/** Devolve a cor só quando as cores estão ligadas. */
export const tint = <T extends string>(display: Display, color: T | undefined): T | undefined =>
  display.color ? color : undefined;

/** Separador de itens nos textos de interface. */
export const separator = (display: Display): string => (display.ascii ? '|' : '·');
