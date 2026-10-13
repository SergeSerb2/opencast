import http from 'node:http';
import { createHash, randomBytes } from 'node:crypto';
import readline from 'node:readline';
const token = randomBytes(24).toString('hex');
const send = (value) => process.stdout.write(JSON.stringify({ jsonrpc: '2.0', ...value }) + '\n');
const log = (...args) => console.error('[surgecast-dev-stub]', ...args);
const pending = new Map();
let next = 0;
function native(method, params = {}) {
  const id = ++next;
  return new Promise((resolve) => { pending.set(id, { method, resolve }); send({ id, method, params }); });
}
function frame(value) {
  const body = Buffer.from(JSON.stringify(value));
  if (body.length < 126) return Buffer.concat([Buffer.from([0x81, body.length]), body]);
  const header = Buffer.alloc(4); header[0] = 0x81; header[1] = 126; header.writeUInt16BE(body.length, 2);
  return Buffer.concat([header, body]);
}
const server = http.createServer((_, res) => { res.writeHead(200); res.end('Surgecast dev stub'); });
server.on('upgrade', (req, socket) => {
  const url = new URL(req.url, 'http://127.0.0.1');
  if (url.searchParams.get('token') !== token || !req.headers['sec-websocket-key']) { socket.destroy(); return; }
  const accept = createHash('sha1').update(req.headers['sec-websocket-key'] + '258EAFA5-E914-47DA-95CA-C5AB0DC85B11').digest('base64');
  socket.write('HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Accept: ' + accept + '\r\n\r\n');
  socket.on('error', () => {});
  let buffer = Buffer.alloc(0);
  socket.on('data', (chunk) => {
    buffer = Buffer.concat([buffer, chunk]);
    if (buffer.length > 1_048_576) { socket.destroy(); return; }
    while (buffer.length >= 2) {
      const opcode = buffer[0] & 15; const masked = !!(buffer[1] & 128);
      let length = buffer[1] & 127, offset = 2;
      if (length === 127 || !masked) { socket.destroy(); return; }
      if (length === 126) { if (buffer.length < 4) return; length = buffer.readUInt16BE(2); offset = 4; }
      if (buffer.length < offset + 4 + length) return;
      const mask = buffer.subarray(offset, offset + 4); offset += 4;
      const body = Buffer.from(buffer.subarray(offset, offset + length)); buffer = buffer.subarray(offset + length);
      for (let i = 0; i < body.length; i++) body[i] ^= mask[i % 4];
      if (opcode === 8) { socket.end(Buffer.from([0x88, 0])); return; }
      if (opcode === 9 && body.length < 126) { socket.write(Buffer.concat([Buffer.from([0x8a, body.length]), body])); continue; }
      if (opcode !== 1) continue;
      try {
        const request = JSON.parse(body);
        if (request.method === 'dev.report') log('WEB_BRIDGE', JSON.stringify(request.params));
        if (request.id != null) socket.write(frame({ jsonrpc: '2.0', id: request.id, result: request.method === 'backend.ping' ? { ok: true } : null }));
      } catch (error) { log('Invalid WS frame:', error.message); }
    }
  });
});
readline.createInterface({ input: process.stdin }).on('line', (line) => {
  try {
    const message = JSON.parse(line);
    if (message.method) {
      if (message.id != null) { log('NATIVE_REQUEST', message.method); send({ id: message.id, result: message.method === 'backend.ping' ? { ok: true } : null }); }
      else log('EVENT', message.method, message.method.startsWith('window.') ? JSON.stringify(message.params) : '');
    } else {
      const request = pending.get(message.id); if (!request) return;
      pending.delete(message.id);
      log('RESULT', request.method, JSON.stringify(message.result ?? message.error));
      request.resolve(message);
    }
  } catch (error) { log('Invalid stdio JSON:', error.message); }
}).on('close', () => { server.close(); process.exit(0); });
server.listen(0, '127.0.0.1', async () => {
  send({ method: 'backend.ready', params: { port: server.address().port, token, version: 'dev-stub' } });
  for (const method of ['app.info', 'apps.list', 'permissions.status', 'windows.screens', 'not.a.method']) await native(method);
  await native('hotkeys.register', { id: 'surgecast.toggle', hotkey: { key: 'space', modifiers: ['opt'] } });
  await native('app.setMenuBarIconVisible'); // invalid params must not mutate the status item
  log('STARTUP_CHECKS_COMPLETE');
});
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => { server.close(); process.exit(0); });
