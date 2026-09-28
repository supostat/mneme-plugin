#!/usr/bin/env node

import { readFileSync } from 'node:fs';

const MANIFEST_URL = new URL('../.claude-plugin/plugin.json', import.meta.url);

function printVersion() {
  const manifest = JSON.parse(readFileSync(MANIFEST_URL, 'utf8'));
  console.log(`${manifest.name} ${manifest.version}`);
}

const COMMANDS = new Map([['version', printVersion]]);

const [commandName] = process.argv.slice(2);
const command = COMMANDS.get(commandName);
if (command === undefined) {
  console.error(`usage: figura <command>\ncommands: ${[...COMMANDS.keys()].join(', ')}`);
  process.exit(2);
}
command();
