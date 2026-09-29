import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { StringDecoder } from 'node:string_decoder';
import { FiguraError } from './figura-error.mjs';

const MESSAGE_TERMINATOR = '\0';
const DEFAULT_COMMAND_TIMEOUT_MILLISECONDS = 30_000;
const EXIT_GRACE_MILLISECONDS = 5_000;
const STDERR_TAIL_CHARACTERS = 2_000;
const BROWSER_FLAGS = ['--headless', '--no-first-run', '--no-default-browser-check', '--remote-debugging-pipe'];
const STUCK_BROWSER_REMEDY = 'the browser is stuck or overloaded; run the command again';

function settlesWithin(promise, milliseconds) {
  let timer;
  const deadline = new Promise((resolve) => {
    timer = setTimeout(() => resolve(false), milliseconds);
  });
  return Promise.race([promise.then(() => true), deadline]).finally(() => clearTimeout(timer));
}

export class CdpSession {
  #child;
  #commandPipe;
  #profileDirectory;
  #commandTimeoutMilliseconds;
  #nextId = 1;
  #pendingCommands = new Map();
  #eventListeners = new Set();
  #eventWaiterRejections = new Set();
  #decoder = new StringDecoder('utf8');
  #partialMessage = [];
  #stderrTail = '';
  #failure;
  #exited;

  constructor(child, profileDirectory, commandTimeoutMilliseconds) {
    this.#child = child;
    this.#commandPipe = child.stdio[3];
    this.#profileDirectory = profileDirectory;
    this.#commandTimeoutMilliseconds = commandTimeoutMilliseconds;
    this.#exited = new Promise((resolve) => child.once('exit', (code, signal) => resolve({ code, signal })));
    child.stdio[4].on('data', (chunk) => this.#receive(chunk));
    child.stderr.on('data', (chunk) => {
      this.#stderrTail = `${this.#stderrTail}${chunk.toString('utf8')}`.slice(-STDERR_TAIL_CHARACTERS);
    });
    child.once('error', (error) => {
      this.#failAll(new FiguraError('BROWSER-EXITED', `the browser could not start: ${error.message}`));
    });
    child.once('close', (code, signal) => this.#failAll(this.#exitFailure(code, signal)));
    this.#commandPipe.on('error', (error) => {
      this.#failAll(new FiguraError('BROWSER-EXITED', `the browser closed its command pipe: ${error.message}`));
    });
  }

  get profileDirectory() {
    return this.#profileDirectory;
  }

  send(method, params = {}, sessionId) {
    if (this.#failure !== undefined) return Promise.reject(this.#failure);
    const id = this.#nextId++;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.#pendingCommands.delete(id);
        reject(new FiguraError('CDP-TIMEOUT', `${method} got no answer within ${this.#commandTimeoutMilliseconds} ms`, STUCK_BROWSER_REMEDY));
      }, this.#commandTimeoutMilliseconds);
      this.#pendingCommands.set(id, { method, resolve, reject, timer });
      this.#write(sessionId === undefined ? { id, method, params } : { id, sessionId, method, params });
    });
  }

  onEvent(listener) {
    this.#eventListeners.add(listener);
    return () => this.#eventListeners.delete(listener);
  }

  waitForEvent(method, { sessionId, timeoutMilliseconds = this.#commandTimeoutMilliseconds } = {}) {
    if (this.#failure !== undefined) return Promise.reject(this.#failure);
    return new Promise((resolve, reject) => {
      const settle = () => {
        clearTimeout(timer);
        unsubscribe();
        this.#eventWaiterRejections.delete(rejectOnFailure);
      };
      const rejectOnFailure = (failure) => {
        settle();
        reject(failure);
      };
      const unsubscribe = this.onEvent((event) => {
        if (event.method !== method || event.sessionId !== sessionId) return;
        settle();
        resolve(event.params);
      });
      const timer = setTimeout(() => {
        rejectOnFailure(new FiguraError('CDP-TIMEOUT', `no ${method} event within ${timeoutMilliseconds} ms`, STUCK_BROWSER_REMEDY));
      }, timeoutMilliseconds);
      this.#eventWaiterRejections.add(rejectOnFailure);
    });
  }

  async close() {
    if (this.#failure === undefined) {
      this.#write({ id: this.#nextId++, method: 'Browser.close' });
    }
    if (!(await settlesWithin(this.#exited, EXIT_GRACE_MILLISECONDS))) this.#child.kill('SIGKILL');
    const { code, signal } = await this.#exited;
    this.#failAll(this.#exitFailure(code, signal));
    rmSync(this.#profileDirectory, { recursive: true, force: true });
  }

  #exitFailure(code, signal) {
    const stderrTail = this.#stderrTail.trim();
    return new FiguraError('BROWSER-EXITED', `the browser exited (code ${code}, signal ${signal})${stderrTail === '' ? '' : `: ${stderrTail}`}`);
  }

  #write(message) {
    this.#commandPipe.write(`${JSON.stringify(message)}${MESSAGE_TERMINATOR}`);
  }

  #receive(chunk) {
    const text = this.#decoder.write(chunk);
    let messageStart = 0;
    let terminatorIndex = text.indexOf(MESSAGE_TERMINATOR);
    while (terminatorIndex !== -1) {
      this.#partialMessage.push(text.slice(messageStart, terminatorIndex));
      const rawMessage = this.#partialMessage.join('');
      this.#partialMessage = [];
      this.#dispatch(JSON.parse(rawMessage));
      messageStart = terminatorIndex + 1;
      terminatorIndex = text.indexOf(MESSAGE_TERMINATOR, messageStart);
    }
    if (messageStart < text.length) this.#partialMessage.push(text.slice(messageStart));
  }

  #dispatch(message) {
    if (message.id === undefined) {
      for (const listener of this.#eventListeners) listener(message);
      return;
    }
    const pending = this.#pendingCommands.get(message.id);
    if (pending === undefined) return;
    this.#pendingCommands.delete(message.id);
    clearTimeout(pending.timer);
    if (message.error === undefined) {
      pending.resolve(message.result);
    } else {
      pending.reject(
        new FiguraError('CDP-COMMAND-FAILED', `${pending.method} failed: ${message.error.message} (code ${message.error.code})`),
      );
    }
  }

  #failAll(failure) {
    if (this.#failure !== undefined) return;
    this.#failure = failure;
    for (const pending of this.#pendingCommands.values()) {
      clearTimeout(pending.timer);
      pending.reject(failure);
    }
    this.#pendingCommands.clear();
    for (const rejectOnFailure of [...this.#eventWaiterRejections]) rejectOnFailure(failure);
  }
}

export function openCdpSession({ executablePath, commandTimeoutMilliseconds = DEFAULT_COMMAND_TIMEOUT_MILLISECONDS }) {
  const profileDirectory = mkdtempSync(join(tmpdir(), 'figura-chromium-'));
  const child = spawn(executablePath, [...BROWSER_FLAGS, `--user-data-dir=${profileDirectory}`], {
    stdio: ['ignore', 'ignore', 'pipe', 'pipe', 'pipe'],
  });
  return new CdpSession(child, profileDirectory, commandTimeoutMilliseconds);
}
