#!/usr/bin/env node

import { appendFileSync, readFileSync, writeFileSync } from 'node:fs';
import { Socket } from 'node:net';
import { basename } from 'node:path';

const MESSAGE_TERMINATOR = '\0';
const FAKE_VERSION = 'Chromium 131.0.6778.0';
const HIGHLIGHT_MARKER = 'data-figura-highlight';
const TABLE_MEASURE_MARKER = 'measureFiguraTables';
const ONE_PIXEL_PNG = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';
const TWO_PAGE_PDF = [
  '%PDF-1.4',
  '1 0 obj << /Type /Catalog /Pages 2 0 R >> endobj',
  '2 0 obj << /Type /Pages /Kids [3 0 R 4 0 R] /Count 2 >> endobj',
  '3 0 obj << /Type /Page /Parent 2 0 R /MediaBox [0 0 594.96 841.92] >> endobj',
  '4 0 obj << /Type /Page /Parent 2 0 R /MediaBox [0 0 594.96 841.92] >> endobj',
  'trailer << /Root 1 0 R >>',
  '%%EOF',
  '',
].join('\n');

if (process.argv.includes('--version')) {
  console.log(FAKE_VERSION);
  process.exit(0);
}

const recordedMeasurements =
  process.env.FIGURA_FAKE_MEASUREMENTS === undefined ? undefined : JSON.parse(readFileSync(process.env.FIGURA_FAKE_MEASUREMENTS, 'utf8'));
const recordedTableOverflows =
  process.env.FIGURA_FAKE_TABLE_OVERFLOWS === undefined ? [] : JSON.parse(readFileSync(process.env.FIGURA_FAKE_TABLE_OVERFLOWS, 'utf8'));
const commands = new Socket({ fd: 3, readable: true, writable: false });
const replies = new Socket({ fd: 4, readable: false, writable: true });
const pageUrlBySession = new Map();
let partialMessage = '';
let targetCount = 0;

function reply(message) {
  replies.write(`${JSON.stringify(message)}${MESSAGE_TERMINATOR}`);
}

async function recordPrintedPage(sessionId) {
  if (process.env.FIGURA_FAKE_PRINTED_PAGE === undefined) return;
  const response = await fetch(pageUrlBySession.get(sessionId));
  writeFileSync(process.env.FIGURA_FAKE_PRINTED_PAGE, await response.text());
}

function recordHighlights(expression) {
  if (process.env.FIGURA_FAKE_OVERLAY_LOG === undefined || !expression.includes(HIGHLIGHT_MARKER)) return;
  appendFileSync(process.env.FIGURA_FAKE_OVERLAY_LOG, `${expression}\n`);
}

function evaluate(id, sessionId, expression) {
  if (recordedMeasurements === undefined) return;
  if (expression.includes(TABLE_MEASURE_MARKER)) {
    reply({ id, sessionId, result: { result: { type: 'object', value: recordedTableOverflows } } });
    return;
  }
  const fileName = basename(new URL(pageUrlBySession.get(sessionId)).pathname);
  const measurement = recordedMeasurements[fileName];
  reply({ id, sessionId, result: { result: measurement === undefined ? { type: 'undefined' } : { type: 'object', value: measurement } } });
}

function handle({ id, method, params, sessionId }) {
  switch (method) {
    case 'Browser.getVersion':
      reply({ id, result: { protocolVersion: '1.3', product: 'HeadlessChrome/131.0.0.0' } });
      break;
    case 'Browser.getBrowserCommandLine':
      reply({ id, result: { arguments: process.argv.slice(2) } });
      break;
    case 'Target.setDiscoverTargets':
      reply({ id, result: {} });
      reply({ method: 'Target.targetCreated', params: { targetInfo: { targetId: 'fake-page', type: 'page', url: 'about:blank' } } });
      break;
    case 'Target.createTarget':
      targetCount += 1;
      reply({ id, result: { targetId: `fake-target-${targetCount}` } });
      break;
    case 'Target.attachToTarget':
      reply({ id, result: { sessionId: `fake-session-${params.targetId}` } });
      break;
    case 'Page.enable':
      if (sessionId === undefined) {
        reply({ id, error: { code: -32601, message: `'${method}' wasn't found` } });
      } else {
        reply({ id, sessionId, result: {} });
      }
      break;
    case 'Page.navigate':
      if (sessionId === undefined) {
        reply({ id, error: { code: -32601, message: `'${method}' wasn't found` } });
        break;
      }
      pageUrlBySession.set(sessionId, params.url);
      reply({ id, sessionId, result: { frameId: 'fake-frame', loaderId: `fake-loader-${id}` } });
      reply({ method: 'Page.loadEventFired', sessionId, params: { timestamp: 0 } });
      break;
    case 'Runtime.evaluate':
      recordHighlights(params.expression);
      evaluate(id, sessionId, params.expression);
      break;
    case 'Emulation.setDeviceMetricsOverride':
      reply({ id, sessionId, result: {} });
      break;
    case 'Page.captureScreenshot':
      reply({ id, sessionId, result: { data: ONE_PIXEL_PNG } });
      break;
    case 'Page.printToPDF':
      recordPrintedPage(sessionId).then(() => reply({ id, sessionId, result: { data: Buffer.from(TWO_PAGE_PDF, 'latin1').toString('base64') } }));
      break;
    case 'Browser.close':
      reply({ id, result: {} });
      replies.end(() => process.exit(0));
      break;
    default:
      reply({ id, error: { code: -32601, message: `'${method}' wasn't found` } });
  }
}

commands.setEncoding('utf8');
commands.on('data', (text) => {
  const messages = `${partialMessage}${text}`.split(MESSAGE_TERMINATOR);
  partialMessage = messages.pop();
  for (const message of messages) handle(JSON.parse(message));
});
commands.on('end', () => process.exit(0));
