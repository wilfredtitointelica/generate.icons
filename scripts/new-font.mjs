// Creates a new font folder, registering where its icons come from:
//   fonts/<font>/icons.config.mjs   (name, prefix, origin and, for Figma, figma + figmaFilter)
//   fonts/<font>/source/.gitkeep    (SVGs land here: npm run pull, or copied by hand for a local font)
//   fonts/<font>/dist/
//
//   node scripts/new-font.mjs <font> --figma <url> [--prefix <prefix>] [--filter <text>]
//   node scripts/new-font.mjs <font> --local [--prefix <prefix>]
//   npm run new -- incontrol-system --figma "https://www.figma.com/design/<file>/<name>?node-id=1-2" --prefix sys --filter sys-
//   npm run new -- shared-icons --local
//
// <font> is kebab-case and becomes the font family and file names (incontrol-system.css, ...).
// <prefix> starts every icon file and CSS class (sys-search.svg -> .sys-search); defaults to "icon".
// --figma: origin 'figma', the icons are extracted from that node with npm run pull.
// --local: origin 'local', the SVGs are copied by hand into source/ (folders = categories).
// <text> keeps only the Figma layers whose name starts with it (icon-); empty or missing = every icon.
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { CONFIG_FILE, FONTS_DIR, KEBAB, parseFigmaUrl, toPosix } from './lib/fonts.mjs';

const NAME = new RegExp(`^${KEBAB}$`);
const USAGE =
  'Usage: node scripts/new-font.mjs <font> (--figma <url> [--filter <text>] | --local) [--prefix <prefix>]';

function fail(message) {
  console.error(`[new-font] ${message}`);
  process.exit(1);
}

function parseArgs(argv) {
  const positional = [];
  let figma;
  let local = false;
  let prefix = 'icon';
  let filter = '';
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--figma') figma = argv[++i];
    else if (argv[i] === '--local') local = true;
    else if (argv[i] === '--prefix') prefix = argv[++i];
    else if (argv[i] === '--filter') filter = argv[++i] ?? '';
    else positional.push(argv[i]);
  }
  if (positional.length !== 1 || !prefix || local === Boolean(figma)) fail(USAGE);
  if (local && filter) fail('--filter only applies to Figma fonts (--figma).');
  return { font: positional[0], figma, local, prefix, filter };
}

const { font, figma, local, prefix, filter } = parseArgs(process.argv.slice(2));
if (!NAME.test(font)) fail(`Invalid font name "${font}": use kebab-case (e.g. incontrol-system).`);
if (!NAME.test(prefix)) fail(`Invalid prefix "${prefix}": use kebab-case (e.g. icon, sys).`);
if (/['\\\n]/.test(filter)) fail(`Invalid filter "${filter}": no quotes, backslashes or line breaks.`);
if (!local && (!parseFigmaUrl(figma) || /['\\\s]/.test(figma))) {
  fail(`"${figma}" is not a Figma design link with node-id (https://www.figma.com/design/<file>/<name>?node-id=1-2).`);
}

const fontDir = join(FONTS_DIR, font);
if (existsSync(fontDir)) fail(`${toPosix(fontDir)} already exists.`);

const originBlock = local
  ? `  /**
   * Where the icons come from: 'local' = SVGs copied by hand into source/ (category folders and/or
   * loose SVGs, any names: they are normalized). Build with npm run build; npm run pull does not apply.
   */
  origin: 'local',`
  : `  /** Where the icons come from: 'figma' = the node below, extracted with npm run pull. */
  origin: 'figma',
  /**
   * Figma node the icons are extracted from (npm run pull, skill generar-fuente). Required for
   * origin 'figma'. Format: https://www.figma.com/design/<file>/<name>?node-id=<node>
   */
  figma: '${figma}',
  /**
   * Only the Figma layers whose name starts with it are icons (case-insensitive), e.g. 'icon-'.
   * Empty: every icon of the node. Used by npm run pull.
   */
  figmaFilter: '${filter}',`;

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
${originBlock}
  /** First private-use codepoint (0xf101 = 61697). New icons take the next free one. */
  startCodepoint: 0xf101,
  fontHeight: 1000,
  normalize: true,
  /**
   * Optional: display names that override the Figma or folder ones, by category folder slug
   * ({ 'business-and-finance': 'Business & finance' }). Usually empty.
   */
  categories: {},
};
`,
);
console.log(
  `[new-font] ${font}: created ${toPosix(fontDir)} (prefix "${prefix}", ` +
    (local ? `local: copy its SVGs into ${toPosix(join(fontDir, 'source'))}/ and run npm run build -- ${font})`
      : `Figma ${figma}${filter ? `, filter "${filter}"` : ''})`),
);
