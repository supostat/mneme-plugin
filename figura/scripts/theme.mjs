import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const BUNDLE_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const THEME_PATH = resolve(BUNDLE_ROOT, 'theme', 'theme.json');
const HEX_COLOR = /^#[0-9a-f]{6}$/;
const CSS_SAFE_FAMILY = /^[A-Za-z0-9 -]+$/;
const CAPTION_RESERVE_LINES = 2;
const CODE_RELATIVE_SIZE_DECIMALS = 4;

export const ROLE_NAMES = ['source', 'core', 'tool', 'app', 'observability', 'neutral', 'note'];
export const SQL_TABLE_CLASS = 'table';
const SQL_TABLE_BODY_FILL = 'transparent';
const ROLE_COLOR_KEYS = ['fill', 'stroke', 'text'];
const CALLOUT_KINDS = ['warning', 'note', 'decision'];
const CALLOUT_COLOR_KEYS = ['line', 'label'];
const TEXT_COLOR_KEYS = ['primary', 'muted', 'accent'];
const MARGIN_SIDES = ['top', 'right', 'bottom', 'left'];
const FONT_ROLES = ['text', 'code'];
const FONT_STYLES = ['normal', 'italic'];
const TYPOGRAPHY_ENTRIES = ['text', 'table', 'code', 'h1', 'h2', 'h3', 'footer', 'caption'];
const D2_FONT_SLOTS = [
  { flag: '--font-regular', weight: 400, style: 'normal' },
  { flag: '--font-italic', weight: 400, style: 'italic' },
  { flag: '--font-semibold', weight: 600, style: 'normal' },
  { flag: '--font-bold', weight: 700, style: 'normal' },
];
const SPACING_PROPERTIES = new Map([
  ['paragraphPoints', 'space-paragraph'],
  ['blockPoints', 'space-block'],
  ['headingBeforePoints', 'space-heading-before'],
  ['headingAfterPoints', 'space-heading-after'],
]);

function requireColor(problems, path, value) {
  if (typeof value !== 'string' || !HEX_COLOR.test(value)) {
    problems.push(`${path} is ${JSON.stringify(value)}, not a #rrggbb color`);
  }
}

function requirePoints(problems, path, value, { allowZero }) {
  const isPoints = typeof value === 'number' && Number.isFinite(value) && (allowZero ? value >= 0 : value > 0);
  if (!isPoints) {
    problems.push(`${path} is ${JSON.stringify(value)}, not a ${allowZero ? 'non-negative' : 'positive'} number of points`);
  }
}

function validatePage(problems, page) {
  requirePoints(problems, 'page.widthPoints', page?.widthPoints, { allowZero: false });
  requirePoints(problems, 'page.heightPoints', page?.heightPoints, { allowZero: false });
  for (const side of MARGIN_SIDES) {
    requirePoints(problems, `page.marginPoints.${side}`, page?.marginPoints?.[side], { allowZero: true });
  }
  if (problems.length > 0) return;
  const { widthPoints, heightPoints, marginPoints } = page;
  if (widthPoints - marginPoints.left - marginPoints.right <= 0 || heightPoints - marginPoints.top - marginPoints.bottom <= 0) {
    problems.push('page.marginPoints leave no column on the page');
  }
}

function validateRoles(problems, roles) {
  for (const role of ROLE_NAMES) {
    if (roles?.[role] === undefined) {
      problems.push(`role "${role}" is missing — every role (${ROLE_NAMES.join(', ')}) needs ${ROLE_COLOR_KEYS.join(', ')}`);
      continue;
    }
    for (const key of ROLE_COLOR_KEYS) requireColor(problems, `roles.${role}.${key}`, roles[role][key]);
  }
  for (const role of Object.keys(roles ?? {})) {
    if (!ROLE_NAMES.includes(role)) problems.push(`roles.${role} is not a figura role (roles: ${ROLE_NAMES.join(', ')})`);
  }
}

