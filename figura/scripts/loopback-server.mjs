import { createReadStream, realpathSync, statSync } from 'node:fs';
import { createServer } from 'node:http';
import { extname, resolve, sep } from 'node:path';

const LOOPBACK_HOST = '127.0.0.1';
const CONTENT_TYPES = new Map([
  ['.html', 'text/html; charset=utf-8'],
  ['.css', 'text/css; charset=utf-8'],
  ['.svg', 'image/svg+xml'],
  ['.ttf', 'font/ttf'],
]);

function decodedRequestPath(requestUrl) {
  try {
    return decodeURIComponent(new URL(requestUrl, `http://${LOOPBACK_HOST}`).pathname);
  } catch {
    return undefined;
  }
}

function isInside(root, path) {
  return path === root || path.startsWith(`${root}${sep}`);
}

function mountedFile(mounts, requestPath) {
  const mount = mounts.find(({ urlPrefix }) => requestPath.startsWith(urlPrefix));
  if (mount === undefined) return undefined;
  const root = realpathSync(mount.directory);
  let file;
  try {
    file = realpathSync(resolve(root, requestPath.slice(mount.urlPrefix.length)));
  } catch {
    return undefined;
  }
  return isInside(root, file) && statSync(file).isFile() ? file : undefined;
}

function answerNotFound(response) {
  response.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' });
  response.end('not found\n');
}

export function startLoopbackServer(mounts) {
  const server = createServer((request, response) => {
    const requestPath = decodedRequestPath(request.url);
    const isRead = request.method === 'GET' || request.method === 'HEAD';
    const file = isRead && requestPath !== undefined ? mountedFile(mounts, requestPath) : undefined;
    const contentType = file === undefined ? undefined : CONTENT_TYPES.get(extname(file).toLowerCase());
    if (contentType === undefined) {
      answerNotFound(response);
      return;
    }
    response.writeHead(200, { 'content-type': contentType });
    if (request.method === 'HEAD') {
      response.end();
      return;
    }
    createReadStream(file).pipe(response);
  });
  return new Promise((resolveServer, rejectServer) => {
    server.once('error', rejectServer);
    server.listen(0, LOOPBACK_HOST, () => {
      resolveServer({
        origin: `http://${LOOPBACK_HOST}:${server.address().port}`,
        close: () =>
          new Promise((resolveClose) => {
            server.closeAllConnections();
            server.close(() => resolveClose());
          }),
      });
    });
  });
}
