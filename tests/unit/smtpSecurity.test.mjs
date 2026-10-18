import test from 'node:test';
import assert from 'node:assert/strict';
import net from 'node:net';
import { once } from 'node:events';
import { readFile } from 'node:fs/promises';
import nodemailer from 'nodemailer';

test('SMTP refuses to authenticate when a submission server cannot provide TLS', async () => {
  const commands = [];
  const sockets = new Set();
  const server = net.createServer(socket => {
    sockets.add(socket);
    socket.on('close', () => sockets.delete(socket));
    socket.on('error', () => {});
    socket.write('220 localhost ESMTP synthetic-test\r\n');
    let pending = '';
    socket.on('data', chunk => {
      pending += chunk.toString('utf8');
      while (pending.includes('\r\n')) {
        const end = pending.indexOf('\r\n');
        const command = pending.slice(0, end).split(' ')[0];
        pending = pending.slice(end + 2);
        commands.push(command); // Never retain authentication arguments.
        if (command === 'EHLO') socket.write('250-localhost\r\n250 AUTH PLAIN LOGIN\r\n');
        else if (command === 'STARTTLS') socket.write('502 TLS unavailable\r\n');
        else if (command === 'AUTH') socket.write('535 authentication disabled\r\n');
        else socket.end('221 goodbye\r\n');
      }
    });
  });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  try {
    const source = (await readFile(new URL('../../utils/server/zohoMailer.js', import.meta.url), 'utf8'))
      .replace(/^import[\s\S]*?from ['"][^'"]+['"];?\r?\n/gm, '').replace(/^export /gm, '');
    const getTransporter = new Function('nodemailer', 'getZohoSmtpHost', 'getZohoSmtpPort', 'getZohoSmtpUser', 'getZohoSmtpPass', `${source}; return getTransporter;`)(
      nodemailer, () => '127.0.0.1', () => server.address().port, () => 'synthetic-user', () => 'synthetic-password',
    );
    await assert.rejects(getTransporter().verify(), error => error.code === 'ETLS');
    assert.ok(commands.includes('STARTTLS'));
    assert.equal(commands.includes('AUTH'), false, 'credentials must never be sent before TLS');
  } finally {
    for (const socket of sockets) socket.destroy();
    await new Promise(resolve => server.close(resolve));
  }
});