function validateFonts(problems, fonts) {
  for (const fontRole of FONT_ROLES) {
    const font = fonts?.[fontRole];
    if (typeof font?.family !== 'string' || !CSS_SAFE_FAMILY.test(font.family)) {
      problems.push(`fonts.${fontRole}.family is ${JSON.stringify(font?.family)}, not a name of letters, digits, spaces and hyphens`);
    }
    if (!Array.isArray(font?.faces) || font.faces.length === 0) {
      problems.push(`fonts.${fontRole}.faces must list at least one font file`);
      continue;
    }
    if (fontRole === 'text') {
      for (const { flag, weight, style } of D2_FONT_SLOTS) {
        if (!font.faces.some((face) => face?.weight === weight && face?.style === style)) {
          problems.push(`fonts.text has no face with weight ${weight} and style ${style}, which d2 needs for ${flag}`);
        }
      }
    }
    font.faces.forEach((face, index) => {
      const path = `fonts.${fontRole}.faces[${index}]`;
      if (typeof face?.file !== 'string' || !existsSync(resolve(BUNDLE_ROOT, face.file))) {
        problems.push(`${path}.file ${JSON.stringify(face?.file)} does not exist in the figura bundle`);
      }
      if (!Number.isInteger(face?.weight) || face.weight < 100 || face.weight > 900) {
        problems.push(`${path}.weight is ${JSON.stringify(face?.weight)}, not a CSS weight from 100 to 900`);
      }
      if (!FONT_STYLES.includes(face?.style)) {
        problems.push(`${path}.style is ${JSON.stringify(face?.style)}, not one of ${FONT_STYLES.join(', ')}`);
      }
    });
  }
}

export function validateTheme(theme) {
  const problems = [];
  validatePage(problems, theme.page);
  for (const key of TEXT_COLOR_KEYS) requireColor(problems, `text.${key}`, theme.text?.[key]);
  validateRoles(problems, theme.roles);
  for (const kind of CALLOUT_KINDS) {
    for (const key of CALLOUT_COLOR_KEYS) requireColor(problems, `callouts.${kind}.${key}`, theme.callouts?.[kind]?.[key]);
  }
  requireColor(problems, 'table.headerFill', theme.table?.headerFill);
  requireColor(problems, 'table.rule', theme.table?.rule);
  requirePoints(problems, 'table.ruleWidthPoints', theme.table?.ruleWidthPoints, { allowZero: false });
  requirePoints(problems, 'table.cellPaddingBlockPoints', theme.table?.cellPaddingBlockPoints, { allowZero: true });
  requirePoints(problems, 'table.cellPaddingInlinePoints', theme.table?.cellPaddingInlinePoints, { allowZero: true });
  validateFonts(problems, theme.fonts);
  for (const entry of TYPOGRAPHY_ENTRIES) {
    requirePoints(problems, `typography.${entry}.sizePoints`, theme.typography?.[entry]?.sizePoints, { allowZero: false });
    requirePoints(problems, `typography.${entry}.lineHeightPoints`, theme.typography?.[entry]?.lineHeightPoints, { allowZero: false });
  }
  for (const key of SPACING_PROPERTIES.keys()) {
    requirePoints(problems, `spacing.${key}`, theme.spacing?.[key], { allowZero: true });
  }
  requirePoints(problems, 'diagram.captionGapPoints', theme.diagram?.captionGapPoints, { allowZero: true });
  if (!Number.isInteger(theme.diagram?.padPixels) || theme.diagram.padPixels < 0) {
    problems.push(`diagram.padPixels is ${JSON.stringify(theme.diagram?.padPixels)}, not a non-negative whole number of pixels`);
  }
  requirePoints(problems, 'diagram.minimumLabelPoints', theme.diagram?.minimumLabelPoints, { allowZero: false });
  requireColor(problems, 'diagram.failureHighlight', theme.diagram?.failureHighlight);
  if (problems.length > 0) {
    throw new Error(`theme is invalid:\n${problems.map((problem) => `  - ${problem}`).join('\n')}`);
  }
}

export function loadTheme() {
  let theme;
  try {
    theme = JSON.parse(readFileSync(THEME_PATH, 'utf8'));
  } catch (cause) {
    throw new Error(`theme: cannot read ${THEME_PATH} — ${cause.message}`);
  }
  validateTheme(theme);
  return theme;
}

