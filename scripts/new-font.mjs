// Creates a new font folder with the Figma URL its icons come from:
//   fonts/<font>/icons.config.mjs   (name, prefix, figma, figmaFilter)
//   fonts/<font>/source/.gitkeep    (SVGs land here: npm run sync)
//   fonts/<font>/dist/
//
//   node scripts/new-font.mjs <font> --figma <url> [--prefix <prefix>] [--filter <text>]
//   npm run new -- incontrol-system --figma "https://www.figma.com/design/<file>/<name>?node-id=1-2" --prefix sys --filter sys-
//
// <font> is kebab-case and becomes the font family and file names (incontrol-system.css, ...).
// <prefix> starts every icon file and CSS class (sys-search.svg -> .sys-search); defaults to "icon".
// <text> keeps only the Figma layers whose name starts with it (icon-); empty or missing = every icon.
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { CONFIG_FILE, FONTS_DIR, KEBAB, parseFigmaUrl, toPosix } from './lib/fonts.mjs';

const NAME = new RegExp(`^${KEBAB}$`);

function fail(message) {
  console.error(`[new-font] ${message}`);
  process.exit(1);
}

function parseArgs(argv) {
  const positional = [];
  let figma;
  let prefix = 'icon';
  let filter = '';
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--figma') figma = argv[++i];
    else if (argv[i] === '--prefix') prefix = argv[++i];
    else if (argv[i] === '--filter') filter = argv[++i] ?? '';
    else positional.push(argv[i]);
  }
  if (positional.length !== 1 || !figma || !prefix) {
    fail('Usage: node scripts/new-font.mjs <font> --figma <url> [--prefix <prefix>] [--filter <text>]');
  }
  return { font: positional[0], figma, prefix, filter };
}

const { font, figma, prefix, filter } = parseArgs(process.argv.slice(2));
if (!NAME.test(font)) fail(`Invalid font name "${font}": use kebab-case (e.g. incontrol-system).`);
if (!NAME.test(prefix)) fail(`Invalid prefix "${prefix}": use kebab-case (e.g. icon, sys).`);
if (/['\\\n]/.test(filter)) fail(`Invalid filter "${filter}": no quotes, backslashes or line breaks.`);
if (!parseFigmaUrl(figma) || /['\\\s]/.test(figma)) {
  fail(`"${figma}" is not a Figma design link with node-id (https://www.figma.com/design/<file>/<name>?node-id=1-2).`);
}

const fontDir = join(FONTS_DIR, font);
if (existsSync(fontDir)) fail(`${toPosix(fontDir)} already exists.`);

mkdirSync(join(fontDir, 'source'), { recursive: true });
mkdirSync(join(fontDir, 'dist'));
writeFileSync(join(fontDir, 'source', '.gitkeep'), '');
writeFileSync(
  join(fontDir, CONFIG_FILE),
  `// Configuration of the ${font} font, read by scripts/build-icons.mjs.
// SVGs live in source/<category>/<icon-name>.svg and/or directly in source/<icon-name>.svg
// (uncategorized); everything in dist/ and icons.json is generated.
export default {
  /** Font family and base name of every file in dist/ (${font}.css, .woff2, ...). */
  name: '${font}',
  /** Every icon file and CSS class starts with it: ${prefix}-search.svg -> .${prefix}-search */
  prefix: '${prefix}',
  /**
   * Figma node the icons are extracted from (npm run sync, skill generar-fuente). Required: the build
   * fails while it is empty. Format: https://www.figma.com/design/<file>/<name>?node-id=<node>
   */
  figma: '${figma}',
  /**
   * Only the Figma layers whose name starts with it are icons (case-insensitive), e.g. 'icon-'.
   * Empty: every icon of the node. Used by the skill generar-fuente.
   */
  figmaFilter: '${filter}',
  /** First private-use codepoint (0xf101 = 61697). New icons take the next free one. */
  startCodepoint: 0xf101,
  fontHeight: 1000,
  normalize: true,
  /**
   * Display name of each category folder. A folder missing here is shown capitalized
   * (navigation -> Navigation); its order is alphabetical by folder.
   */
  categories: {},
};
`,
);
console.log(`[new-font] ${font}: created ${toPosix(fontDir)} (prefix "${prefix}", Figma ${figma}${filter ? `, filter "${filter}"` : ''})`);
