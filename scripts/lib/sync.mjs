// Shared by sync-figma.mjs (manifest) and pull-figma.mjs (Figma REST API): normalizes the icons taken
// from Figma and replaces fonts/<font>/source/ with them, saving their Figma names and order.
import { cpSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';

import { FIGMA_FILE, readTrash, slug, toIconName, TRASH_DIR, TRASH_FILE } from './fonts.mjs';

const CONCURRENCY = 8;

/**
 * Entries { name, category, ...rest } in Figma order -> icons { name, category, label, file, ...rest }:
 * name "<prefix>-<kebab-case>" (a name that already starts with the prefix keeps it once), category a
 * kebab-case folder or null, label the Figma category name. Throws listing every invalid entry.
 */
export function normalizeEntries(entries, prefix) {
  const errors = [];
  const seen = new Map();
  const icons = entries.map((entry, index) => {
    const where = `icons[${index}] (${entry?.name ?? 'no name'})`;
    const name = toIconName(entry?.name ?? '', prefix);
    const category = entry?.category ? slug(entry.category) : null;
    if (!name) errors.push(`${where}: the name has no letters or digits.`);
    if (entry?.category && !category) errors.push(`${where}: the category has no letters or digits.`);
    if (seen.has(name)) errors.push(`${where}: "${name}" is duplicated (also ${seen.get(name)}).`);
    seen.set(name, where);
    return {
      ...entry,
      name,
      category,
      label: category ? String(entry.category).trim() : null,
      file: category ? `${category}/${name}.svg` : `${name}.svg`,
    };
  });
  if (errors.length) throw new Error(`Invalid icons:\n  ${errors.join('\n  ')}`);
  return icons;
}

/** Current source/: icon name -> relative file (category/name.svg or name.svg). */
function readCurrent(sourceDir) {
  const current = new Map();
  if (!existsSync(sourceDir)) return current;
  for (const file of readdirSync(sourceDir, { recursive: true })) {
    const path = String(file).replace(/\\/g, '/');
    if (path.toLowerCase().endsWith('.svg')) current.set(path.split('/').pop().slice(0, -4), path);
  }
  return current;
}

/** What replacing source/ with these icons changes: { added, moved, removed } as file lists. */
export function diffSource(sourceDir, icons) {
  const current = readCurrent(sourceDir);
  const kept = new Set(icons.map((icon) => icon.name));
  return {
    added: icons.filter((icon) => !current.has(icon.name)).map((icon) => icon.file),
    moved: icons
      .filter((icon) => current.has(icon.name) && current.get(icon.name) !== icon.file)
      .map((icon) => `${current.get(icon.name)} -> ${icon.file}`),
    removed: [...current].filter(([name]) => !kept.has(name)).map(([, file]) => file),
  };
}

/** Prints the totals and the diff, as every sync shows it. */
export function logSync(tag, fontName, icons, diff, dryRun) {
  const categories = new Set(icons.map((icon) => icon.category).filter(Boolean));
  const uncategorized = icons.filter((icon) => !icon.category).length;
  console.log(
    `[${tag}] ${fontName}: ${icons.length} icons from Figma (${categories.size} categories` +
      `${uncategorized ? `, ${uncategorized} uncategorized` : ''})${dryRun ? ' [dry run]' : ''}`,
  );
  if (diff.added.length) console.log(`  added (${diff.added.length}):   ${diff.added.join(', ')}`);
  if (diff.moved.length) console.log(`  moved (${diff.moved.length}):   ${diff.moved.join(', ')}`);
  if (diff.removed.length) console.log(`  removed, to trash/ (${diff.removed.length}): ${diff.removed.join(', ')}`);
}

const escapeXml = (text) =>
  text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/**
 * Keeps only <g id="<layer>"> (and the root <defs>) inside the export's root <svg>, dropping everything
 * Figma painted around the icon. Returns null if the export has no such group.
 */
export function isolateLayer(svg, layer) {
  const start = svg.indexOf(`<g id="${escapeXml(layer)}"`);
  if (start < 0) return null;
  const tag = /<g\b[^>]*?(\/?)>|<\/g>/g;
  tag.lastIndex = start;
  let depth = 0;
  for (let match = tag.exec(svg); match; match = tag.exec(svg)) {
    if (match[0] === '</g>') depth--;
    else if (!match[1]) depth++;
    if (depth === 0) {
      const end = match.index + match[0].length;
      const open = svg.match(/<svg\b[^>]*>/)[0];
      const defs = svg.match(/<defs>[\s\S]*?<\/defs>/g)?.join('\n') ?? '';
      return `${open}\n${defs ? `${defs}\n` : ''}${svg.slice(start, end)}\n</svg>\n`;
    }
  }
  return null;
}

const readJson = (path, fallback) => (existsSync(path) ? JSON.parse(readFileSync(path, 'utf8')) : fallback);

/**
 * Moves the icons no longer in Figma from source/ to trash/ (with their codepoint, from the last build,
 * kept reserved) and takes out of the trash the icons that are back. Returns { trashed, restored }.
 */
function updateTrash(fontDir, fontName, icons) {
  const sourceDir = join(fontDir, 'source');
  const trashDir = join(fontDir, TRASH_DIR);
  const current = readCurrent(sourceDir);
  const kept = new Set(icons.map((icon) => icon.name));
  const codepoints = readJson(join(fontDir, 'dist', `${fontName}.json`), {});
  const figma = readJson(join(sourceDir, FIGMA_FILE), { categories: [] });
  const labels = new Map(figma.categories.map((category) => [category.folder, category.name]));
  const today = new Date().toISOString().slice(0, 10);

  const trash = readTrash(fontDir);
  const restored = trash.filter((entry) => kept.has(entry.name));
  for (const entry of restored) if (entry.file) rmSync(join(trashDir, entry.file), { force: true });
  const entries = trash.filter((entry) => !kept.has(entry.name));

  const trashed = [...current].filter(([name]) => !kept.has(name));
  for (const [name, file] of trashed) {
    mkdirSync(dirname(join(trashDir, file)), { recursive: true });
    cpSync(join(sourceDir, file), join(trashDir, file));
    const folder = file.includes('/') ? file.split('/')[0] : null;
    const previous = entries.findIndex((entry) => entry.name === name);
    if (previous >= 0) entries.splice(previous, 1);
    entries.push({
      name,
      file,
      category: folder ? (labels.get(folder) ?? folder) : null,
      codepoint: codepoints[name] ?? null,
      removedAt: today,
    });
  }

  if (entries.length) {
    mkdirSync(trashDir, { recursive: true });
    writeFileSync(join(trashDir, TRASH_FILE), `${JSON.stringify({ icons: entries }, null, 2)}\n`);
  } else {
    rmSync(trashDir, { recursive: true, force: true });
  }
  // Category folders the restored icons leave empty.
  for (const folder of new Set(restored.filter((entry) => entry.file?.includes('/')).map((entry) => entry.file.split('/')[0]))) {
    const dir = join(trashDir, folder);
    if (existsSync(dir) && !readdirSync(dir).length) rmSync(dir, { recursive: true });
  }
  return { trashed: trashed.map(([name]) => name), restored: restored.map((entry) => entry.name) };
}

/**
 * Gets every icon's SVG with getSvg(icon) and replaces fonts/<font>/source/ with them plus figma.json.
 * Icons no longer in Figma go to fonts/<font>/trash/ (see TRASH_DIR). Everything is fetched and checked
 * first, so a failure leaves source/ and trash/ untouched (throws listing the failed icons).
 * Returns { trashed, restored }: names moved to and taken out of the trash.
 */
export async function writeSource(fontDir, fontName, icons, getSvg) {
  const sourceDir = join(fontDir, 'source');
  const tempDir = mkdtempSync(join(tmpdir(), 'icons-source-'));
  let trash;
  try {
    const queue = [...icons];
    const errors = [];
    await Promise.all(
      Array.from({ length: CONCURRENCY }, async () => {
        for (let icon = queue.shift(); icon; icon = queue.shift()) {
          try {
            const svg = await getSvg(icon);
            if (!/<svg[\s>]/i.test(svg)) throw new Error(`${icon.name}: the content is not an SVG.`);
            mkdirSync(join(tempDir, icon.category ?? ''), { recursive: true });
            writeFileSync(join(tempDir, icon.file), svg);
          } catch (error) {
            errors.push(error.message);
          }
        }
      }),
    );
    if (errors.length) throw new Error(`Nothing was written, ${errors.length} icons failed:\n  ${errors.sort().join('\n  ')}`);

    // Figma names and order, so the build shows "Business & finance" and lists the categories and
    // icons as the designer laid them out.
    const figma = { categories: [], icons: [] };
    const byFolder = new Map();
    for (const icon of icons) {
      if (!icon.category) {
        figma.icons.push(icon.name);
        continue;
      }
      if (!byFolder.has(icon.category)) {
        byFolder.set(icon.category, { folder: icon.category, name: icon.label, icons: [] });
        figma.categories.push(byFolder.get(icon.category));
      }
      byFolder.get(icon.category).icons.push(icon.name);
    }
    writeFileSync(join(tempDir, FIGMA_FILE), `${JSON.stringify(figma, null, 2)}\n`);

    mkdirSync(sourceDir, { recursive: true });
    trash = updateTrash(fontDir, fontName, icons);
    for (const entry of readdirSync(sourceDir)) {
      if (entry !== '.gitkeep') rmSync(join(sourceDir, entry), { recursive: true, force: true });
    }
    cpSync(tempDir, sourceDir, { recursive: true });
  } finally {
    rmSync(tempDir, { recursive: true, force: true });
  }
  return trash;
}
