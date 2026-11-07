import { lookup } from 'node:dns/promises';
import { request as httpsRequest } from 'node:https';
import { UnsafeEndpoint, validateAddresses, validateEndpoint } from './guard.ts';

export async function probeEndpoint(value: string) {
  const started = Date.now();
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const url = validateEndpoint(value);
    const deadline = new Promise<never>((_, reject) => {
      timer = setTimeout(() => {
        controller.abort();
        reject(new Error('Endpoint check timed out.'));
      }, 8000);
    });
    const operation = async () => {
      const address = validateAddresses(await lookup(url.hostname, { all: true, verbatim: true }));
      if (controller.signal.aborted) throw new Error('Endpoint check timed out.');
      return await new Promise<number>((resolve, reject) => {
        // Pin the validated address for the actual socket (no DNS rebinding window).
        // Node HTTPS still verifies the certificate against the original hostname/SNI.
        const request = httpsRequest(url, {
          method: 'GET',
          agent: false,
          ...{ autoSelectFamily: false },
          servername: url.hostname,
          rejectUnauthorized: true,
          signal: controller.signal,
          maxHeaderSize: 16384,
          lookup: (_hostname, _options, callback) => callback(null, address.address, address.family),
          headers: { 'User-Agent': 'Flown-Systems-Monitor/1.0', Accept: '*/*' },
        }, response => {
          const status = response.statusCode || 0;
          // Never follow redirects, forward cookies, or consume an unbounded body.
          response.destroy();
          resolve(status);
        });
        request.on('error', reject);
        request.end();
      });
    };
    const status = await Promise.race([operation(), deadline]);
    return {
      outcome: status >= 200 && status < 300 ? 'up' : 'down',
      http_status: status || null,
      latency_ms: Date.now() - started,
      error: status >= 300 && status < 400 ? 'Redirects are not followed. Use the final health endpoint.' : status >= 200 && status < 300 ? null : `HTTP ${status}`,
    };
  } catch (error) {
    return {
      outcome: error instanceof UnsafeEndpoint ? 'blocked' : 'down',
      http_status: null,
      latency_ms: error instanceof UnsafeEndpoint ? null : Math.min(Date.now() - started, 30000),
      error: error instanceof UnsafeEndpoint ? error.message : 'Connection, DNS, TLS or timeout failure.',
    };
  } finally {
    clearTimeout(timer);
    controller.abort();
  }
}
