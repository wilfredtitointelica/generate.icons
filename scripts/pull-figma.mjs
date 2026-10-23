// Extracts a font's icons from its Figma node with the Figma REST API and replaces fonts/<font>/source/
// with them (same result as the skill generar-fuente + sync-figma.mjs, without the Figma MCP and its
// per-call limit): one request for the structure and one per 100 icons for the SVG exports.
//
//   node scripts/pull-figma.mjs <font> [--dry-run]
//   npm run pull -- incontrol-icons --dry-run
//
// Reads from icons.config.mjs: figma (the node: page, section or frame), figmaFilter and prefix.
// - Icons: the nodes whose name (last "/" segment) starts with figmaFilter, case-insensitive (without a
//   filter, the COMPONENT nodes). Hidden nodes are skipped; instances of an included component too.
// - Categories: the direct children of the node that contain icons; icons placed directly in the node
//   are uncategorized.
// - Duplicates: two layers that give the same icon name stop the pull (rename one in Figma).
// - Removed: icons no longer in Figma leave source/ and their SVG goes to fonts/<font>/trash/.
// - Order: as laid out on the canvas, top to bottom and, within a row (tops less than 4 px apart),
//   left to right; categories first, then the icons of each one.
// --dry-run prints the summary (categories, filtered out, renamed, added / moved / removed) and exits
// without exporting. Needs FIGMA_TOKEN (personal access token, File content: read-only), from the
// environment or from generate-fonts/.env.
import { existsSync } from 'node:fs';
import { join } from 'node:path';

import { FONTS_DIR, loadConfig, parseFigmaUrl, ROOT, toPosix } from './lib/fonts.mjs';
import { diffSource, isolateLayer, logSync, normalizeEntries, writeSource } from './lib/sync.mjs';

/** FIGMA_API_URL only to test against a local mock of the API. */
const API = process.env.FIGMA_API_URL ?? 'https://api.figma.com/v1';
const BATCH = 100;
const MAX_RETRIES = 5;
/** Longer waits than this mean a long-term limit: better stop and tell than hang. */
const MAX_WAIT_SECONDS = 120;
const ROW_TOLERANCE = 4;

function fail(message) {
  console.error(`[pull-figma] ${message}`);
  process.exit(1);
}

function parseArgs(argv) {
  const dryRun = argv.includes('--dry-run');
  const positional = argv.filter((arg) => arg !== '--dry-run');
  if (positional.length !== 1) fail('Usage: node scripts/pull-figma.mjs <font> [--dry-run]');
  return { font: positional[0], dryRun };
}

function readToken() {
  const envFile = join(ROOT, '.env');
  if (!process.env.FIGMA_TOKEN && existsSync(envFile)) process.loadEnvFile(envFile);
  const token = process.env.FIGMA_TOKEN?.trim();
  if (!token) {
    fail(
      'Missing FIGMA_TOKEN. Create a personal access token in Figma (Settings -> Security -> Personal ' +
        'access tokens, scope "File content: read-only") and save it in generate-fonts/.env as ' +
        'FIGMA_TOKEN=<token> (see .env.example). Never commit it.',
    );
  }
  return token;
}

let requests = 0;

/** GET to the Figma API, retrying on 429 (Retry-After) and 5xx. */
async function api(path, token) {
  for (let attempt = 1; ; attempt++) {
    requests++;
    const response = await fetch(`${API}${path}`, { headers: { 'X-Figma-Token': token } });
    if (response.ok) return response.json();
    const retryable = response.status === 429 || response.status >= 500;
    const wait = Number(response.headers.get('retry-after')) || 2 ** attempt;
    if (retryable && attempt < MAX_RETRIES && wait <= MAX_WAIT_SECONDS) {
      console.warn(`[pull-figma] Figma answered ${response.status}, retrying in ${wait}s...`);
      await new Promise((done) => setTimeout(done, wait * 1000));
      continue;
    }
    const detail = (await response.text().catch(() => '')).slice(0, 200);
    if (response.status === 403) fail(`Figma refused the token (403): check FIGMA_TOKEN and access to the file. ${detail}`);
    if (response.status === 404) fail(`Figma file or node not found (404): check "figma" in icons.config.mjs. ${detail}`);
    if (response.status === 429) fail(`Figma rate limit (429), retry after ${wait}s. ${detail}`);
    fail(`Figma API error ${response.status} on ${path.split('?')[0]}. ${detail}`);
  }
}

const leaf = (name) => String(name ?? '').split('/').pop().trim();
const box = (node) => node.absoluteBoundingBox ?? { x: 0, y: 0 };
/** Canvas reading order: rows top to bottom, then left to right. */
const reading = (a, b) => {
  const [boxA, boxB] = [box(a), box(b)];
  return Math.abs(boxA.y - boxB.y) < ROW_TOLERANCE ? boxA.x - boxB.x : boxA.y - boxB.y;
};

