import {readFileSync} from 'node:fs';
import {join} from 'node:path';
import {describe, expect, it} from 'vitest';

const root = join(import.meta.dirname, '..');
const read = (file: string) => readFileSync(join(root, file), 'utf8');
const pkg = JSON.parse(read('package.json')) as Record<string, any>;

describe('package.json is ready to publish', () => {
  it('has a version that is valid semver and the metadata npm shows', () => {
    expect(pkg.version).toMatch(/^\d+\.\d+\.\d+$/);
    expect(pkg.license).toBe('MIT');
    expect(pkg.description).toBeTruthy();
    expect(pkg.repository?.url).toContain('github.com/Leopbrito/gitgraph');
    expect(pkg.bugs?.url).toContain('/issues');
    expect(pkg.keywords).toContain('git');
  });

  it('publishes only the build, the README and the LICENSE', () => {
    expect(pkg.files).toEqual(['dist', 'README.md', 'LICENSE']);
    expect(read('LICENSE')).toContain('MIT License');
  });

  it('installs the gitgraph command from dist/cli.js, which the build produces', () => {
    expect(pkg.bin).toEqual({gitgraph: 'dist/cli.js'});
    // The entry point must start with the shebang, or the installed command cannot run.
    expect(read('src/cli.tsx').startsWith('#!/usr/bin/env node\n')).toBe(true);
    expect(read('tsconfig.build.json')).toContain('"rootDir": "src"');
  });

  it('declares the Node version Ink needs and a clean, tested build before publishing', () => {
    expect(pkg.engines.node).toBe('>=22');
    expect(pkg.scripts.prepublishOnly).toBe('npm run typecheck && npm test && npm run build');
    expect(pkg.scripts.prebuild).toContain('dist');
    expect(pkg.type).toBe('module');
  });

  it('does not use the name another package owns on npm', () => {
    expect(pkg.name).not.toBe('gitgraph');
  });

  it('does not ship test tools as dependencies', () => {
    expect(Object.keys(pkg.dependencies).sort()).toEqual(['ink', 'react']);
  });
});

describe('release workflow', () => {
  const release = read('.github/workflows/release.yml');

  it('publishes on version tags only, checking that the tag matches the version', () => {
    expect(release).toContain("tags: ['v*.*.*']");
    expect(release).toContain("require('./package.json').version");
    expect(release).toContain('npm publish --provenance');
  });

  it('takes the token from a secret, never from the file', () => {
    expect(release).toContain('secrets.NPM_TOKEN');
    expect(release).not.toMatch(/npm_[A-Za-z0-9]{20,}/);
  });

  it('can publish with provenance (id-token) and create the release (contents: write)', () => {
    expect(release).toContain('id-token: write');
    expect(release).toContain('contents: write');
  });
});

describe('ci workflow', () => {
  it('runs typecheck, build and tests, and previews the pack', () => {
    const ci = read('.github/workflows/ci.yml');
    for (const step of ['npm ci', 'npm run typecheck', 'npm run build', 'npm test', 'npm pack --dry-run']) {
      expect(ci).toContain(step);
    }
  });
});
