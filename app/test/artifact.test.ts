import { existsSync, readFileSync } from 'node:fs';
import { describe, test, expect } from 'vitest';

const files = new URL('../dist/artifact-files.json', import.meta.url);
const describeIf = existsSync(files) ? describe : describe.skip;

/** Runs only after `npm run build:artifact`; guards the map the publish step relies on. */
describeIf('artifact file map', () => {
  const map = JSON.parse(readFileSync(files, 'utf8')) as Record<string, string>;

  test('lists the body mesh with a servable type, or an inlined manifest', () => {
    if ('body/body.bin' in map) expect(map['body/body.bin']).toBe('application/octet-stream');
    expect(map['body/body.json']).toBe('application/json');
  });

  test('lists exactly one entry script and one stylesheet, and the pdf worker', () => {
    const keys = Object.keys(map);
    expect(keys.filter((k) => /^assets\/index-.*\.js$/.test(k))).toHaveLength(1);
    expect(keys.filter((k) => /^assets\/index-.*\.css$/.test(k))).toHaveLength(1);
    expect(keys.some((k) => /pdf\.worker/.test(k))).toBe(true);
  });

  test('never lists the page itself', () => {
    expect(Object.keys(map)).not.toContain('index.html');
    expect(Object.keys(map)).not.toContain('artifact.html');
  });
});
