// Replaces fonts/<font>/source/ with the icons extracted from its Figma node. The skill generar-fuente
// reads the node with the Figma MCP and writes a manifest with one entry per icon:
//   { "icons": [ { "name": "Arrow Left", "category": "Navigation", "url": "https://...svg" },
//                { "name": "logo", "category": null, "svg": "<svg ...>...</svg>" } ] }
// - name: the Figma layer name. It is normalized to "<prefix>-<kebab-case>" (Arrow Left -> icon-arrow-left;
//   a name that already starts with the prefix keeps it once).
// - category: the Figma group it belongs to, or null/missing for an uncategorized icon. Normalized to a
//   kebab-case folder (Business & finance -> business-and-finance).
// - url (temporary export URL, downloaded here) or svg (the SVG markup itself).
// - layer (optional): the exact Figma layer name of the icon. A node export of the Figma MCP also paints
//   what lies behind the node (page and frame backgrounds, borders); with layer, only the icon's group
//   (<g id="<layer>">) is kept, with the export's viewBox, so the icon keeps its frame and position.
// The manifest order is the Figma order (categories and icons as laid out on the canvas): it is saved,
// with the Figma names of the categories, in source/figma.json, and the build follows it (display
// names: categories of icons.config.mjs still win).
// Figma is the source of truth: icons no longer in the manifest leave source/ and their SVG goes to
// fonts/<font>/trash/ (their codepoint stays reserved; see TRASH_DIR in lib/fonts.mjs). Codepoints are
// kept by name, so moving or redrawing an icon does not change its codepoint.
//
//   node scripts/sync-figma.mjs <font> <manifest.json> [--dry-run]
//   npm run sync -- incontrol-icons C:/tmp/incontrol-icons.manifest.json --dry-run
//
// --dry-run validates the manifest and prints what would change (added, removed, moved) without
// downloading or writing anything. Without it, every SVG is downloaded and checked before source/ is
// replaced, so a failed download leaves source/ untouched.
import { existsSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

import { FONTS_DIR, loadConfig, toPosix } from './lib/fonts.mjs';
import { diffSource, isolateLayer, logSync, normalizeEntries, writeSource } from './lib/sync.mjs';

function fail(message) {
  console.error(`[sync-figma] ${message}`);
  process.exit(1);
}

function parseArgs(argv) {
  const dryRun = argv.includes('--dry-run');
  const positional = argv.filter((arg) => arg !== '--dry-run');
  if (positional.length !== 2) fail('Usage: node scripts/sync-figma.mjs <font> <manifest.json> [--dry-run]');
  return { font: positional[0], manifest: resolve(process.env.INIT_CWD ?? process.cwd(), positional[1]), dryRun };
}

/** Manifest entries -> normalized icons; each one must bring "url" or "svg". */
function readManifest(manifestPath, prefix) {
  if (!existsSync(manifestPath)) fail(`Missing manifest ${manifestPath}.`);
  let manifest;
  try {
    manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
  } catch (error) {
    fail(`${manifestPath} is not valid JSON: ${error.message}`);
  }
  if (!Array.isArray(manifest?.icons) || !manifest.icons.length) fail(`${manifestPath} has no "icons".`);
  const missing = manifest.icons
    .map((entry, index) => (!entry?.url === !entry?.svg ? `icons[${index}] (${entry?.name ?? 'no name'})` : null))
    .filter(Boolean);
  if (missing.length) fail(`Invalid manifest, give either "url" or "svg" in:\n  ${missing.join('\n  ')}`);
  try {
    return normalizeEntries(manifest.icons, prefix);
  } catch (error) {
    fail(error.message);
  }
}

async function getSvg(icon) {
  let svg = icon.svg;
  if (!svg) {
    const response = await fetch(icon.url);
    if (!response.ok) throw new Error(`${icon.name}: HTTP ${response.status} (the export URL may have expired).`);
    svg = await response.text();
  }
  if (!icon.layer) return svg;
  const isolated = isolateLayer(svg, icon.layer);
  if (!isolated) throw new Error(`${icon.name}: the export has no <g id="${icon.layer}"> (is "layer" the exact Figma name?).`);
  return isolated;
}

const { font, manifest, dryRun } = parseArgs(process.argv.slice(2));
const fontDir = join(FONTS_DIR, font);
const config = await loadConfig(fontDir).catch((error) => fail(error.message));
const sourceDir = join(fontDir, 'source');
const icons = readManifest(manifest, config.prefix);

logSync('sync-figma', config.name, icons, diffSource(sourceDir, icons), dryRun);
if (dryRun) process.exit(0);

const trash = await writeSource(fontDir, config.name, icons, getSvg).catch((error) => fail(error.message));
if (trash.trashed.length) console.log(`[sync-figma] moved to trash/: ${trash.trashed.join(', ')}`);
if (trash.restored.length) console.log(`[sync-figma] back from trash/: ${trash.restored.join(', ')}`);
console.log(`[sync-figma] ${toPosix(sourceDir)} updated. Next: npm run build -- ${font}`);
