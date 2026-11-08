import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { PICTURES } from './pictures';

const ROOT = process.cwd();
const PUBLIC = join(ROOT, 'public', 'docs');

/** Every .tsx file under `dir`. */
function sources(dir: string): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) return sources(path);
    return path.endsWith('.tsx') ? [path] : [];
  });
}

/** Each <Shot …/> in the pages: its picture and the marks it asks for. */
function shots(): { file: string; name: string; marks: string[] }[] {
  const files = [...sources(join(ROOT, 'src', 'app')), ...sources(join(ROOT, 'src', 'components'))];
  return files.flatMap((file) =>
    [...readFileSync(file, 'utf8').matchAll(/<Shot\b([\s\S]*?)\/>/g)].map((match) => ({
      file,
      name: /name="([^"]+)"/.exec(match[1]!)?.[1] ?? '',
      marks: [...match[1]!.matchAll(/at: '([^']+)'/g)].map((at) => at[1]!),
    })),
  );
}

describe('the Docs pictures', () => {
  it('are each in public/docs, and nothing else is there', () => {
    const files = Object.values(PICTURES).map((picture) => picture.file);
    expect(readdirSync(PUBLIC).sort()).toEqual([...files].sort());
    for (const picture of Object.values(PICTURES)) {
      expect(picture.width).toBeGreaterThan(100);
      expect(picture.height).toBeGreaterThan(100);
    }
  });

  it('have every mark a page puts on them, inside the picture', () => {
    const found = shots();
    expect(found.length).toBeGreaterThan(10);
    for (const shot of found) {
      const picture = (PICTURES as Record<string, { marks: Record<string, readonly number[]> }>)[
        shot.name
      ];
      expect(picture, `${shot.file}: ${shot.name}`).toBeDefined();
      for (const mark of shot.marks) {
        const point = picture!.marks[mark];
        expect(point, `${shot.name}: ${mark}`).toBeDefined();
        for (const value of point!) {
          expect(value).toBeGreaterThanOrEqual(0);
          expect(value).toBeLessThanOrEqual(100);
        }
      }
    }
  });

  it('are all used', () => {
    const used = new Set(shots().map((shot) => shot.name));
    expect([...Object.keys(PICTURES)].filter((name) => !used.has(name))).toEqual([]);
  });
});
