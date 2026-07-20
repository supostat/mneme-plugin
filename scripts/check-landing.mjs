// Landing invariants gate (SPEC-LANDING). One argv call, exit 0 only when every
// invariant holds; each failure is a named stderr line. Dependency-free node.
import { existsSync, readFileSync, statSync } from "node:fs";

const INDEX_PATH = "site/index.html";
const OG_PATH = "site/og.svg";
const README_PATH = "plugin/README.md";
const MAX_INDEX_BYTES = 256000;
const FORBIDDEN_WORDS = /magic|supercharge|revolutioniz|unleash|lorem ipsum|coming soon/i;
const ARTIFACT_MARKERS = ["BEGIN MNEME NOTE", "workflow_run_started", "staging", "exit-zero"];
const ALLOWED_HOSTS = new Set(["fonts.googleapis.com", "fonts.gstatic.com", "github.com"]);

const failures = [];

function check(condition, name) {
  if (!condition) failures.push(name);
}

check(existsSync(INDEX_PATH), `missing file: ${INDEX_PATH}`);
check(existsSync(OG_PATH), `missing file: ${OG_PATH}`);
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

  const urlPattern = /https?:\/\/([^/"'\s<>)]+)/g;
  for (const match of indexHtml.matchAll(urlPattern)) {
    const host = match[1];
    check(ALLOWED_HOSTS.has(host), `external host not on the whitelist: ${host}`);
  }

  check(readme.includes("Landing: site/"), `"Landing: site/" line missing from ${README_PATH}`);
}

if (failures.length > 0) {
  for (const failure of failures) console.error(`check-landing FAIL: ${failure}`);
  process.exit(1);
}
console.log("check-landing PASS: all landing invariants hold");
