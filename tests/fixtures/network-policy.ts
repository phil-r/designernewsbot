import { mock } from 'bun:test';
import net from 'node:net';
import tls from 'node:tls';
import dgram from 'node:dgram';
import dns from 'node:dns';
import http2 from 'node:http2';

const guarded = new WeakSet<Function>();
export const isNetworkGuard = (value: Function) => guarded.has(value);

// Application-test defense in depth, not an OS sandbox. Only numeric loopback
// TCP/fetch is needed; every other exposed transport is denied before I/O.
export function installNetworkPolicy(allowLoopback = false) {
  const deny = () => {
    throw new Error('Offline tests prohibit non-loopback network / transport');
  };
  const allowed = (host: unknown) =>
    allowLoopback && ['127.0.0.1', '[::1]', '::1'].includes(host as string);
  // Do not let host proxy configuration redirect an otherwise permitted URL.
  for (const name of [
    'HTTP_PROXY',
    'HTTPS_PROXY',
    'ALL_PROXY',
    'http_proxy',
    'https_proxy',
    'all_proxy',
  ])
    delete process.env[name];
  const originalFetch = globalThis.fetch;
  globalThis.fetch = Object.assign(
    (
      input: Parameters<typeof fetch>[0],
      init?: Parameters<typeof fetch>[1]
    ) => {
      if (init && ('proxy' in init || 'unix' in init)) return deny();
      const url = new URL(
        typeof input === 'string' || input instanceof URL ? input : input.url
      );
      if (!allowed(url.hostname) || !['http:', 'https:'].includes(url.protocol))
        return deny();
      // Never allow a permitted loopback response to escape via redirects.
      return originalFetch(input, { ...init, redirect: 'manual' });
    },
    {
      preconnect: () => {
        throw new Error('Offline tests prohibit preconnect');
      },
    }
  );
  const connect = net.Socket.prototype.connect;
  net.Socket.prototype.connect = function (this: net.Socket, ...args: any[]) {
    const normalized = Array.isArray(args[0]) ? args[0] : args;
    const options = normalized[0];
    const host =
      typeof options === 'object'
        ? (options.host ?? options.hostname)
        : normalized[1];
    if (!allowed(host) || (typeof options === 'object' && options.path))
      return deny();
    return connect.apply(this, args as any);
  } as typeof connect;
  const bunConnect = Bun.connect;
  Bun.connect = ((options: Parameters<typeof Bun.connect>[0]) => {
    if (
      (options as { unix?: unknown }).unix !== undefined ||
      !('hostname' in options) ||
      !allowed(options.hostname)
    )
      return deny();
    return bunConnect(options);
  }) as typeof Bun.connect;
  tls.connect = deny as typeof tls.connect;
  dgram.createSocket = deny as typeof dgram.createSocket;
  dgram.Socket = deny as unknown as typeof dgram.Socket;
  dns.Resolver = deny as unknown as typeof dns.Resolver;
  dns.promises.Resolver = deny as unknown as typeof dns.promises.Resolver;
  http2.connect = deny as typeof http2.connect;
  for (const target of [dns, dns.promises]) {
    for (const key of Object.keys(target)) {
      if (key === 'lookup' || key.startsWith('resolve') || key === 'reverse')
        (target as any)[key] = deny;
    }
  }
  for (const [name, module] of Object.entries({ tls, dgram, dns, http2 }))
    mock.module('node:' + name, () => ({ ...module, default: module }));
  mock.module('node:dns/promises', () => ({
    ...dns.promises,
    default: dns.promises,
  }));
  Bun.udpSocket = deny as typeof Bun.udpSocket;
  Bun.dns.lookup = deny as typeof Bun.dns.lookup;
  globalThis.WebSocket = class {
    constructor() {
      deny();
    }
  } as unknown as typeof WebSocket;
  globalThis.EventSource = class {
    constructor() {
      deny();
    }
  } as unknown as typeof EventSource;
  for (const fn of [
    deny,
    globalThis.fetch,
    fetch.preconnect,
    net.Socket.prototype.connect,
    Bun.connect,
    WebSocket,
    EventSource,
  ])
    guarded.add(fn);
}
