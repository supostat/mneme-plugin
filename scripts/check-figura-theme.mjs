#!/usr/bin/env node
//
// Gate for figura/scripts/theme.mjs: the theme yields CSS custom properties, a D2 class for every
// role and a table class for sql_table shapes, and exports the page geometry, the caption reserve
// and the label threshold; a broken theme fails with its named error; figura/template/print.css
// loads only the theme's existing font files.

import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  ROLE_NAMES,
  SQL_TABLE_CLASS,
  captionReservePoints,
  d2Classes,
  loadTheme,
  minimumLabelPoints,
  pageGeometry,
  themeCss,
  validateTheme,
} from '../figura/scripts/theme.mjs';

const FIGURA_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', 'figura');
const PRINT_CSS_PATH = join(FIGURA_ROOT, 'template', 'print.css');
const A4_POINTS = { width: 595.28, height: 841.89 };
const LABEL_THRESHOLD_POINTS = 7;
const CAPTION_LINES_RESERVED = 2;
const failures = [];

function parseD2Classes(classesText) {
  const colorsByClass = new Map();
  let currentClass;
  for (const line of classesText.split('\n')) {
    const classOpening = /^ {2}([a-z]+): \{$/.exec(line);
    if (classOpening !== null) {
      currentClass = classOpening[1];
      colorsByClass.set(currentClass, {});
      continue;
    }
    const color = /^\s+(fill|stroke|font-color): "(#[0-9a-f]{6}|transparent)"$/.exec(line);
    if (color !== null && currentClass !== undefined) colorsByClass.get(currentClass)[color[1]] = color[2];
  }
  return colorsByClass;
}

function checkRoleOutputs(theme) {
  const css = themeCss(theme);
  const classesText = d2Classes(theme);
  if (!classesText.startsWith('classes: {')) {
    failures.push('the D2 block does not open with "classes: {", so it cannot lead a diagram source');
  }
  const colorsByClass = parseD2Classes(classesText);
  for (const role of ROLE_NAMES) {
    const { fill, stroke, text } = theme.roles[role];
    for (const [key, value] of [['fill', fill], ['stroke', stroke], ['text', text]]) {
      const declaration = `--figura-role-${role}-${key}: ${value};`;
      if (!css.includes(declaration)) failures.push(`the CSS lacks ${declaration}`);
    }
    const classColors = colorsByClass.get(role);
    const expected = { fill, stroke, 'font-color': text };
    if (classColors === undefined) {
      failures.push(`the D2 block has no class "${role}"`);
    } else if (JSON.stringify(classColors) !== JSON.stringify(expected)) {
      failures.push(`D2 class "${role}" carries ${JSON.stringify(classColors)}, expected ${JSON.stringify(expected)}`);
    }
  }
  const tableColors = colorsByClass.get(SQL_TABLE_CLASS);
  const expectedTableColors = { fill: theme.table.headerFill, stroke: 'transparent', 'font-color': theme.text.primary };
  if (JSON.stringify(tableColors) !== JSON.stringify(expectedTableColors)) {
    failures.push(`D2 class "${SQL_TABLE_CLASS}" carries ${JSON.stringify(tableColors)}, expected ${JSON.stringify(expectedTableColors)} — d2 fills sql_table rows with the stroke value`);
  }
}

function checkExports(theme) {
  const geometry = pageGeometry(theme);
  const { top, right, bottom, left } = theme.page.marginPoints;
  if (geometry.widthPoints !== A4_POINTS.width || geometry.heightPoints !== A4_POINTS.height) {
    failures.push(`the page is ${geometry.widthPoints}×${geometry.heightPoints} pt, not A4 (${A4_POINTS.width}×${A4_POINTS.height} pt)`);
  }
  if (geometry.columnWidthPoints !== geometry.widthPoints - left - right) {
    failures.push(`the column width ${geometry.columnWidthPoints} pt is not the page width minus the side margins`);
  }
  if (geometry.columnHeightPoints !== geometry.heightPoints - top - bottom) {
    failures.push(`the column height ${geometry.columnHeightPoints} pt is not the page height minus the top and bottom margins`);
  }
  const expectedReserve = theme.diagram.captionGapPoints + CAPTION_LINES_RESERVED * theme.typography.caption.lineHeightPoints;
  if (captionReservePoints(theme) !== expectedReserve) {
    failures.push(`the caption reserve is ${captionReservePoints(theme)} pt, not the gap plus two caption lines (${expectedReserve} pt)`);
  }
  if (minimumLabelPoints(theme) !== LABEL_THRESHOLD_POINTS) {
    failures.push(`the label threshold is ${minimumLabelPoints(theme)} pt, not ${LABEL_THRESHOLD_POINTS} pt`);
  }
}

function expectRejection(caseName, theme, breakTheme, expectedText) {
  const brokenTheme = structuredClone(theme);
  breakTheme(brokenTheme);
  try {
    validateTheme(brokenTheme);
    failures.push(`${caseName}: the broken theme was ACCEPTED`);
  } catch (error) {
    if (!error.message.includes(expectedText)) {
      failures.push(`${caseName}: rejected without naming "${expectedText}" — the error reads:\n${error.message}`);
    }
  }
}

function checkPrintCssFonts(theme) {
  const printCss = readFileSync(PRINT_CSS_PATH, 'utf8');
  const printCssDirectory = dirname(PRINT_CSS_PATH);
  for (const [, url] of printCss.matchAll(/url\("([^"]+)"\)/g)) {
    if (!existsSync(resolve(printCssDirectory, url))) failures.push(`print.css loads ${url}, which does not exist`);
  }
  const familyByCssFile = new Map();
  for (const [, block] of printCss.matchAll(/@font-face\s*\{([^}]*)\}/g)) {
    const family = /font-family:\s*"([^"]+)"/.exec(block)?.[1];
    const url = /url\("([^"]+)"\)/.exec(block)?.[1];
    familyByCssFile.set(resolve(printCssDirectory, url ?? ''), family);
  }
  const familyByThemeFile = new Map();
  for (const font of [theme.fonts.text, theme.fonts.code]) {
    for (const face of font.faces) familyByThemeFile.set(resolve(FIGURA_ROOT, face.file), font.family);
  }
  for (const [file, family] of familyByThemeFile) {
    const bundlePath = relative(FIGURA_ROOT, file);
    if (!familyByCssFile.has(file)) {
      failures.push(`print.css has no @font-face for the theme font ${bundlePath}`);
    } else if (familyByCssFile.get(file) !== family) {
      failures.push(`print.css names ${bundlePath} "${familyByCssFile.get(file)}", the theme names it "${family}"`);
    }
  }
  for (const file of familyByCssFile.keys()) {
    if (!familyByThemeFile.has(file)) failures.push(`print.css loads ${relative(FIGURA_ROOT, file)}, which the theme does not list`);
  }
}

