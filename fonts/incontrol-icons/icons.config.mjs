// Configuration of the incontrol-icons font, read by scripts/build-icons.mjs.
// SVGs live in source/<category>/<icon-name>.svg and/or directly in source/<icon-name>.svg
// (uncategorized); everything in dist/ and icons.json is generated.
export default {
  /** Font family and base name of every file in dist/ (incontrol-icons.css, .woff2, ...). */
  name: 'incontrol-icons',
  /** Every icon file and CSS class starts with it: icon-search.svg -> .icon-search */
  prefix: 'icon',
  /** Where the icons come from: 'figma' = the node below, extracted with npm run pull. */
  origin: 'figma',
  /**
   * Figma node the icons are extracted from (npm run sync, skill generar-fuente). Required: the build
   * fails while it is empty. Format: https://www.figma.com/design/<file>/<name>?node-id=<node>
   */
  figma: 'https://www.figma.com/design/gOmSggyN0ueuYE4aOnrOej/Pruebas?node-id=1-428&t=2yqSz8fdk5jwYdnS-4',
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
   * Optional: display names that override the Figma ones, by category folder
   * ({ 'business-and-finance': 'Business & finance' }). Leave it empty to show the names as in Figma
   * (saved in source/figma.json); without Figma, a folder is shown capitalized. The order is always
   * the Figma one.
   */
  categories: {},
};
