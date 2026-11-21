import http from 'node:http';
import https from 'node:https';

/**
 * Shared HTTPS agent using classical X25519:P-256 ECDH curves to avoid
 * fragmented post-quantum TLS 1.3 ClientHello ECONNRESET issues on Node 26+
 * against third-party book API edges (e.g., Open Library / Archive.org).
 */
const compatHttpsAgent = new https.Agent({
  keepAlive: true,
  maxSockets: 24,
  ecdhCurve: 'X25519:P-256',
});

export interface CompatResponse {
  ok: boolean;
  status: number;
  url: string;
  headers: Headers;
  json: () => Promise<unknown>;
  arrayBuffer: () => Promise<ArrayBuffer>;
}

const MAX_REDIRECTS = 5;

export async function compatFetch(
  input: string | URL,
  init: {
    headers?: Record<string, string>;
    signal?: AbortSignal;
    redirect?: 'follow' | 'manual';
  } = {}
): Promise<CompatResponse> {
  let currentUrl = new URL(String(input));

  for (let redirects = 0; redirects <= MAX_REDIRECTS; redirects++) {
    const res = await singleRequest(currentUrl, init.headers ?? {}, init.signal);

    if (
      (init.redirect ?? 'follow') === 'follow' &&
      res.status >= 300 &&
      res.status < 400
    ) {
      const location = res.headers.get('location');
      if (location) {
        currentUrl = new URL(location, currentUrl);
        continue;
      }
    }

    return res;
  }

  throw new Error('Too many redirects');
}

function singleRequest(
  url: URL,
  reqHeaders: Record<string, string>,
  signal?: AbortSignal
): Promise<CompatResponse> {
  return new Promise((resolve, reject) => {
    const isHttps = url.protocol === 'https:';
    const lib = isHttps ? https : http;

    const req = lib.request(
      url,
      {
        method: 'GET',
        headers: reqHeaders,
        ...(isHttps ? { agent: compatHttpsAgent } : {}),
      },
      (res) => {
        const chunks: Buffer[] = [];
        res.on('data', (chunk: Buffer) => chunks.push(chunk));
        res.on('error', reject);
        res.on('end', () => {
          const buf = Buffer.concat(chunks);
          const headers = new Headers();
          for (const [k, v] of Object.entries(res.headers)) {
            if (Array.isArray(v)) {
              for (const val of v) headers.append(k, val);
            } else if (v !== undefined) {
              headers.set(k, v);
            }
          }
          const status = res.statusCode ?? 500;
          resolve({
            ok: status >= 200 && status < 300,
            status,
            url: url.toString(),
            headers,
            json: async () => JSON.parse(buf.toString('utf8')),
            arrayBuffer: async () =>
              buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength),
          });
        });
      }
    );

    const onAbort = () => {
      req.destroy(new Error('Request aborted'));
    };

    if (signal) {
      if (signal.aborted) {
        onAbort();
        return;
      }
      signal.addEventListener('abort', onAbort, { once: true });
      req.on('close', () => signal.removeEventListener('abort', onAbort));
    }

    req.on('error', reject);
    req.end();
  });
}
