import {createContext, useContext} from 'react';
import type {DateStyle} from './date.js';

/** Opções de exibição escolhidas na linha de comando. */
export interface Display {
  /** Cores de lane e de refs. Negrito, esmaecido e o destaque da seleção continuam. */
  color: boolean;
  /** Só caracteres ASCII no grafo e nos textos de interface. */
  ascii: boolean;
  /** Linha de ligação entre todos os commits (`│`); desligado, uma linha por commit. */
  spaced: boolean;
  /** How commit dates are written; `short` when absent. */
  date?: DateStyle;
  /** Colors of the graph lanes (from the config file); the built-in palette when absent. */
  lanes?: readonly string[];
}

export const DisplayContext = createContext<Display>({color: true, ascii: false, spaced: true});

export const useDisplay = (): Display => useContext(DisplayContext);

/** Devolve a cor só quando as cores estão ligadas. */
export const tint = <T extends string>(display: Display, color: T | undefined): T | undefined =>
  display.color ? color : undefined;

/** Separador de itens nos textos de interface. */
export const separator = (display: Display): string => (display.ascii ? '|' : '·');

/** The other symbols of the interface texts, with their ASCII forms; every one goes through here so `--ascii` covers it all. */
export const ellipsis = (display: Display): string => (display.ascii ? '...' : '…');
export const arrow = (display: Display): string => (display.ascii ? '->' : '→');
export const arrows = (display: Display): string => (display.ascii ? 'Up/Down' : '↑/↓');
/** A horizontal rule `width` characters long. */
export const rule = (display: Display, width: number): string => (display.ascii ? '-' : '─').repeat(width);
