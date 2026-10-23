// Replaces fonts/<font>/source/ with the icons extracted from its Figma node. The skill generar-fuente
// reads the node with the Figma MCP and writes a manifest with one entry per icon:
//   { "icons": [ { "name": "Arrow Left", "category": "Navigation", "url": "https://...svg" },
//                { "name": "logo", "category": null, "svg": "<svg ...>...</svg>" } ] }
// - name: the Figma layer name. It is normalized to "<prefix>-<kebab-case>" (Arrow Left -> icon-arrow-left;
//   a name that already starts with the prefix keeps it once).
// - category: the Figma group it belongs to, or null/missing for an uncategorized icon. Normalized to a
//   kebab-case folder (Business & finance -> business-and-finance).
// - url (temporary export URL, downloaded here) or svg (the SVG markup itself).
// The Figma names of the categories are saved in source/categories.json (folder -> name), used by
// the build as display names (categories of icons.config.mjs still win).
// Figma is the source of truth: icons no longer in the manifest are removed from source/. Codepoints
// are kept by name, so moving or redrawing an icon does not change its codepoint.
//
//   node scripts/sync-figma.mjs <font> <manifest.json> [--dry-run]
//   npm run sync -- incontrol-icons C:/tmp/incontrol-icons.manifest.json --dry-run
//
// --dry-run validates the manifest and prints what would change (added, removed, moved) without
// downloading or writing anything. Without it, every SVG is downloaded and checked before source/ is
// replaced, so a failed download leaves source/ untouched.
import { cpSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

import { CATEGORIES_FILE, FONTS_DIR, loadConfig, toPosix } from './lib/fonts.mjs';

const CONCURRENCY = 8;

function fail(message) {
  console.error(`[sync-figma] ${message}`);
  process.exit(1);
}

const slug = (text) =>
  String(text)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/&/g, ' and ')
    .replace(/([a-z])([A-Z])/g, '$1-$2')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');

function parseArgs(argv) {
  const dryRun = argv.includes('--dry-run');
  const positional = argv.filter((arg) => arg !== '--dry-run');
  if (positional.length !== 2) fail('Usage: node scripts/sync-figma.mjs <font> <manifest.json> [--dry-run]');
  return { font: positional[0], manifest: resolve(process.env.INIT_CWD ?? process.cwd(), positional[1]), dryRun };
}

/** Manifest entries -> [{ name, category, file, url?, svg? }], normalized and validated. */
function readManifest(manifestPath, prefix) {
  if (!existsSync(manifestPath)) fail(`Missing manifest ${manifestPath}.`);
  let manifest;
  try {
    manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
  } catch (error) {
    fail(`${manifestPath} is not valid JSON: ${error.message}`);
  }
  if (!Array.isArray(manifest?.icons) || !manifest.icons.length) fail(`${manifestPath} has no "icons".`);

  const errors = [];
  const seen = new Map();
  const icons = manifest.icons.map((entry, index) => {
    const where = `icons[${index}] (${entry?.name ?? 'no name'})`;
    const base = slug(entry?.name ?? '');
    const name = base === prefix || base.startsWith(`${prefix}-`) ? base : `${prefix}-${base}`;
    const category = entry?.category ? slug(entry.category) : null;
    if (!base || name === prefix) errors.push(`${where}: the name has no letters or digits.`);
    if (entry?.category && !category) errors.push(`${where}: the category has no letters or digits.`);
    if (!entry?.url === !entry?.svg) errors.push(`${where}: give either "url" or "svg".`);
    if (seen.has(name)) errors.push(`${where}: "${name}" is duplicated (also ${seen.get(name)}).`);
    seen.set(name, where);
    return {
      name,
      category,
      label: category ? String(entry.category).trim() : null,
      file: category ? `${category}/${name}.svg` : `${name}.svg`,
      url: entry?.url,
      svg: entry?.svg,
    };
  });
  if (errors.length) fail(`Invalid manifest:\n  ${errors.join('\n  ')}`);
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

async function download(icon) {
  if (icon.svg) return icon.svg;
  const response = await fetch(icon.url);
  if (!response.ok) throw new Error(`${icon.name}: HTTP ${response.status} (the export URL may have expired).`);
  return response.text();
}

const { font, manifest, dryRun } = parseArgs(process.argv.slice(2));
const fontDir = join(FONTS_DIR, font);
const config = await loadConfig(fontDir).catch((error) => fail(error.message));
const sourceDir = join(fontDir, 'source');
const icons = readManifest(manifest, config.prefix);

const current = readCurrent(sourceDir);
const added = icons.filter((icon) => !current.has(icon.name)).map((icon) => icon.file);
const moved = icons
  .filter((icon) => current.has(icon.name) && current.get(icon.name) !== icon.file)
  .map((icon) => `${current.get(icon.name)} -> ${icon.file}`);
const kept = new Set(icons.map((icon) => icon.name));
const removed = [...current].filter(([name]) => !kept.has(name)).map(([, file]) => file);
const categories = new Set(icons.map((icon) => icon.category).filter(Boolean));
const uncategorized = icons.filter((icon) => !icon.category).length;

console.log(
  `[sync-figma] ${config.name}: ${icons.length} icons from Figma (${categories.size} categories` +
    `${uncategorized ? `, ${uncategorized} uncategorized` : ''})${dryRun ? ' [dry run]' : ''}`,
);
if (added.length) console.log(`  added (${added.length}):   ${added.join(', ')}`);
if (moved.length) console.log(`  moved (${moved.length}):   ${moved.join(', ')}`);
if (removed.length) console.log(`  removed (${removed.length}): ${removed.join(', ')}`);
if (dryRun) process.exit(0);

// Download everything first: source/ is only replaced when every SVG arrived and looks like an SVG.
const tempDir = mkdtempSync(join(tmpdir(), `${config.name}-figma-`));
try {
  const queue = [...icons];
  const errors = [];
  await Promise.all(
    Array.from({ length: CONCURRENCY }, async () => {
      for (let icon = queue.shift(); icon; icon = queue.shift()) {
        try {
          const svg = await download(icon);
          if (!/<svg[\s>]/i.test(svg)) throw new Error(`${icon.name}: the content is not an SVG.`);
          mkdirSync(join(tempDir, icon.category ?? ''), { recursive: true });
          writeFileSync(join(tempDir, icon.file), svg);
        } catch (error) {
          errors.push(error.message);
        }
      }
    }),
  );
  if (errors.length) fail(`Nothing was written, ${errors.length} icons failed:\n  ${errors.sort().join('\n  ')}`);

  // The Figma names of the categories, so the build shows "Business & finance" and not its folder name.
  const labels = Object.fromEntries(
    icons
      .filter((icon) => icon.category)
      .sort((a, b) => a.category.localeCompare(b.category))
      .map((icon) => [icon.category, icon.label]),
  );
  if (Object.keys(labels).length) writeFileSync(join(tempDir, CATEGORIES_FILE), `${JSON.stringify(labels, null, 2)}\n`);

  mkdirSync(sourceDir, { recursive: true });
  for (const entry of readdirSync(sourceDir)) {
    if (entry !== '.gitkeep') rmSync(join(sourceDir, entry), { recursive: true, force: true });
  }
  cpSync(tempDir, sourceDir, { recursive: true });
} finally {
  rmSync(tempDir, { recursive: true, force: true });
}
console.log(`[sync-figma] ${toPosix(sourceDir)} updated. Next: npm run build -- ${font}`);
