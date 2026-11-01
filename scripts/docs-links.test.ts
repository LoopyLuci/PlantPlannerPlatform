import { readdir, readFile, stat } from 'node:fs/promises';
import { dirname, join, relative, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * Every relative link in every Markdown document must point at something that
 * exists. A broken link is a broken map for the next reader, human or agent.
 * External links and in-page anchors are not checked here.
 */

const ROOT = resolve(import.meta.dirname, '..');
const SKIP_DIRS = new Set(['node_modules', 'dist', 'coverage', '.vite', '.git']);

async function markdownFiles(dir: string): Promise<string[]> {
  const found: string[] = [];
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) {
      if (!SKIP_DIRS.has(entry.name)) found.push(...(await markdownFiles(path)));
    } else if (entry.name.endsWith('.md') && !entry.name.startsWith('We_are_going_to_design')) {
      // The design-chat export at the repository root is a private input, not a project document (TODO B-006).
      found.push(path);
    }
  }
  return found;
}

/** Inline link targets, ignoring fenced code blocks. */
export function linkTargets(markdown: string): string[] {
  const outsideFences = markdown.replace(/```[\s\S]*?```/g, '');
  return [...outsideFences.matchAll(/\]\(([^)\s]+)(?:\s+"[^"]*")?\)/g)].map((match) => match[1]);
}

async function exists(path: string): Promise<boolean> {
  try {
    await stat(path);
    return true;
  } catch {
    return false;
  }
}

describe('documentation links', () => {
  it('finds the documents it checks', async () => {
    const files = await markdownFiles(ROOT);
    expect(files.length).toBeGreaterThan(30);
  });

  it('points every relative link at a file or folder that exists', async () => {
    const broken: string[] = [];
    for (const file of await markdownFiles(ROOT)) {
      for (const target of linkTargets(await readFile(file, 'utf8'))) {
        if (/^(https?:|mailto:|#)/.test(target)) continue;
        const path = resolve(dirname(file), decodeURI(target.split('#')[0]));
        if (!(await exists(path))) broken.push(`${relative(ROOT, file)} -> ${target}`);
      }
    }
    expect(broken).toEqual([]);
  });
});