let theme;
try {
  theme = loadTheme();
} catch (error) {
  failures.push(`the bundled theme does not load: ${error.message}`);
}

if (theme !== undefined) {
  checkRoleOutputs(theme);
  checkExports(theme);
  expectRejection('missing role', theme, (brokenTheme) => delete brokenTheme.roles.tool, 'role "tool" is missing');
  expectRejection(
    'color outside #rrggbb',
    theme,
    (brokenTheme) => {
      brokenTheme.roles.core.fill = 'purple';
    },
    'roles.core.fill is "purple", not a #rrggbb color',
  );
  expectRejection(
    'font on a missing file',
    theme,
    (brokenTheme) => {
      brokenTheme.fonts.text.faces[0].file = 'fonts/inter/Inter-Missing.ttf';
    },
    'fonts.text.faces[0].file "fonts/inter/Inter-Missing.ttf" does not exist in the figura bundle',
  );
  expectRejection(
    'text font without a d2 slot',
    theme,
    (brokenTheme) => {
      brokenTheme.fonts.text.faces = brokenTheme.fonts.text.faces.filter((face) => face.weight !== 600);
    },
    'fonts.text has no face with weight 600 and style normal, which d2 needs for --font-semibold',
  );
  checkPrintCssFonts(theme);
}

if (failures.length > 0) {
  console.error('figura theme check FAILED:');
  for (const failure of failures) console.error(`  - ${failure}`);
  process.exit(1);
}
console.log(
  'figura theme check passed: every role has its CSS properties and D2 class, sql_table shapes have their table class, the geometry, caption reserve and label threshold are exported, a missing role, a bad color and a missing font file are each rejected by name, and print.css loads only the theme fonts.',
);
