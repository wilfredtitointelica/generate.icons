// Builds icon fonts from the SVGs of fonts/<font>/source/, either grouped in category folders
// (source/<category>/<icon-name>.svg), placed directly (source/<icon-name>.svg) or both:
//   fonts/<font>/dist/<name>.{css,eot,html,json,svg,ttf,woff,woff2}   (fantasticon + templates)
//   fonts/<font>/icons.json                    (categories -> icons and/or uncategorized icons, with codepoints)
// Codepoints are stable: the previous dist/<name>.json is read first, so an existing icon keeps its
// codepoint and a new one takes the next free codepoint from startCodepoint. Output is deterministic:
// categories and icons follow the Figma order of source/figma.json (written by sync-figma.mjs), and
// what it does not list goes after, in alphabetical order. Nothing in dist/ or icons.json is edited
// by hand.
//
//   node scripts/build-icons.mjs [font...]
//   npm run build                       every folder of fonts/ with an icons.config.mjs
//   npm run build -- incontrol-icons    only that font
//
// <font> is a folder of fonts/ or any absolute path. It must contain icons.config.mjs (with the Figma
// URL its icons come from, see scripts/lib/fonts.mjs) and source/.
// Templates are templates/{css,html}.hbs; a font overrides one with its own <font>/templates/<file>.
import { cpSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

import { FontAssetType, generateFonts, OtherAssetType } from 'fantasticon';
import Handlebars from 'handlebars';
import { optimize } from 'svgo';

import {
  CONFIG_FILE,
  FIGMA_FILE,
  FONTS_DIR,
  listFonts,
  loadConfig,
  readTrash,
  ROOT,
  slug,
  toIconName,
  toPosix,
  TRASH_DIR,
  TRASH_FILE,
} from './lib/fonts.mjs';

const TEMPLATES_DIR = join(ROOT, 'templates');
/** A stroke that is not "none": fonts only render fills, so it would be lost. */
const STROKE = /\bstroke\s*[:=]\s*["']?(?!none\b)[#\w]/i;
/** Also the order of @font-face src: browsers take the first format they support. */
const FONT_TYPES = [
  FontAssetType.WOFF2,
  FontAssetType.WOFF,
  FontAssetType.TTF,
  FontAssetType.EOT,
  FontAssetType.SVG,
];

const titleCase = (text) => text.charAt(0).toUpperCase() + text.slice(1).replace(/-/g, ' ');

function fail(message) {
  console.error(`[build-icons] ${message}`);
  process.exit(1);
}

const sortedEntries = (dir) =>
  readdirSync(dir, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name));
const isSvg = (entry) => entry.isFile() && entry.name.toLowerCase().endsWith('.svg');

/**
 * source/ holds category folders (source/<category>/<icon>.svg), SVGs directly (source/<icon>.svg)
 * or both. Returns { categories: [{ slug, category, icons }], icons } with icons as [{ name, path }]:
 * `icons` are the SVGs placed directly in source/ (uncategorized). Validated and in Figma order.
 * Names are taken as they come (SVGs copied by hand): "Arrow Left.svg" -> icon-arrow-left and the
 * folder "Business & finance" -> business-and-finance, shown as "Business & finance".
 */
function readSource(sourceDir, config) {
  if (!existsSync(sourceDir)) fail(`Missing ${toPosix(sourceDir)}.`);
  const errors = [];
  const seen = new Map();

  /** The icons of one folder; subfolders are only allowed in source/ itself (categories). */
  const readIcons = (dir, entries) => {
    const icons = [];
    for (const entry of entries) {
      const path = join(dir, entry.name);
      if (entry.isDirectory() && dir !== sourceDir) {
        errors.push(`${toPosix(path)}: nested folders are not allowed inside a category.`);
      }
      if (!isSvg(entry)) continue;
      const name = toIconName(entry.name.slice(0, -4), config.prefix);
      if (!name) {
        errors.push(`${toPosix(path)}: the file name has no letters or digits.`);
      } else if (seen.has(name)) {
        errors.push(`${name} is duplicated:\n    - ${toPosix(seen.get(name))}\n    - ${toPosix(path)}`);
      } else {
        seen.set(name, path);
        icons.push({ name, path });
      }
    }
    return icons.sort((a, b) => a.name.localeCompare(b.name));
  };

  // The Figma names and order saved by sync-figma.mjs, if any.
  const figmaPath = join(sourceDir, FIGMA_FILE);
  let figma = { categories: [], icons: [] };
  if (existsSync(figmaPath)) {
    try {
      figma = { ...figma, ...JSON.parse(readFileSync(figmaPath, 'utf8')) };
    } catch {
      errors.push(`${toPosix(figmaPath)} is not valid JSON.`);
    }
  }
  const figmaCategories = new Map(figma.categories.map((category) => [category.folder, category]));
  // Display names: categories of the config, else the Figma name, else the folder name as it was
  // written ("Business & finance"), else the capitalized folder (navigation -> Navigation).
  const labelOf = (folderSlug, folder) =>
    config.categories[folderSlug] ??
    figmaCategories.get(folderSlug)?.name ??
    (folder.trim() !== folderSlug ? folder.trim() : titleCase(folderSlug));

  const entries = sortedEntries(sourceDir);
  const categories = [];
  const folders = new Map();
  for (const entry of entries.filter((entry) => entry.isDirectory())) {
    const dir = join(sourceDir, entry.name);
    const folderSlug = slug(entry.name);
    if (!folderSlug) {
      errors.push(`${toPosix(dir)}: the folder name has no letters or digits.`);
      continue;
    }
    if (folders.has(folderSlug)) {
      errors.push(`Folders "${folders.get(folderSlug)}" and "${entry.name}" are the same category (${folderSlug}).`);
      continue;
    }
    folders.set(folderSlug, entry.name);
    const icons = readIcons(dir, sortedEntries(dir));
    if (icons.length) {
      categories.push({ slug: folderSlug, category: labelOf(folderSlug, entry.name), icons });
    }
  }
  categories.sort((a, b) => a.slug.localeCompare(b.slug));
  const icons = readIcons(sourceDir, entries);

  if (errors.length) fail(`Invalid source:\n  ${errors.join('\n  ')}`);
  if (!seen.size) fail(`No SVGs found in ${toPosix(sourceDir)}/ or its category folders.`);

  // Figma order first; anything figma.json does not list keeps its alphabetical place after it.
  const byFigma = (order, key) => {
    const position = new Map(order.map((item, index) => [item, index]));
    const rank = (item) => position.get(key(item)) ?? Infinity;
    return (a, b) => rank(a) - rank(b);
  };
  categories.sort(byFigma(figma.categories.map((category) => category.folder), (category) => category.slug));
  for (const category of categories) {
    category.icons.sort(byFigma(figmaCategories.get(category.slug)?.icons ?? [], (icon) => icon.name));
  }
  icons.sort(byFigma(figma.icons, (icon) => icon.name));
  return { categories, icons };
}

/** Optimized copies of every SVG, flat in a temporary folder (source/ is never modified). */
function prepareSvgs(icons, tempDir) {
  const strokes = [];
  for (const { name, path } of icons) {
    const svg = readFileSync(path, 'utf8');
    if (STROKE.test(svg)) strokes.push(toPosix(path));
    const { data } = optimize(svg, { path, multipass: true });
    writeFileSync(join(tempDir, `${name}.svg`), data);
  }
  if (strokes.length) {
    console.warn(
      `[build-icons] Warning: these SVGs use strokes, which an icon font does not render.\n` +
        `  In Figma apply "Outline stroke" and "Flatten" before exporting:\n  - ${strokes.join('\n  - ')}`,
    );
  }
}

/** Keeps the codepoint of every icon already in the previous JSON; new icons take the next free one. */
function assignCodepoints(names, previousJson, start, reserved) {
  let previous = {};
  if (existsSync(previousJson)) {
    try {
      previous = JSON.parse(readFileSync(previousJson, 'utf8'));
    } catch {
      fail(`${toPosix(previousJson)} is not valid JSON; restore it from git before building.`);
    }
  }

  const codepoints = {};
  const used = new Set();
  for (const name of names) {
    if (Number.isInteger(previous[name]) && !used.has(previous[name])) {
      codepoints[name] = previous[name];
      used.add(previous[name]);
    }
  }
  // The codepoints of the icons in trash/ stay reserved: an icon back from the trash gets its own again,
  // and no new icon takes one of them.
  for (const name of names) {
    const code = reserved.get(name);
    if (codepoints[name] === undefined && Number.isInteger(code) && !used.has(code)) {
      codepoints[name] = code;
      used.add(code);
    }
  }
  for (const code of reserved.values()) if (Number.isInteger(code)) used.add(code);
  let next = start;
  const added = [];
  for (const name of names) {
    if (codepoints[name] !== undefined) continue;
    while (used.has(next)) next++;
    codepoints[name] = next;
    used.add(next);
    added.push(name);
  }

  // Same order as icons.json (categories, then uncategorized icons), so the CSS and JSON follow it.
  const ordered = Object.fromEntries(names.map((name) => [name, codepoints[name]]));
  const removed = Object.keys(previous).filter((name) => !(name in ordered));
  return { codepoints: ordered, added, removed, previous };
}

function readTrashOrFail(fontDir) {
  try {
    return readTrash(fontDir);
  } catch (error) {
    fail(error.message);
  }
}

/**
 * Keeps trash/ in step with source/ when SVGs are added or deleted by hand (local fonts): icons gone
 * from source/ without going through the trash are recorded in trash.json without a file, so their
 * codepoint stays reserved; icons back in source/ leave the trash.
 */
function syncTrash(fontDir, names, removed, previousCodes) {
  const trashDir = join(fontDir, TRASH_DIR);
  const present = new Set(names);
  const all = readTrashOrFail(fontDir);
  const back = all.filter((entry) => present.has(entry.name));
  const trash = all.filter((entry) => !present.has(entry.name));
  const known = new Set(trash.map((entry) => entry.name));
  const missing = removed.filter((name) => !known.has(name));
  if (!back.length && !missing.length) return;
  for (const entry of back) if (entry.file) rmSync(join(trashDir, entry.file), { force: true });
  const previousTree = existsSync(join(fontDir, 'icons.json'))
    ? JSON.parse(readFileSync(join(fontDir, 'icons.json'), 'utf8'))
    : {};
  const categoryOf = new Map(
    (previousTree.categories ?? []).flatMap((category) => category.icons.map((icon) => [icon.name, category.category])),
  );
  const today = new Date().toISOString().slice(0, 10);
  for (const name of missing) {
    trash.push({ name, file: null, category: categoryOf.get(name) ?? null, codepoint: previousCodes[name], removedAt: today });
  }
  // Category folders the icons back in source/ leave empty.
  for (const entry of existsSync(trashDir) ? readdirSync(trashDir, { withFileTypes: true }) : []) {
    const dir = join(trashDir, entry.name);
    if (entry.isDirectory() && !readdirSync(dir).length) rmSync(dir, { recursive: true });
  }
  if (!trash.length) {
    rmSync(trashDir, { recursive: true, force: true });
    return;
  }
  mkdirSync(trashDir, { recursive: true });
  writeFileSync(join(trashDir, TRASH_FILE), `${JSON.stringify({ icons: trash }, null, 2)}\n`);
}

/** The font's own templates/<file> if it has one, else the shared one. */
function templatePath(fontDir, file) {
  const own = join(fontDir, 'templates', file);
  return existsSync(own) ? own : join(TEMPLATES_DIR, file);
}

async function build(fontDir) {
  const config = await loadConfig(fontDir).catch((error) => fail(error.message));
  const sourceDir = join(fontDir, 'source');
  const distDir = join(fontDir, 'dist');

  const { categories, icons } = readSource(sourceDir, config);
  const allIcons = [...categories.flatMap((category) => category.icons), ...icons];
  const { codepoints, added, removed, previous } = assignCodepoints(
    allIcons.map(({ name }) => name),
    join(distDir, `${config.name}.json`),
    config.startCodepoint,
    new Map(readTrashOrFail(fontDir).map((entry) => [entry.name, entry.codepoint])),
  );

  // icons.json: "categories" when source/ has category folders, "icons" when it has SVGs directly
  // (uncategorized), both when it has both.
  const toEntries = (list) =>
    list.map(({ name }) => ({ name, code: codepoints[name], unicode: codepoints[name].toString(16) }));
  const tree = { name: config.name };
  if (categories.length) {
    tree.categories = categories.map(({ category, slug, icons }) => ({ category, slug, icons: toEntries(icons) }));
  }
  if (icons.length) tree.icons = toEntries(icons);
  const total = allIcons.length;
  // The preview shows uncategorized icons as one more section.
  const sections = [...(tree.categories ?? [])];
  if (tree.icons) sections.push({ category: sections.length ? 'Uncategorized' : 'Icons', icons: tree.icons });

  // Everything is generated in a temporary folder first: dist/ is only replaced when the build succeeds.
  const tempDir = mkdtempSync(join(tmpdir(), `${config.name}-`));
  const svgDir = join(tempDir, 'svg');
  const outDir = join(tempDir, 'dist');
  try {
    mkdirSync(svgDir);
    mkdirSync(outDir);
    prepareSvgs(allIcons, svgDir);

    await generateFonts({
      name: config.name,
      prefix: config.prefix,
      inputDir: svgDir,
      outputDir: outDir,
      fontTypes: FONT_TYPES,
      assetTypes: [OtherAssetType.CSS],
      templates: { css: templatePath(fontDir, 'css.hbs') },
      fontHeight: config.fontHeight,
      normalize: config.normalize,
      codepoints,
      getIconId: ({ basename }) => basename,
    });
    const html = Handlebars.compile(readFileSync(templatePath(fontDir, 'html.hbs'), 'utf8'));
    writeFileSync(join(outDir, `${config.name}.html`), html({ name: config.name, sections, total }));
    writeFileSync(join(outDir, `${config.name}.json`), `${JSON.stringify(codepoints, null, 2)}\n`);

    syncTrash(fontDir, Object.keys(codepoints), removed, previous);
    rmSync(distDir, { recursive: true, force: true });
    cpSync(outDir, distDir, { recursive: true });
    writeFileSync(join(fontDir, 'icons.json'), `${JSON.stringify(tree, null, 2)}\n`);
  } finally {
    rmSync(tempDir, { recursive: true, force: true });
  }

  const groups = [`${categories.length} ${categories.length === 1 ? 'category' : 'categories'}`];
  if (icons.length) groups.push(`${icons.length} uncategorized`);
  console.log(`[build-icons] ${config.name}: ${total} icons (${groups.join(', ')}) -> ${toPosix(distDir)}`);
  if (added.length) console.log(`  added:   ${added.join(', ')}`);
  if (removed.length) console.log(`  removed: ${removed.join(', ')}`);
}

const args = process.argv.slice(2);
const fonts = args.length ? args : listFonts();
if (!fonts.length) fail(`No fonts found: add fonts/<font>/${CONFIG_FILE} (npm run new).`);
for (const font of fonts) {
  await build(resolve(FONTS_DIR, font));
}
