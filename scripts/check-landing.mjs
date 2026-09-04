// Landing invariants gate (SPEC-LANDING). One argv call, exit 0 only when every
// invariant holds; each failure is a named stderr line. Dependency-free node.
import { existsSync, readFileSync, statSync } from "node:fs";

const INDEX_PATH = "site/index.html";
// Secondary pages share ONLY the host invariant (SPEC-METRICS-PAGE): the word/marker
// invariants below are index-specific and do not extend to them.
const SECONDARY_PAGES = ["site/metrics.html"];
const OG_PATH = "site/og.svg";
// og.png is the RASTER DERIVATIVE of og.svg (1200×630): social-card crawlers
// reject SVG images, so the absolute og:image URL points at the PNG. When
// og.svg changes, regenerate the PNG by hand (rsvg-convert -w 1200 -h 630).
const OG_RASTER_PATH = "site/og.png";
const README_PATH = "plugin/README.md";
const MAX_INDEX_BYTES = 256000;
const FORBIDDEN_WORDS = /magic|supercharge|revolutioniz|unleash|lorem ipsum|coming soon/i;
const ARTIFACT_MARKERS = ["BEGIN MNEME NOTE", "workflow_run_started", "staging", "exit-zero"];
const DESIGN_CARD_HEADING = "<h3>/mneme:design</h3>";
const DESIGN_SERVER_SKILL = "/mneme:design-server";
// supostat.github.io is the landing's own Pages origin — needed for the
// absolute og:url / og:image meta; every other host is still rejected.
const ALLOWED_HOSTS = new Set([
  "fonts.googleapis.com",
  "fonts.gstatic.com",
  "github.com",
  "supostat.github.io",
]);

const failures = [];

function check(condition, name) {
  if (!condition) failures.push(name);
}

check(existsSync(INDEX_PATH), `missing file: ${INDEX_PATH}`);
check(existsSync(OG_PATH), `missing file: ${OG_PATH}`);
check(
  existsSync(OG_RASTER_PATH) && statSync(OG_RASTER_PATH).size > 0,
  `missing or empty raster card: ${OG_RASTER_PATH} (regenerate from ${OG_PATH})`,
);
check(existsSync(README_PATH), `missing file: ${README_PATH}`);

if (failures.length === 0) {
  const indexHtml = readFileSync(INDEX_PATH, "utf8");
  const ogSvg = readFileSync(OG_PATH, "utf8");
  const readme = readFileSync(README_PATH, "utf8");

  check(ogSvg.includes("<svg"), `${OG_PATH} carries no <svg tag`);

  const indexBytes = statSync(INDEX_PATH).size;
  check(
    indexBytes < MAX_INDEX_BYTES,
    `${INDEX_PATH} is ${indexBytes} bytes, limit ${MAX_INDEX_BYTES}`,
  );

  const forbidden = indexHtml.match(FORBIDDEN_WORDS);
  check(forbidden === null, `forbidden word in ${INDEX_PATH}: ${forbidden && forbidden[0]}`);

  for (const marker of ARTIFACT_MARKERS) {
    check(indexHtml.includes(marker), `artifact marker missing from ${INDEX_PATH}: ${marker}`);
  }

  // The launcher is not a verb of the roster (which stays ten): it belongs to the
  // design card. Locating the card by its heading is what makes this positional —
  // a page-wide substring test would pass with the mention anywhere.
  const designCardAt = indexHtml.indexOf(DESIGN_CARD_HEADING);
  check(designCardAt !== -1, `design card heading missing from ${INDEX_PATH}: ${DESIGN_CARD_HEADING}`);
  if (designCardAt !== -1) {
    const cardEndAt = indexHtml.indexOf("</div>", designCardAt);
    const designCard = indexHtml.slice(designCardAt, cardEndAt === -1 ? undefined : cardEndAt);
    check(
      designCard.includes(DESIGN_SERVER_SKILL),
      `${DESIGN_SERVER_SKILL} missing from the ${DESIGN_CARD_HEADING} card in ${INDEX_PATH} ` +
        `(the launcher is mentioned inside the design card, never as an eleventh roster card)`,
    );
  }

  check(
    indexHtml.includes("mneme moves the gate"),
    `positioning key phrase missing from ${INDEX_PATH}: "mneme moves the gate" ` +
      `(the landing block is the short twin of the README section "Why not CLAUDE.md, or the built-in memory")`,
  );

  const urlPattern = /https?:\/\/([^/"'\s<>)]+)/g;
  for (const match of indexHtml.matchAll(urlPattern)) {
    const host = match[1];
    check(ALLOWED_HOSTS.has(host), `external host not on the whitelist: ${host}`);
  }

  for (const pagePath of SECONDARY_PAGES) {
    check(existsSync(pagePath), `missing file: ${pagePath}`);
    if (!existsSync(pagePath)) continue;
    const pageHtml = readFileSync(pagePath, "utf8");
    for (const match of pageHtml.matchAll(urlPattern)) {
      const host = match[1];
      check(ALLOWED_HOSTS.has(host), `external host not on the whitelist in ${pagePath}: ${host}`);
    }
  }

  check(readme.includes("Landing: site/"), `"Landing: site/" line missing from ${README_PATH}`);
}

if (failures.length > 0) {
  for (const failure of failures) console.error(`check-landing FAIL: ${failure}`);
  process.exit(1);
}
console.log("check-landing PASS: all landing invariants hold");
