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

// Parse a CSS color literal into RGB(+alpha) channels. Returns {r,g,b,a} or null when the
// literal is outside the supported forms (#rgb/#rrggbb/#rrggbbaa, rgb()/rgba(), hsl()/hsla()).
export function parseColor(literal) {
  const value = literal.trim().toLowerCase();
  const hex = value.match(/^#([0-9a-f]{3}|[0-9a-f]{6}|[0-9a-f]{8})$/);
  if (hex !== null) {
    const digits = hex[1];
    if (digits.length === 3) {
      return {
        r: parseInt(digits[0] + digits[0], 16),
        g: parseInt(digits[1] + digits[1], 16),
        b: parseInt(digits[2] + digits[2], 16),
        a: 1,
      };
    }
    return {
      r: parseInt(digits.slice(0, 2), 16),
      g: parseInt(digits.slice(2, 4), 16),
      b: parseInt(digits.slice(4, 6), 16),
      a: digits.length === 8 ? parseInt(digits.slice(6, 8), 16) / 255 : 1,
    };
  }
  const rgb = value.match(/^rgba?\(([^)]+)\)$/);
  if (rgb !== null) {
    const parts = rgb[1].split(',').map((part) => part.trim());
    if (parts.length < 3) return null;
    const channels = parts.slice(0, 3).map((part) => Number.parseFloat(part));
    if (channels.some((channel) => Number.isNaN(channel))) return null;
    const alpha = parts.length > 3 ? Number.parseFloat(parts[3]) : 1;
    return { r: channels[0], g: channels[1], b: channels[2], a: Number.isNaN(alpha) ? 1 : alpha };
  }
  const hsl = value.match(/^hsla?\(([^)]+)\)$/);
  if (hsl !== null) {
    const parts = hsl[1].split(',').map((part) => part.trim());
    if (parts.length < 3) return null;
    const h = Number.parseFloat(parts[0]);
    const s = Number.parseFloat(parts[1]) / 100;
    const l = Number.parseFloat(parts[2]) / 100;
    if ([h, s, l].some((channel) => Number.isNaN(channel))) return null;
    const alpha = parts.length > 3 ? Number.parseFloat(parts[3]) : 1;
    const c = (1 - Math.abs(2 * l - 1)) * s;
    const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
    const m = l - c / 2;
    const sector = Math.floor(((h % 360) + 360) % 360 / 60);
    const [r1, g1, b1] = [
      [c, x, 0], [x, c, 0], [0, c, x], [0, x, c], [x, 0, c], [c, 0, x],
    ][sector] ?? [0, 0, 0];
    return {
      r: Math.round((r1 + m) * 255),
      g: Math.round((g1 + m) * 255),
      b: Math.round((b1 + m) * 255),
      a: Number.isNaN(alpha) ? 1 : alpha,
    };
  }
  return null;
}

// Channel-tolerant color equality (the impeccable calibration): two colors are the same value
// when every RGB channel differs by at most 6 and alpha by at most 0.02 — formatting noise
// (rgba(x,y,z,.9) vs rgba(x, y, z, 0.90)) and sub-perceptual drift never count as foreign.
const COLOR_CHANNEL_TOLERANCE = 6;
const COLOR_ALPHA_TOLERANCE = 0.02;
export function colorsMatch(a, b) {
  return Math.abs(a.r - b.r) <= COLOR_CHANNEL_TOLERANCE
    && Math.abs(a.g - b.g) <= COLOR_CHANNEL_TOLERANCE
    && Math.abs(a.b - b.b) <= COLOR_CHANNEL_TOLERANCE
    && Math.abs(a.a - b.a) <= COLOR_ALPHA_TOLERANCE;
}

// The project's truth, parsed from design/system/tokens.css: every color literal and every
// font-size value that appears in a CUSTOM PROPERTY declaration. `parsedColors` carries the
// channel form of every palette literal for tolerant matching; `colors` keeps the normalized
// strings as the fallback for literals parseColor cannot read.
export function parseTokens(css) {
  const colors = new Set();
  const parsedColors = [];
  const fontSizes = new Set();
  for (const declaration of css.split(/[;{}\n]/)) {
    const custom = declaration.match(/^\s*(--[\w-]+)\s*:\s*(.+)$/);
    if (custom === null) continue;
    const value = custom[2].trim();
    for (const color of value.matchAll(/#[0-9a-fA-F]{3,8}\b|rgba?\([^)]*\)|hsla?\([^)]*\)/g)) {
      colors.add(color[0].replace(/\s+/g, '').toLowerCase());
      const parsed = parseColor(color[0]);
      if (parsed !== null) parsedColors.push(parsed);
    }
    if (/^--(font-size|fs)-/.test(custom[1])) {
      fontSizes.add(value.toLowerCase());
    }
  }
  return { colors, parsedColors, fontSizes };
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

// Duplicate custom-property names in a css text: returns the names declared
// twice+ within ONE cascade context — the same stack of block headers
// (selector plus enclosing at-rules). A fallback re-declaration inside
// @supports/@media, or under a different selector, is a legitimate cascade
// layer, not a duplicate; two declarations in the very same block still are.
export function findDuplicateTokens(css) {
  const seen = new Set();
  const duplicates = new Set();
  const blockStack = [];
  let buffer = '';
  const flush = () => {
    const custom = buffer.match(/^\s*(--[\w-]+)\s*:/);
    buffer = '';
    if (custom === null) return;
    const contextKey = `${blockStack.join(' > ')}|${custom[1]}`;
    if (seen.has(contextKey)) duplicates.add(custom[1]);
    seen.add(contextKey);
  };
  for (const char of css.replace(/\/\*[\s\S]*?\*\//g, '')) {
    if (char === '{') {
      blockStack.push(buffer.trim().replace(/\s+/g, ' '));
      buffer = '';
    } else if (char === '}') {
      flush();
      blockStack.pop();
    } else if (char === ';') {
      flush();
    } else {
      buffer += char;
    }
  }
  return [...duplicates];
}
