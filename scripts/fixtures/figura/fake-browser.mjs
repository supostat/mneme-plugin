#!/usr/bin/env node

import { Socket } from 'node:net';

const MESSAGE_TERMINATOR = '\0';
const commands = new Socket({ fd: 3, readable: true, writable: false });
const replies = new Socket({ fd: 4, readable: false, writable: true });
let partialMessage = '';

function reply(message) {
  replies.write(`${JSON.stringify(message)}${MESSAGE_TERMINATOR}`);
}

function handle({ id, method }) {
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
    case 'Runtime.evaluate':
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