/** Figma node tree -> { entries in canvas order, filtered out names, skipped instances }. */
function mapIcons(root, filter) {
  const prefix = filter.toLowerCase();
  const isIcon = (node) => (prefix ? leaf(node.name).toLowerCase().startsWith(prefix) : node.type === 'COMPONENT');
  const filteredOut = new Set();
  const collect = (node, found) => {
    for (const child of node.children ?? []) {
      if (child.visible === false) continue;
      if (isIcon(child)) found.push(child);
      else {
        if (prefix && ['COMPONENT', 'INSTANCE'].includes(child.type)) filteredOut.add(leaf(child.name));
        collect(child, found);
      }
    }
    return found;
  };

  const loose = [];
  const groups = [];
  for (const child of root.children ?? []) {
    if (child.visible === false) continue;
    (isIcon(child) ? loose : groups).push(child);
  }
  const found = [];
  for (const group of groups.sort(reading)) {
    for (const node of collect(group, []).sort(reading)) found.push({ node, category: group.name });
  }
  for (const node of loose.sort(reading)) found.push({ node, category: null });

  const components = new Set(found.filter(({ node }) => node.type === 'COMPONENT').map(({ node }) => leaf(node.name)));
  const skipped = found.filter(({ node }) => node.type === 'INSTANCE' && components.has(leaf(node.name)));
  const entries = found
    .filter((item) => !skipped.includes(item))
    .map(({ node, category }) => ({ name: leaf(node.name), layer: leaf(node.name), category, nodeId: node.id }));
  return { entries, filteredOut: [...filteredOut], skipped: skipped.map(({ node }) => leaf(node.name)) };
}

const { font, dryRun } = parseArgs(process.argv.slice(2));
const fontDir = join(FONTS_DIR, font);
const config = await loadConfig(fontDir).catch((error) => fail(error.message));
if (config.origin === 'local') {
  fail(
    `${font} is a local font (origin: 'local'): its SVGs are copied by hand into fonts/${font}/source/. ` +
      `Run "npm run build -- ${font}" instead.`,
  );
}
const { fileKey, nodeId } = parseFigmaUrl(config.figma);
const token = readToken();
const sourceDir = join(fontDir, 'source');

const structure = await api(`/files/${fileKey}/nodes?ids=${encodeURIComponent(nodeId)}&geometry=omit`, token);
const root = structure.nodes?.[nodeId]?.document;
if (!root) fail(`Node ${nodeId} not found in the Figma file: check "figma" in icons.config.mjs.`);

const { entries, filteredOut, skipped } = mapIcons(root, config.figmaFilter ?? '');
if (!entries.length) {
  fail(`No icons in "${root.name}" (${nodeId})${config.figmaFilter ? ` whose name starts with "${config.figmaFilter}"` : ''}.`);
}
let icons;
try {
  icons = normalizeEntries(entries, config.prefix);
} catch (error) {
  fail(`${error.message}\nRename those layers in Figma.`);
}

logSync('pull-figma', config.name, icons, diffSource(sourceDir, icons), dryRun);
for (const category of [...new Set(icons.map((icon) => icon.label ?? '(uncategorized)'))]) {
  console.log(`  ${category}: ${icons.filter((icon) => (icon.label ?? '(uncategorized)') === category).length}`);
}
const renamed = icons.filter((icon) => icon.layer !== icon.name).map((icon) => `"${icon.layer}" -> ${icon.name}`);
if (renamed.length) console.log(`  renamed (${renamed.length}): ${renamed.join(', ')}`);
if (filteredOut.length) {
  console.log(`  filtered out by "${config.figmaFilter}" (${filteredOut.length}): ${filteredOut.slice(0, 15).join(', ')}`);
}
if (skipped.length) console.log(`  skipped instances (${skipped.length}): ${skipped.join(', ')}`);
if (dryRun) {
  console.log(`[pull-figma] ${requests} Figma API request(s).`);
  process.exit(0);
}

// SVG export URLs, BATCH nodes per request.
const urls = {};
for (let i = 0; i < icons.length; i += BATCH) {
  const ids = icons.slice(i, i + BATCH).map((icon) => icon.nodeId).join(',');
  const result = await api(`/images/${fileKey}?ids=${encodeURIComponent(ids)}&format=svg&svg_include_id=true`, token);
  if (result.err) fail(`Figma could not export the SVGs: ${result.err}`);
  Object.assign(urls, result.images);
}

async function getSvg(icon) {
  if (!urls[icon.nodeId]) throw new Error(`${icon.name}: Figma returned no export for node ${icon.nodeId}.`);
  let svg;
  for (let attempt = 1; !svg; attempt++) {
    const response = await fetch(urls[icon.nodeId]);
    if (response.ok) svg = await response.text();
    else if (attempt === 3) throw new Error(`${icon.name}: HTTP ${response.status} downloading its export.`);
  }
  // Keep only the icon's own group when the export brings it, as with the MCP exports.
  return isolateLayer(svg, icon.layer) ?? svg;
}

const trash = await writeSource(fontDir, config.name, icons, getSvg).catch((error) => fail(error.message));
if (trash.trashed.length) console.log(`[pull-figma] moved to trash/: ${trash.trashed.join(', ')}`);
if (trash.restored.length) console.log(`[pull-figma] back from trash/: ${trash.restored.join(', ')}`);
console.log(`[pull-figma] ${toPosix(sourceDir)} updated (${requests} Figma API requests). Next: npm run build -- ${font}`);
