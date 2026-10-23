// Copies a generated icon font to a project folder, so projects use the copy and never reference
// generate-fonts/:
//   <destination>/<folder>/<name>.{css,eot,html,json,svg,ttf,woff,woff2}   (from fonts/<font>/dist/)
//   <destination>/<folder>/icons.json                                      (categories -> icons)
// Other files already in <destination>/<folder>/ are left untouched. If the folder already holds a
// previous copy, nothing is written unless --force is passed (then those files are overwritten).
//
//   node scripts/export-icons.mjs <font> <destination> [--folder <name>] [--force]
//   npm run export -- incontrol-icons ../my-app/src/assets/fonts
//   npm run export -- incontrol-icons C:/projects/my-app/src/fonts --folder icons --force
//
// <font> is a folder of fonts/ (incontrol-icons). <folder> defaults to the font folder name.
// A relative <destination> is resolved from the folder where npm was run (INIT_CWD), else the cwd.
import { copyFileSync, existsSync, mkdirSync, readdirSync } from 'node:fs';
import { basename, isAbsolute, join, relative, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

import { CONFIG_FILE, FONTS_DIR, ROOT } from './lib/fonts.mjs';

const FOLDER_NAME = /^[\w.-]+$/;
/** Files that `npm run build` writes to dist/, in addition to icons.json. */
const EXTENSIONS = ['css', 'eot', 'html', 'json', 'svg', 'ttf', 'woff', 'woff2'];

function fail(message) {
  console.error(`[export-icons] ${message}`);
  process.exit(1);
}

function parseArgs(argv) {
  const positional = [];
  let folder;
  let force = false;
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--folder') folder = argv[++i];
    else if (argv[i] === '--force') force = true;
    else positional.push(argv[i]);
  }
  const [font, destination] = positional;
  if (!font || !destination || positional.length > 2 || (folder !== undefined && !folder)) {
    fail('Usage: node scripts/export-icons.mjs <font> <destination> [--folder <name>] [--force]');
  }
  return { font, destination, folder: folder ?? font, force };
}

const { font, destination, folder, force } = parseArgs(process.argv.slice(2));
if (!FOLDER_NAME.test(folder)) fail(`Invalid folder name "${folder}": use letters, digits, ".", "_" or "-".`);

const fontDir = join(FONTS_DIR, font);
const configPath = join(fontDir, CONFIG_FILE);
if (!existsSync(configPath)) fail(`Unknown font "${font}": ${configPath} does not exist.`);
const { default: config } = await import(pathToFileURL(configPath).href);

const sources = [
  ...EXTENSIONS.map((ext) => join(fontDir, 'dist', `${config.name}.${ext}`)),
  join(fontDir, 'icons.json'),
];
const missing = sources.filter((path) => !existsSync(path));
if (missing.length) {
  fail(`The font is not generated yet (missing ${missing.length} files). Run "npm run build -- ${font}" in generate-fonts/ first.`);
}

const target = resolve(process.env.INIT_CWD ?? process.cwd(), destination, folder);
const insideGenerator = relative(ROOT, target);
if (!insideGenerator.startsWith('..') && !isAbsolute(insideGenerator)) {
  fail(`The destination ${target} is inside generate-fonts/: export to a folder of the project that uses the icons.`);
}

const names = sources.map((path) => basename(path));
if (existsSync(target) && !force) {
  const existing = readdirSync(target).filter((name) => names.includes(name));
  if (existing.length) {
    fail(`${target} already has a copy (${existing.join(', ')}). Pass --force to overwrite it.`);
  }
}

mkdirSync(target, { recursive: true });
for (const source of sources) copyFileSync(source, join(target, basename(source)));
console.log(`[export-icons] ${config.name}: ${sources.length} files -> ${target}`);
