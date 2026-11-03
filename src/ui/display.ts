import {createContext, useContext} from 'react';
import type {DateStyle} from './date.js';

/** Display options chosen on the command line. */
export interface Display {
  /** Lane and ref colors. Bold, dim and the selection highlight stay. */
  color: boolean;
  /** Only ASCII characters in the graph and the interface texts. */
  ascii: boolean;
  /** Connector line between all commits (`│`); off, one line per commit. */
  spaced: boolean;
  /** How commit dates are written; `short` when absent. */
  date?: DateStyle;
  /** Colors of the graph lanes (from the config file); the built-in palette when absent. */
  lanes?: readonly string[];
}

export const DisplayContext = createContext<Display>({color: true, ascii: false, spaced: true});

export const useDisplay = (): Display => useContext(DisplayContext);

/** Returns the color only when colors are on. */
export const tint = <T extends string>(display: Display, color: T | undefined): T | undefined =>
  display.color ? color : undefined;

/** Item separator in the interface texts. */
export const separator = (display: Display): string => (display.ascii ? '|' : '·');

/** The other symbols of the interface texts, with their ASCII forms; every one goes through here so `--ascii` covers it all. */
export const ellipsis = (display: Display): string => (display.ascii ? '...' : '…');
export const arrow = (display: Display): string => (display.ascii ? '->' : '→');
export const arrows = (display: Display): string => (display.ascii ? 'Up/Down' : '↑/↓');
/** A horizontal rule `width` characters long. */
export const rule = (display: Display, width: number): string => (display.ascii ? '-' : '─').repeat(width);
