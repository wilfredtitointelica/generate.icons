// Shared by the scripts: where fonts live, how their icons.config.mjs is read and validated.
import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

export const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
export const FONTS_DIR = join(ROOT, 'fonts');
export const CONFIG_FILE = 'icons.config.mjs';
/**
 * source/figma.json, written by sync-figma.mjs: the Figma names and order of the categories and icons,
 * { categories: [{ folder, name, icons: [icon names] }], icons: [uncategorized icon names] }.
 */
export const FIGMA_FILE = 'figma.json';
/**
 * fonts/<font>/trash/: the SVGs of the icons removed from Figma (same <category>/<icon>.svg paths), with
 * trash.json { icons: [{ name, file, category, codepoint, removedAt }] }. Their codepoints stay reserved,
 * and an icon that comes back to Figma gets its codepoint back and leaves the trash.
 */
export const TRASH_DIR = 'trash';
export const TRASH_FILE = 'trash.json';

/** fonts/<font>/trash/trash.json entries, [] when there is no trash. */
export function readTrash(fontDir) {
  const path = join(fontDir, TRASH_DIR, TRASH_FILE);
  if (!existsSync(path)) return [];
  try {
    return JSON.parse(readFileSync(path, 'utf8')).icons ?? [];
  } catch {
    throw new Error(`${toPosix(path)} is not valid JSON; restore it from git.`);
  }
}
/**
 * fonts/<font>/export.local.json (git-ignored, absolute paths depend on the machine): the project folders
 * the font is exported to, { targets: [{ name, path, folder? }] }. Written by export-icons.mjs --save.
 */
export const EXPORT_FILE = 'export.local.json';

/** fonts/<font>/export.local.json targets, [] when none are registered. */
export function readTargets(fontDir) {
  const path = join(fontDir, EXPORT_FILE);
  if (!existsSync(path)) return [];
  try {
    return JSON.parse(readFileSync(path, 'utf8')).targets ?? [];
  } catch {
    throw new Error(`${toPosix(path)} is not valid JSON; fix it or delete it and register the targets again.`);
  }
}

export function saveTargets(fontDir, targets) {
  writeFileSync(join(fontDir, EXPORT_FILE), JSON.stringify({ targets }, null, 2) + '\n');
}

export const KEBAB ='[a-z0-9]+(?:-[a-z0-9]+)*';

export const toPosix = (path) => relative(ROOT, path).replace(/\\/g, '/');

/** Where a font's icons come from: its Figma node (npm run pull) or SVGs placed by hand in source/. */
export const ORIGINS = ['figma', 'local'];

/** Any name -> kebab-case: "Business & finance" -> business-and-finance, "Arrow Left" -> arrow-left. */
export const slug = (text) =>
  String(text)
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/&/g, ' and ')
    .replace(/([a-z])([A-Z])/g, '$1-$2')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');

/**
 * Figma layer or file name -> "<prefix>-<kebab-case>" (a name that already starts with the prefix keeps
 * it once). '' when it has no letters or digits.
 */
export function toIconName(text, prefix) {
  const base = slug(text);
  if (!base || base === prefix) return '';
  return base.startsWith(`${prefix}-`) ? base : `${prefix}-${base}`;
}

/**
 * https://www.figma.com/design/<fileKey>/<name>?node-id=<a>-<b> -> { fileKey, nodeId: '<a>:<b>' }.
 * Also /file/ links and branches (/design/<fileKey>/branch/<branchKey>/..., the branch is the file).
 * Returns null when it is not a Figma design link pointing to a node.
 */
export function parseFigmaUrl(url) {
  let parsed;
  try {
    parsed = new URL(url);
  } catch {
    return null;
  }
  if (!/(^|\.)figma\.com$/.test(parsed.hostname)) return null;
  const path = parsed.pathname.match(/^\/(?:design|file)\/([0-9a-zA-Z]{22,128})(?:\/branch\/([0-9a-zA-Z]{22,128}))?/);
  const node = parsed.searchParams.get('node-id')?.match(/^(\d+)[-:](\d+)$/);
  if (!path || !node) return null;
  return { fileKey: path[2] ?? path[1], nodeId: `${node[1]}:${node[2]}` };
}

/**
 * Reads fonts/<font>/icons.config.mjs with its defaults. Throws with a readable message if invalid:
 * origin 'figma' (the default) needs a Figma URL in "figma"; origin 'local' does not.
 */
export async function loadConfig(fontDir) {
  const configPath = join(fontDir, CONFIG_FILE);
  if (!existsSync(configPath)) throw new Error(`Missing ${toPosix(configPath)}.`);
  const { default: config } = await import(pathToFileURL(configPath).href);
  if (!config?.name || !config?.prefix) throw new Error(`${toPosix(configPath)} must export name and prefix.`);
  const defaults = { startCodepoint: 0xf101, fontHeight: 1000, normalize: true, categories: {} };
  const origin = config.origin ?? 'figma';
  if (!ORIGINS.includes(origin)) {
    throw new Error(`${toPosix(configPath)}: "origin" must be 'figma' or 'local' (${config.origin}).`);
  }
  if (origin === 'local') return { ...defaults, ...config, origin };
  if (!config.figma) {
    throw new Error(
      `${toPosix(configPath)} has no Figma URL: register where its icons come from in "figma" ` +
        `(https://www.figma.com/design/<file>/<name>?node-id=<node>).`,
    );
  }
  if (!parseFigmaUrl(config.figma)) {
    throw new Error(`${toPosix(configPath)}: "figma" must be a Figma design link with node-id (${config.figma}).`);
  }
  return { ...defaults, ...config, origin };
}

/** Folders of fonts/ that have an icons.config.mjs, in alphabetical order. */
export function listFonts() {
  if (!existsSync(FONTS_DIR)) return [];
  return readdirSync(FONTS_DIR, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && existsSync(join(FONTS_DIR, entry.name, CONFIG_FILE)))
    .map((entry) => entry.name)
    .sort();
}
