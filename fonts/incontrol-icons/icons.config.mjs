// Configuration of the incontrol-icons font, read by scripts/build-icons.mjs.
// SVGs live in source/<category>/<icon-name>.svg and/or directly in source/<icon-name>.svg
// (uncategorized); everything in dist/ and icons.json is generated.
export default {
  /** Font family and base name of every file in dist/ (incontrol-icons.css, .woff2, ...). */
  name: 'incontrol-icons',
  /** Every icon file and CSS class starts with it: icon-search.svg -> .icon-search */
  prefix: 'icon',
  /**
   * Figma node the icons are extracted from (npm run sync, skill generar-fuente). Required: the build
   * fails while it is empty. Format: https://www.figma.com/design/<file>/<name>?node-id=<node>
   */
  figma: '',
  /**
   * Only the Figma layers whose name starts with it are icons (case-insensitive), e.g. 'icon-'.
   * Empty: every icon of the node. Used by the skill generar-fuente.
   */
  figmaFilter: 'icon-',
  /** First private-use codepoint (0xf101 = 61697). New icons take the next free one. */
  startCodepoint: 0xf101,
  fontHeight: 1000,
  normalize: true,
  /**
   * Display name of each category folder. A folder missing here is shown capitalized
   * (navigation -> Navigation); its order is alphabetical by folder.
   */
  categories: {
    'business-and-finance': 'Business & finance',
  },
};
