import {describe, expect, it} from 'vitest';
import {ConfigError, configPath, isColor, loadConfig, parseConfig} from '../src/config.js';

const src = '/cfg/gitgraph/config.json';

describe('configPath', () => {
  it('uses XDG_CONFIG_HOME when it is absolute, else ~/.config', () => {
    expect(configPath({XDG_CONFIG_HOME: '/x/cfg'}, '/home/ana')).toBe('/x/cfg/gitgraph/config.json');
    expect(configPath({}, '/home/ana')).toBe('/home/ana/.config/gitgraph/config.json');
    // The spec says a relative or empty value must be ignored.
    expect(configPath({XDG_CONFIG_HOME: 'relative'}, '/home/ana')).toBe('/home/ana/.config/gitgraph/config.json');
    expect(configPath({XDG_CONFIG_HOME: ''}, '/home/ana')).toBe('/home/ana/.config/gitgraph/config.json');
  });
});

describe('parseConfig', () => {
  it('accepts every key', () => {
    const text = JSON.stringify({
      maxCount: 200,
      order: 'topo',
      date: 'relative',
      compact: true,
      ascii: false,
      color: true,
      stash: false,
      mouse: false,
      watch: true,
      colors: {lanes: ['cyan', '#FF8800', 'redBright']},
    });
    expect(parseConfig(text, src)).toEqual(JSON.parse(text));
  });

  it('accepts an empty object', () => {
    expect(parseConfig('{}', src)).toEqual({});
  });

  it.each([
    ['{"order": "newest"}', '"order" deve ser date, author-date, topo (recebido: "newest")'],
    ['{"date": 3}', '"date" deve ser short, iso, relative'],
    ['{"compact": "yes"}', '"compact" deve ser true ou false (recebido: "yes")'],
    ['{"maxCount": 0}', '"maxCount" deve ser um inteiro positivo'],
    ['{"maxCount": 1.5}', '"maxCount" deve ser um inteiro positivo'],
    ['{"compat": true}', 'chave desconhecida "compat"'],
    ['{"colors": []}', '"colors" deve ser um objeto'],
    ['{"colors": {"lane": []}}', 'chave desconhecida "colors.lane"'],
    ['{"colors": {"lanes": []}}', '"colors.lanes" deve ser uma lista não vazia'],
    ['{"colors": {"lanes": ["cyan", "pink"]}}', '"colors.lanes" deve ser uma lista não vazia de cores'],
    ['[]', 'deve conter um objeto JSON'],
    ['not json', 'JSON inválido'],
  ])('rejects %s', (text, message) => {
    const attempt = () => parseConfig(text, src);
    expect(attempt).toThrow(ConfigError);
    expect(attempt).toThrow(message);
    // Every message names the file.
    expect(attempt).toThrow(src);
  });
});

describe('isColor', () => {
  it('knows names and #rrggbb', () => {
    expect(['red', 'cyanBright', 'gray', '#00ff00', '#ABCDEF'].every(isColor)).toBe(true);
    expect(['pink', '#fff', '#12345g', '', 3, null].some(isColor)).toBe(false);
  });
});

describe('loadConfig', () => {
  it('returns {} when the file does not exist', () => {
    const read = () => {
      throw Object.assign(new Error('nope'), {code: 'ENOENT'});
    };
    expect(loadConfig({XDG_CONFIG_HOME: '/cfg'}, read)).toEqual({});
  });

  it('reads and validates the file at the config path', () => {
    const read = (path: string) => {
      expect(path).toBe('/cfg/gitgraph/config.json');
      return '{"order": "topo"}';
    };
    expect(loadConfig({XDG_CONFIG_HOME: '/cfg'}, read)).toEqual({order: 'topo'});
  });

  it('turns other read failures into a ConfigError that names the file', () => {
    const read = () => {
      throw Object.assign(new Error('permission denied'), {code: 'EACCES'});
    };
    expect(() => loadConfig({XDG_CONFIG_HOME: '/cfg'}, read)).toThrow(/config\.json: não foi possível ler/);
  });
});
