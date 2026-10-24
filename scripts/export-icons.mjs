// Copies a generated icon font to one or more project folders, so projects use the copy and never
// reference generate.icons/:
//   <destination>/<folder>/<name>.{css,eot,html,json,svg,ttf,woff,woff2}   (from fonts/<font>/dist/)
//   <destination>/<folder>/icons.json                                      (categories -> icons)
// Other files already in <destination>/<folder>/ are left untouched. If the folder already holds a
// previous copy, nothing is written unless --force is passed (then those files are overwritten).
// With several destinations, all of them are checked first: if one fails, nothing is written anywhere.
//
//   node scripts/export-icons.mjs <font> <destination> [<destination>...] [--folder <name>] [--force] [--save [--name <name>]]
//   node scripts/export-icons.mjs <font> [--only <name>[,<name>...]]
//   node scripts/export-icons.mjs <font> --list
//   npm run export -- incontrol-icons ../my-app/src/assets/fonts
//   npm run export -- incontrol-icons C:/projects/my-app/src/fonts --folder icons --force
//   npm run export -- incontrol-icons C:/projects/app-a/src/assets/fonts C:/projects/app-b/src/assets/fonts --save
//   npm run export -- incontrol-icons                      (every registered destination)
//   npm run export -- incontrol-icons --only app-a
//
// <font> is a folder of fonts/ (incontrol-icons). <folder> defaults to the font folder name and is the
// same in every destination. A relative <destination> is resolved from the folder where npm was run
// (INIT_CWD), else the cwd.
// --save also registers the destinations in fonts/<font>/export.local.json (git-ignored), named after
// their git repository (or --name). Without destinations, the registered ones are used: they are
// overwritten without --force, each with its own folder.
import { copyFileSync, existsSync, mkdirSync, readdirSync } from 'node:fs';
import { basename, dirname, isAbsolute, join, relative, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

import { CONFIG_FILE, EXPORT_FILE, FONTS_DIR, ROOT, readTargets, saveTargets, toPosix } from './lib/fonts.mjs';

const FOLDER_NAME = /^[\w.-]+$/;
/** Files that `npm run build` writes to dist/, in addition to icons.json. */
const EXTENSIONS = ['css', 'eot', 'html', 'json', 'svg', 'ttf', 'woff', 'woff2'];
const USAGE =
  'Usage: node scripts/export-icons.mjs <font> [<destination>...] [--folder <name>] [--force] [--save [--name <name>]] ' +
  '[--only <name>[,<name>...]] [--list]';

function fail(message) {
  console.error(`[export-icons] ${message}`);
  process.exit(1);
}

function parseArgs(argv) {
  const positional = [];
  const options = { force: false, save: false, list: false };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--folder') options.folder = argv[++i] ?? '';
    else if (argv[i] === '--name') options.name = argv[++i] ?? '';
    else if (argv[i] === '--only') options.only = (argv[++i] ?? '').split(',').filter(Boolean);
    else if (argv[i] === '--force') options.force = true;
    else if (argv[i] === '--save') options.save = true;
    else if (argv[i] === '--list') options.list = true;
    else positional.push(argv[i]);
  }
  const [font, ...destinations] = positional;
  if (!font || options.folder === '' || options.name === '' || options.only?.length === 0) fail(USAGE);
  if (destinations.length && options.only) fail('--only picks registered destinations: do not pass destinations with it.');
  if (!destinations.length && (options.save || options.folder !== undefined)) {
    fail(`--save and --folder need destinations. To change a registered folder, edit fonts/${font}/${EXPORT_FILE}.`);
  }
  if (options.name !== undefined && (!options.save || destinations.length !== 1)) fail('--name needs --save and a single destination.');
  return { font, destinations, ...options };
}

/** Folder names that do not identify a project: skipped when naming a destination outside git. */
const GENERIC_FOLDERS = new Set(['src', 'assets', 'fonts', 'icons', 'styles', 'public', 'static']);

/** Name of the git repository that contains path (the folder that has .git), else its first non-generic folder. */
function repoName(path) {
  for (let dir = path; dirname(dir) !== dir; dir = dirname(dir)) {
    if (existsSync(join(dir, '.git'))) return basename(dir);
  }
  let dir = path;
  while (GENERIC_FOLDERS.has(basename(dir).toLowerCase()) && dirname(dir) !== dir) dir = dirname(dir);
  return basename(dir);
}

