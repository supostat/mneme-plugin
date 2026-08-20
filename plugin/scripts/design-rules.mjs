// design-rules.mjs — the SINGLE source of the design-value heuristics, consumed by BOTH
// check-design-etalon.mjs (the blocking fixation gate) and design-lint.mjs (the advisory
// drift watcher). Keeping the rules in one module makes "the two layers never disagree"
// a property of the construction, not of a parity test.
//
// Scan granularity is the CSS DECLARATION (split on /[;{}\n]/), never the line: a var(--…)
// in a NEIGHBORING declaration must not mask a raw value on the same line (the raw-px
// lesson). The heuristics are FALSE-NEGATIVE by design: a bypass that mimics a token slips
// through; they never false-positive on tokens.
//
// Dependency-free Node; shipped in the plugin bundle.

// Style contexts of an HTML document: <style> block bodies plus style="…" attribute values.
export function collectStyleContexts(html) {
  const contexts = [];
  for (const match of html.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/g)) contexts.push(match[1]);
  for (const match of html.matchAll(/style="([^"]*)"/g)) contexts.push(match[1]);
  return contexts;
}

// Raw values bypassing tokens.css inside style contexts. Returns findings as
// { name: 'RAW-HEX' | 'RAW-PX', declaration } — the caller renders the message.
export function scanRawValues(contexts) {
  const findings = [];
  for (const context of contexts) {
    for (const declaration of context.split(/[;{}\n]/)) {
      if (/#[0-9a-fA-F]{3,8}\b/.test(declaration)) {
        findings.push({ name: 'RAW-HEX', declaration: declaration.trim().slice(0, 60) });
      }
      if (/\b\d+px\b/.test(declaration) && !declaration.includes('var(--')) {
        findings.push({ name: 'RAW-PX', declaration: declaration.trim().slice(0, 60) });
      }
    }
  }
  return findings;
}

// The project's truth, parsed from design/system/tokens.css: every color literal and every
// font-size value that appears in a CUSTOM PROPERTY declaration.
export function parseTokens(css) {
  const colors = new Set();
  const fontSizes = new Set();
  for (const declaration of css.split(/[;{}\n]/)) {
    const custom = declaration.match(/^\s*(--[\w-]+)\s*:\s*(.+)$/);
    if (custom === null) continue;
    const value = custom[2].trim();
    for (const color of value.matchAll(/#[0-9a-fA-F]{3,8}\b|rgba?\([^)]*\)|hsla?\([^)]*\)/g)) {
      colors.add(color[0].replace(/\s+/g, '').toLowerCase());
    }
    if (/^--(font-size|fs)-/.test(custom[1])) {
      fontSizes.add(value.toLowerCase());
    }
  }
  return { colors, fontSizes };
}

// Font families declared via @font-face in design/system/fonts.css.
export function parseFontFaces(css) {
  const families = new Set();
  for (const match of css.matchAll(/@font-face\s*{([^}]*)}/g)) {
    const family = match[1].match(/font-family\s*:\s*["']?([^;"'\n]+)["']?/);
    if (family !== null) families.add(family[1].trim().toLowerCase());
  }
  return families;
}

// Generic CSS family keywords that are always allowed as fallbacks.
export const GENERIC_FAMILIES = new Set([
  'system-ui', 'sans-serif', 'serif', 'monospace', 'cursive', 'fantasy',
  'ui-monospace', 'ui-sans-serif', 'ui-serif', 'ui-rounded',
  '-apple-system', 'inherit', 'initial', 'unset',
]);

// Normalize duplicate custom-property names in a css text: returns the names seen twice+.
export function findDuplicateTokens(css) {
  const seen = new Set();
  const duplicates = new Set();
  for (const declaration of css.split(/[;{}\n]/)) {
    const custom = declaration.match(/^\s*(--[\w-]+)\s*:/);
    if (custom === null) continue;
    if (seen.has(custom[1])) duplicates.add(custom[1]);
    seen.add(custom[1]);
  }
  return [...duplicates];
}
