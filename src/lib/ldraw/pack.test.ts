import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { LDrawLoader } from 'three/addons/loaders/LDrawLoader.js';
import { LDrawConditionalLineMaterial } from 'three/addons/materials/LDrawConditionalLineMaterial.js';
import type { Group, Object3D } from 'three';
import { partKey } from './model';
import { loaderName, packModel, readShapeLibrary } from './pack';
import { DRIVING_BASE, DRIVING_BASE_MPD, IDENTITY, realBoxTable } from './test-models';

const LDRAW = join(process.cwd(), 'third_party', 'ldraw');
const table = realBoxTable();
const shapes = readShapeLibrary(JSON.parse(readFileSync(join(LDRAW, 'shapes.json'), 'utf8')))!;
const fetched: string[] = [];
const fromDisk = (path: string) => {
  fetched.push(path);
  return Promise.resolve(readFileSync(join(LDRAW, 'library', path), 'latin1'));
};

/** Every file the packed text places is a `0 FILE` in it, by LDrawLoader's names. */
function unresolved(text: string): string[] {
  const files = new Set(
    [...text.matchAll(/^0 FILE (.+)$/gm)].map((match) => match[1]!.toLowerCase()),
  );
  return [...text.matchAll(/^1(?:\s+\S+){13}\s+(.+)$/gm)]
    .map((match) => loaderName(match[1]!).toLowerCase())
    .filter((name) => !files.has(name));
}

afterEach(() => vi.unstubAllGlobals());

describe('a model packed for the 3D view', () => {
  it('lists the shapes this site serves', () => {
    expect(shapes.release).toBe('ldraw.org Parts Update 2026-10');
    expect(shapes.files.size).toBe(1622);
    expect(shapes.files.get('45601')).toBe('parts/45601.dat');
    expect(shapes.files.get('s/39367s01')).toBe('parts/s/39367s01.dat');
    expect(shapes.files.get('48/4-4cyli')).toBe('p/48/4-4cyli.dat');
    expect(shapes.files.get('stud')).toBe('p/stud.dat');
    // Every listed file is there.
    for (const path of shapes.files.values())
      expect(() => readFileSync(join(LDRAW, 'library', path))).not.toThrow();
    // Paths only inside the folder.
    expect(
      readShapeLibrary({
        format: 'matpilot-ldraw-shapes',
        files: { a: '../x.dat', b: 'parts/b.dat' },
      })!.files,
    ).toEqual(new Map([['b', 'parts/b.dat']]));
  });

  it('carries every file the driving base needs, the model first', async () => {
    fetched.length = 0;
    const packed = await packModel(DRIVING_BASE, 'base.ldr', shapes, table, fromDisk);
    expect(packed.text.startsWith('0 FILE base.ldr\n')).toBe(true);
    expect(unresolved(packed.text)).toEqual([]);
    expect(packed).toMatchObject({ shapes: 5, boxes: [], missing: [] });
    // Each file fetched once.
    expect(new Set(fetched).size).toBe(fetched.length);
  });

  it('names submodels and sub-parts as LDrawLoader looks them up', async () => {
    const packed = await packModel(DRIVING_BASE_MPD, 'base.mpd', shapes, table, fromDisk);
    expect(unresolved(packed.text)).toEqual([]);
    expect(packed.text).toContain('\n0 FILE drive.ldr\n');
    expect(packed.text).toContain('\n0 FILE parts/s/39367s01.dat\n');
    expect(packed.text).toContain('\n0 FILE p/48/4-4cyli.dat\n');
    expect(loaderName('S\\x.dat')).toBe('parts/S/x.dat');
    expect(loaderName('8\\4-4cyli.dat')).toBe('8/4-4cyli.dat');
  });

  it('draws a part it has no shape for as a box of its size, and one it does not know as nothing', async () => {
    const text = [
      DRIVING_BASE,
      `1 4 0 -24 300 ${IDENTITY} 3001.dat`,
      `1 4 0 0 400 ${IDENTITY} 99999zz.dat`,
    ].join('\n');
    const packed = await packModel(text, 'base.ldr', shapes, table, fromDisk);
    expect(packed).toMatchObject({ shapes: 5, boxes: ['3001'], missing: ['99999zz'] });
    expect(unresolved(packed.text)).toEqual([]);
    const brick = packed.text.slice(packed.text.indexOf('0 FILE 3001.dat'));
    expect(brick.split('\n').slice(1, 4)).toEqual([
      '0 Box for 3001.dat',
      '0 !LDRAW_ORG Unofficial_Part',
      '4 16 -40 -4 -20 40 -4 -20 40 -4 20 -40 -4 20',
    ]);
    expect(partKey('3001.dat')).toBe('3001');
  });

  it('is read by three.js’s LDrawLoader without fetching anything', async () => {
    const colours = readFileSync(join(LDRAW, 'LDConfig.ldr'), 'latin1');
    const fetches: string[] = [];
    // three.js's FileLoader reports progress with the browser's ProgressEvent, which Node lacks.
    vi.stubGlobal(
      'ProgressEvent',
      class extends Event {
        constructor(type: string, init: Record<string, unknown> = {}) {
          super(type);
          Object.assign(this, init);
        }
      },
    );
    vi.stubGlobal('fetch', (input: RequestInfo | URL) => {
      const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
      fetches.push(url);
      return Promise.resolve(
        new Response(url.endsWith('LDConfig.ldr') ? colours : '', {
          status: url.endsWith('LDConfig.ldr') ? 200 : 404,
        }),
      );
    });
    const packed = await packModel(DRIVING_BASE_MPD, 'base.mpd', shapes, table, fromDisk);
    const loader = new LDrawLoader();
    loader.setConditionalLineMaterial(LDrawConditionalLineMaterial);
    await loader.preloadMaterials('http://site/vendor/ldraw/LDConfig.ldr');
    const group = await new Promise<Group>((resolve, reject) =>
      loader.parse(packed.text, resolve, reject),
    );
    expect(fetches).toEqual(['http://site/vendor/ldraw/LDConfig.ldr']);
    const names: string[] = [];
    group.traverse((object: Object3D) => {
      if (object.name) names.push(object.name.toLowerCase());
    });
    for (const part of [
      '45601.dat',
      '39367p01.dat',
      '54696p01.dat',
      '37308.dat',
      '37316.dat',
      'drive.ldr',
    ]) {
      expect(names, part).toContain(part);
    }
    let meshes = 0;
    group.traverse((object: Object3D) => {
      if ((object as { isMesh?: boolean }).isMesh) meshes += 1;
    });
    expect(meshes).toBeGreaterThan(5);
  });
});
