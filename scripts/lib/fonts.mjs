// Shared by the scripts: where fonts live, how their icons.config.mjs is read and validated.
import { existsSync, readdirSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

export const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
export const FONTS_DIR = join(ROOT, 'fonts');
export const CONFIG_FILE = 'icons.config.mjs';
/** source/categories.json: category folder -> name in Figma, written by sync-figma.mjs. */
export const CATEGORIES_FILE = 'categories.json';
export const KEBAB = '[a-z0-9]+(?:-[a-z0-9]+)*';

export const toPosix = (path) => relative(ROOT, path).replace(/\\/g, '/');

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

/** Reads fonts/<font>/icons.config.mjs with its defaults. Throws with a readable message if invalid. */
export async function loadConfig(fontDir) {
  const configPath = join(fontDir, CONFIG_FILE);
  if (!existsSync(configPath)) throw new Error(`Missing ${toPosix(configPath)}.`);
  const { default: config } = await import(pathToFileURL(configPath).href);
  if (!config?.name || !config?.prefix) throw new Error(`${toPosix(configPath)} must export name and prefix.`);
  if (!config.figma) {
    throw new Error(
      `${toPosix(configPath)} has no Figma URL: register where its icons come from in "figma" ` +
        `(https://www.figma.com/design/<file>/<name>?node-id=<node>).`,
    );
  }
  if (!parseFigmaUrl(config.figma)) {
    throw new Error(`${toPosix(configPath)}: "figma" must be a Figma design link with node-id (${config.figma}).`);
  }
  return { startCodepoint: 0xf101, fontHeight: 1000, normalize: true, categories: {}, ...config };
}

/** Folders of fonts/ that have an icons.config.mjs, in alphabetical order. */
export function listFonts() {
  if (!existsSync(FONTS_DIR)) return [];
  return readdirSync(FONTS_DIR, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && existsSync(join(FONTS_DIR, entry.name, CONFIG_FILE)))
    .map((entry) => entry.name)
    .sort();
}
