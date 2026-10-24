import './setup';
import { expect, test } from 'bun:test';
import net from 'node:net';
import { isNetworkGuard } from './fixtures/network-policy';

test('network guard rejects non-loopback fetch and Node socket access before connecting', () => {
  expect(isNetworkGuard(fetch)).toBe(true);
  expect(isNetworkGuard(net.Socket.prototype.connect)).toBe(true);
  expect(() => fetch('https://example.invalid/')).toThrow('non-loopback');
  expect(() => fetch('https://www.designernews.co/api/v2/stories')).toThrow(
    'non-loopback'
  );
  expect(() => fetch('https://dribbble-top.dsgnr.news/unmatched')).toThrow(
    'non-loopback'
  );
  expect(() =>
    fetch('https://dribbble-top.dsgnr.news/top', {
      proxy: 'http://example.invalid',
    })
  ).toThrow('Offline');
  expect(() =>
    fetch('http://127.0.0.1/', { proxy: 'http://example.invalid' })
  ).toThrow('Offline');
  expect(() =>
    fetch('http://127.0.0.1/', { unix: '/never-open.sock' })
  ).toThrow('Offline');
  const socket = new net.Socket();
  try {
    expect(() =>
      socket.connect({ host: 'example.invalid', port: 443 })
    ).toThrow('non-loopback');
  } finally {
    socket.destroy();
  }
});

test('Bun sockets and preconnect are also denied', () => {
  expect(isNetworkGuard(Bun.connect)).toBe(true);
  expect(isNetworkGuard(fetch.preconnect)).toBe(true);
  expect(() =>
    Bun.connect({
      hostname: 'example.invalid',
      port: 443,
      socket: { data() {} },
    })
  ).toThrow('non-loopback');
  expect(() => fetch.preconnect('https://example.invalid')).toThrow(
    'preconnect'
  );
});

test('loopback redirects cannot escape, even when callers request follow', async () => {
  const server = Bun.serve({
    hostname: '127.0.0.1',
    port: 0,
    fetch: () =>
      new Response(null, {
        status: 302,
        headers: { Location: 'https://example.invalid/never-connect' },
      }),
  });
  try {
    const response = await fetch(`http://127.0.0.1:${server.port}`, {
      redirect: 'follow',
    });
    expect(response.status).toBe(302);
    expect(response.headers.get('Location')).toBe(
      'https://example.invalid/never-connect'
    );
  } finally {
    await server.stop(true);
  }
});

test('alternate transports fail before I/O', async () => {
  const tls = await import('node:tls');
  const dgram = await import('node:dgram');
  const dns = await import('node:dns');
  const http2 = await import('node:http2');
  for (const fn of [
    tls.connect,
    dgram.createSocket,
    dns.lookup,
    dns.promises.resolve,
    http2.connect,
    Bun.udpSocket,
    Bun.dns.lookup,
    WebSocket,
    EventSource,
  ])
    expect(isNetworkGuard(fn)).toBe(true);
  expect(() => tls.connect({ host: 'example.invalid', port: 443 })).toThrow(
    'Offline'
  );
  expect(() => dgram.createSocket('udp4')).toThrow('Offline');
  expect(() => dns.lookup('example.invalid', () => {})).toThrow('Offline');
  expect(() => dns.promises.resolve('example.invalid')).toThrow('Offline');
  expect(() => http2.connect('https://example.invalid')).toThrow('Offline');
  expect(() => Bun.udpSocket({ socket: { data() {} } })).toThrow('Offline');
  expect(() => Bun.dns.lookup('example.invalid')).toThrow('Offline');
  expect(() => new WebSocket('wss://example.invalid')).toThrow('Offline');
  expect(() => new EventSource()).toThrow('Offline');
});