function points(value) {
  return `${value}pt`;
}

function codeRelativeSize(theme) {
  return `${Number((theme.typography.code.sizePoints / theme.typography.text.sizePoints).toFixed(CODE_RELATIVE_SIZE_DECIMALS))}em`;
}

export function themeCss(theme) {
  const properties = [
    ['page-width', points(theme.page.widthPoints)],
    ['page-height', points(theme.page.heightPoints)],
    ...MARGIN_SIDES.map((side) => [`page-margin-${side}`, points(theme.page.marginPoints[side])]),
    ...TEXT_COLOR_KEYS.map((key) => [`text-${key}`, theme.text[key]]),
    ...ROLE_NAMES.flatMap((role) => ROLE_COLOR_KEYS.map((key) => [`role-${role}-${key}`, theme.roles[role][key]])),
    ...CALLOUT_KINDS.flatMap((kind) => CALLOUT_COLOR_KEYS.map((key) => [`callout-${kind}-${key}`, theme.callouts[kind][key]])),
    ['table-header-fill', theme.table.headerFill],
    ['table-rule', theme.table.rule],
    ['table-rule-width', points(theme.table.ruleWidthPoints)],
    ['table-cell-padding-block', points(theme.table.cellPaddingBlockPoints)],
    ['table-cell-padding-inline', points(theme.table.cellPaddingInlinePoints)],
    ...FONT_ROLES.map((fontRole) => [`font-${fontRole}`, `"${theme.fonts[fontRole].family}"`]),
    ...TYPOGRAPHY_ENTRIES.flatMap((entry) => [
      [`${entry}-size`, points(theme.typography[entry].sizePoints)],
      [`${entry}-line-height`, points(theme.typography[entry].lineHeightPoints)],
    ]),
    ['code-relative-size', codeRelativeSize(theme)],
    ...[...SPACING_PROPERTIES].map(([key, property]) => [property, points(theme.spacing[key])]),
    ['caption-gap', points(theme.diagram.captionGapPoints)],
  ];
  return `:root {\n${properties.map(([name, value]) => `  --figura-${name}: ${value};`).join('\n')}\n}\n`;
}

function d2ClassBlock(name, { fill, stroke, fontColor }) {
  return [`  ${name}: {`, '    style: {', `      fill: "${fill}"`, `      stroke: "${stroke}"`, `      font-color: "${fontColor}"`, '    }', '  }'].join('\n');
}

export function d2Classes(theme) {
  const roleBlocks = ROLE_NAMES.map((role) => {
    const { fill, stroke, text } = theme.roles[role];
    return d2ClassBlock(role, { fill, stroke, fontColor: text });
  });
  const tableBlock = d2ClassBlock(SQL_TABLE_CLASS, { fill: theme.table.headerFill, stroke: SQL_TABLE_BODY_FILL, fontColor: theme.text.primary });
  return `classes: {\n${[...roleBlocks, tableBlock].join('\n')}\n}\n`;
}

export function d2ThemeArguments(theme) {
  const fontArguments = D2_FONT_SLOTS.flatMap(({ flag, weight, style }) => {
    const face = theme.fonts.text.faces.find((candidate) => candidate.weight === weight && candidate.style === style);
    return [flag, resolve(BUNDLE_ROOT, face.file)];
  });
  return ['--pad', String(theme.diagram.padPixels), ...fontArguments];
}

export function pageGeometry(theme) {
  const { widthPoints, heightPoints, marginPoints } = theme.page;
  return {
    widthPoints,
    heightPoints,
    marginPoints: { ...marginPoints },
    columnWidthPoints: widthPoints - marginPoints.left - marginPoints.right,
    columnHeightPoints: heightPoints - marginPoints.top - marginPoints.bottom,
  };
}

export function captionReservePoints(theme) {
  return theme.diagram.captionGapPoints + CAPTION_RESERVE_LINES * theme.typography.caption.lineHeightPoints;
}

export function minimumLabelPoints(theme) {
  return theme.diagram.minimumLabelPoints;
}

export function failureHighlightColor(theme) {
  return theme.diagram.failureHighlight;
}
