// Builds a font and exports it to its registered destinations (fonts/<font>/export.local.json), the
// two steps to run every time the icons change. The export only runs if the build succeeds.
//
//   node scripts/release-icons.mjs <font> [--only <name>[,<name>...]]
//   npm run release -- incontrol-icons
//   npm run release -- incontrol-icons --only app-a
import { spawnSync } from 'node:child_process';
import { join } from 'node:path';

import { ROOT } from './lib/fonts.mjs';

const [font, ...exportArgs] = process.argv.slice(2);
if (!font || font.startsWith('--')) {
  console.error('[release-icons] Usage: node scripts/release-icons.mjs <font> [--only <name>[,<name>...]]');
  process.exit(1);
}

for (const [script, scriptArgs] of [
  ['build-icons.mjs', [font]],
  ['export-icons.mjs', [font, ...exportArgs]],
]) {
  const { status } = spawnSync(process.execPath, [join(ROOT, 'scripts', script), ...scriptArgs], { stdio: 'inherit' });
  if (status !== 0) process.exit(status ?? 1);
}
