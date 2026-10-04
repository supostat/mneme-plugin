import { writeFileSync } from 'node:fs';
import { basename, dirname } from 'node:path';
import { openCdpSession } from './cdp-session.mjs';
import { FiguraError } from './figura-error.mjs';
import { startLoopbackServer } from './loopback-server.mjs';

const DIAGRAMS_URL_PREFIX = '/diagrams/';
const CAPTURE_SCALE = 2;
const HIGHLIGHT_STROKE_PIXELS = 2;
export const HIGHLIGHT_MARKER = 'data-figura-highlight';

export function highlightExpression(highlights, color) {
  return `(async () => {
  await document.fonts.ready;
  const root = document.documentElement;
  const viewBox = root.viewBox.baseVal;
  root.setAttribute('width', viewBox.width);
  root.setAttribute('height', viewBox.height);
  const isLimitLine = (box) => box.width === 0 || box.height === 0;
  for (const box of ${JSON.stringify(highlights)}) {
    const frame = document.createElementNS('http://www.w3.org/2000/svg', isLimitLine(box) ? 'line' : 'rect');
    const geometry = isLimitLine(box)
      ? { x1: box.x, y1: box.y, x2: box.x + box.width, y2: box.y + box.height }
      : { x: box.x, y: box.y, width: box.width, height: box.height, fill: 'none' };
    const attributes = { ...geometry, stroke: ${JSON.stringify(color)}, 'stroke-width': ${HIGHLIGHT_STROKE_PIXELS}, '${HIGHLIGHT_MARKER}': '' };
    for (const [name, value] of Object.entries(attributes)) frame.setAttribute(name, value);
    root.appendChild(frame);
  }
  return { widthPixels: viewBox.width, heightPixels: viewBox.height };
})()`;
}

export async function captureFailedDiagrams(failedDiagrams, { executablePath, highlightColor }) {
  const server = await startLoopbackServer([{ urlPrefix: DIAGRAMS_URL_PREFIX, directory: dirname(failedDiagrams[0].svgPath) }]);
  const session = openCdpSession({ executablePath });
  try {
    const { targetId } = await session.send('Target.createTarget', { url: 'about:blank' });
    const { sessionId } = await session.send('Target.attachToTarget', { targetId, flatten: true });
    await session.send('Page.enable', {}, sessionId);
    for (const diagram of failedDiagrams) {
      const url = `${server.origin}${DIAGRAMS_URL_PREFIX}${basename(diagram.svgPath)}`;
      const [navigation] = await Promise.all([session.send('Page.navigate', { url }, sessionId), session.waitForEvent('Page.loadEventFired', { sessionId })]);
      if (navigation.errorText !== undefined) {
        throw new FiguraError('PREVIEW-FAILED', `Chromium could not open ${url}: ${navigation.errorText}`, 'run the command again to get the previews');
      }
      const evaluation = await session.send(
        'Runtime.evaluate',
        { expression: highlightExpression(diagram.highlights, highlightColor), awaitPromise: true, returnByValue: true },
        sessionId,
      );
      if (evaluation.exceptionDetails !== undefined || evaluation.result.value === undefined) {
        throw new FiguraError('PREVIEW-FAILED', `framing the conflicts of ${basename(diagram.svgPath)} failed`, 'run the command again to get the previews');
      }
      const { widthPixels, heightPixels } = evaluation.result.value;
      await session.send(
        'Emulation.setDeviceMetricsOverride',
        { width: Math.ceil(widthPixels), height: Math.ceil(heightPixels), deviceScaleFactor: CAPTURE_SCALE, mobile: false },
        sessionId,
      );
      const { data } = await session.send('Page.captureScreenshot', { format: 'png' }, sessionId);
      writeFileSync(diagram.previewPath, Buffer.from(data, 'base64'));
    }
  } finally {
    await session.close();
    await server.close();
  }
}
