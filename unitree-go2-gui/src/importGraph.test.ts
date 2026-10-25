/// <reference types="node" />
import { describe, it, expect } from 'vitest';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { filter, flatMap, fromEntries, isTruthy, map, pipe } from 'remeda';

const SRC = dirname(fileURLToPath(import.meta.url));
const SPECIFIER = /(?:import|export)\b[^'";]*?from\s*['"]([^'"]+)['"]|import\s*\(?\s*['"]([^'"]+)['"]/g;

/** The source file a relative specifier names, or undefined for a package or a missing file. */
function resolveImport(_from: string, _specifier: string) {
  if (!_specifier.startsWith('.')) return undefined;
  const base = resolve(dirname(_from), _specifier);
  return [base, `${base}.ts`, `${base}.svelte`, join(base, 'index.ts')].find(existsSync);
}

/** Every relative import of every source file under `_root`, type-only imports included. */
function importGraph(_root: string): Record<string, string[]> {
  const files = readdirSync(_root, { recursive: true, encoding: 'utf8' })
    .filter((_path) => /\.(ts|svelte)$/.test(_path))
    .map((_path) => join(_root, _path));
  return fromEntries(
    files.map((_file) => {
      const code = readFileSync(_file, 'utf8').replace(/^\s*\/\/.*$/gm, '');
      return [
        _file,
        pipe(
          [...code.matchAll(SPECIFIER)],
          map((_match) => resolveImport(_file, _match[1] ?? _match[2])),
          filter(isTruthy),
        ),
      ];
    }),
  );
}

/** One path per cycle found by depth-first search, each closed on its first node. */
function cycles(_graph: Record<string, string[]>) {
  const done = new Set<string>();
  const found: string[][] = [];
  function visit(_node: string, _path: string[]) {
    const at = _path.indexOf(_node);
    if (at !== -1) {
      found.push([..._path.slice(at), _node]);
      return;
    }
    if (done.has(_node)) return;
    (_graph[_node] ?? []).forEach((_next) => visit(_next, [..._path, _node]));
    done.add(_node);
  }
  Object.keys(_graph).forEach((_node) => visit(_node, []));
  return found;
}

describe('the import graph of src/', () => {
  const graph = importGraph(SRC);

  it('is read from every file, type-only imports included', () => {
    const edges = flatMap(Object.entries(graph), ([_from, _to]) =>
      _to.map((_target) => `${relative(SRC, _from)} -> ${relative(SRC, _target)}`),
    );
    expect(edges).toContain('lib/stores/robot.ts -> lib/utils/confirmable.ts');
    expect(edges).toContain('App.svelte -> lib/stores/robot.ts');
  });

  it('has no cycle', () => {
    expect(cycles(graph).map((_cycle) => _cycle.map((_file) => relative(SRC, _file)))).toEqual([]);
  });

  it('reports the cycle in a graph that has one', () => {
    expect(cycles({ a: ['b'], b: ['c'], c: ['a'], d: ['a'] })).toEqual([['a', 'b', 'c', 'a']]);
  });
});
