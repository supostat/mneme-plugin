import { basename, dirname } from 'node:path';
import { openCdpSession } from './cdp-session.mjs';
import { FiguraError } from './figura-error.mjs';
import { startLoopbackServer } from './loopback-server.mjs';

const DIAGRAMS_URL_PREFIX = '/diagrams/';
const MEASURE_OPEN_SVG = `(async () => {
  await document.fonts.ready;
  const root = document.documentElement;
  const drawing = root.querySelector('svg') ?? root;
  const boxInDrawing = (element) => {
    const box = element.getBBox();
    const matrix = element.getCTM();
    const corners = [
      [box.x, box.y],
      [box.x + box.width, box.y],
      [box.x, box.y + box.height],
      [box.x + box.width, box.y + box.height],
    ].map(([x, y]) => [matrix.a * x + matrix.c * y + matrix.e, matrix.b * x + matrix.d * y + matrix.f]);
    const xs = corners.map(([x]) => x);
    const ys = corners.map(([, y]) => y);
    return { x: Math.min(...xs), y: Math.min(...ys), width: Math.max(...xs) - Math.min(...xs), height: Math.max(...ys) - Math.min(...ys) };
  };
  const decodeObjectId = (token) => {
    if (!/^[A-Za-z0-9+/]+={0,2}$/.test(token) || token.length % 4 !== 0) return undefined;
    try {
      const bytes = Uint8Array.from(atob(token), (character) => character.charCodeAt(0));
      return new TextDecoder('utf-8', { fatal: true }).decode(bytes).replaceAll('&gt;', '>').replaceAll('&lt;', '<').replaceAll('&amp;', '&');
    } catch {
      return undefined;
    }
  };
  const objects = [];
  for (const group of drawing.children) {
    if (group.tagName !== 'g') continue;
    const id = decodeObjectId((group.getAttribute('class') ?? '').trim().split(' ')[0]);
    if (id === undefined) continue;
    const shape = group.querySelector(':scope > g.shape');
    const connection = group.querySelector('path.connection');
    const labels = [...group.querySelectorAll('text')]
      .filter((text) => text.textContent.trim() !== '')
      .map((text) => ({ text: text.textContent.trim(), box: boxInDrawing(text), fontPixels: parseFloat(getComputedStyle(text).fontSize) }));
    objects.push({
      id,
      kind: connection === null ? 'shape' : 'connection',
      box: shape === null ? null : boxInDrawing(shape),
      pathBox: connection === null ? null : boxInDrawing(connection),
      labels,
    });
  }
  const viewBox = root.viewBox.baseVal;
  return { widthPixels: viewBox.width, heightPixels: viewBox.height, objects };
})()`;

export async function measureDiagrams(svgPaths, { executablePath, commandTimeoutMilliseconds }) {
  const server = await startLoopbackServer([{ urlPrefix: DIAGRAMS_URL_PREFIX, directory: dirname(svgPaths[0]) }]);
  const session = openCdpSession({ executablePath, commandTimeoutMilliseconds });
  try {
    const { targetId } = await session.send('Target.createTarget', { url: 'about:blank' });
    const { sessionId } = await session.send('Target.attachToTarget', { targetId, flatten: true });
    await session.send('Page.enable', {}, sessionId);
    const measurements = [];
    for (const svgPath of svgPaths) {
      const url = `${server.origin}${DIAGRAMS_URL_PREFIX}${basename(svgPath)}`;
      const [navigation] = await Promise.all([
        session.send('Page.navigate', { url }, sessionId),
        session.waitForEvent('Page.loadEventFired', { sessionId }),
      ]);
      if (navigation.errorText !== undefined) {
        throw new FiguraError('MEASURE-FAILED', `Chromium could not open ${url}: ${navigation.errorText}`, 'run the check again');
      }
      const evaluation = await session.send('Runtime.evaluate', { expression: MEASURE_OPEN_SVG, awaitPromise: true, returnByValue: true }, sessionId);
      if (evaluation.exceptionDetails !== undefined) {
        throw new FiguraError(
          'MEASURE-FAILED',
          `measuring ${basename(svgPath)} threw: ${evaluation.exceptionDetails.exception?.description ?? evaluation.exceptionDetails.text}`,
          'run the check again; if it repeats, the SVG from d2 is not what figura expects',
        );
      }
      if (evaluation.result.value === undefined) {
        throw new FiguraError('MEASURE-FAILED', `measuring ${basename(svgPath)} returned nothing`, 'run the check again');
      }
      measurements.push(evaluation.result.value);
    }
    return measurements;
  } finally {
    await session.close();
    await server.close();
  }
}