const samePath = (a, b) => resolve(a).toLowerCase() === resolve(b).toLowerCase();

const args = parseArgs(process.argv.slice(2));
const { font } = args;

const fontDir = join(FONTS_DIR, font);
const configPath = join(fontDir, CONFIG_FILE);
if (!existsSync(configPath)) fail(`Unknown font "${font}": ${configPath} does not exist.`);
const { default: config } = await import(pathToFileURL(configPath).href);

let registered;
try {
  registered = readTargets(fontDir);
} catch (error) {
  fail(error.message);
}

if (args.list) {
  if (!registered.length) console.log(`[export-icons] ${font}: no registered destinations (${toPosix(join(fontDir, EXPORT_FILE))}).`);
  for (const { name, path, folder = font } of registered) {
    console.log(`${name}\t${join(path, folder)}${existsSync(path) ? '' : '\t(missing)'}`);
  }
  process.exit(0);
}

const sources = [
  ...EXTENSIONS.map((ext) => join(fontDir, 'dist', `${config.name}.${ext}`)),
  join(fontDir, 'icons.json'),
];
const missing = sources.filter((path) => !existsSync(path));
if (missing.length) {
  fail(`The font is not generated yet (missing ${missing.length} files). Run "npm run build -- ${font}" in generate.icons/ first.`);
}

/** { path, folder, force }: explicit destinations, or the registered ones (filtered by --only). */
let destinations;
if (args.destinations.length) {
  const base = process.env.INIT_CWD ?? process.cwd();
  destinations = args.destinations.map((destination) => ({
    path: resolve(base, destination),
    folder: args.folder ?? font,
    force: args.force,
  }));
} else {
  if (!registered.length) {
    fail(
      `${font} has no registered destinations. Export once with --save to register them:\n` +
        `  npm run export -- ${font} "C:/projects/my-app/src/assets/fonts" --save`,
    );
  }
  const unknown = (args.only ?? []).filter((name) => !registered.some((target) => target.name === name));
  if (unknown.length) fail(`Unknown registered destinations: ${unknown.join(', ')}. See them with --list.`);
  destinations = registered
    .filter((target) => !args.only || args.only.includes(target.name))
    .map(({ path, folder = font }) => ({ path, folder, force: true }));
}

const names = sources.map((path) => basename(path));
const targets = [];
const problems = [];
for (const { path, folder, force } of destinations) {
  const target = join(path, folder);
  if (targets.some((other) => samePath(other, target))) continue;
  targets.push(target);
  const insideGenerator = relative(ROOT, target);
  if (!FOLDER_NAME.test(folder)) {
    problems.push(`Invalid folder name "${folder}" for ${path}: use letters, digits, ".", "_" or "-".`);
  } else if (!insideGenerator.startsWith('..') && !isAbsolute(insideGenerator)) {
    problems.push(`The destination ${target} is inside generate.icons/: export to a folder of the project that uses the icons.`);
  } else if (existsSync(target) && !force) {
    const existing = readdirSync(target).filter((name) => names.includes(name));
    if (existing.length) problems.push(`${target} already has a copy (${existing.join(', ')}). Pass --force to overwrite it.`);
  }
}
if (problems.length) {
  fail(problems.join('\n') + (targets.length > 1 ? '\nNothing was written in any destination.' : ''));
}

for (const target of targets) {
  mkdirSync(target, { recursive: true });
  for (const source of sources) copyFileSync(source, join(target, basename(source)));
  console.log(`[export-icons] ${config.name}: ${sources.length} files -> ${target}`);
}

if (args.save) {
  const updated = [...registered];
  for (const { path, folder } of destinations) {
    const entry = { path: path.replace(/\\/g, '/'), ...(folder !== font && { folder }) };
    const index = updated.findIndex((target) => samePath(target.path, path));
    if (index >= 0) {
      updated[index] = { name: args.name ?? updated[index].name, ...entry };
      continue;
    }
    let name = args.name ?? repoName(path);
    for (let n = 2; updated.some((target) => target.name === name); n++) name = `${args.name ?? repoName(path)}-${n}`;
    updated.push({ name, ...entry });
  }
  saveTargets(fontDir, updated);
  console.log(`[export-icons] Registered in ${toPosix(join(fontDir, EXPORT_FILE))}: ${updated.map((target) => target.name).join(', ')}`);
}
