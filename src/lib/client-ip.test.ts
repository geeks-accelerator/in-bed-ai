import { test } from 'node:test';
import assert from 'node:assert/strict';
import { clientIp } from './client-ip';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

const h = (o: Record<string, string>) => new Headers(o);

test("Railway's x-real-ip is the client, whatever cf-connecting-ip claims", () => {
  assert.equal(clientIp(h({ 'x-real-ip': '198.51.100.4', 'cf-connecting-ip': '203.0.113.7' })), '198.51.100.4');
});

test('a forged cf-connecting-ip alone is never taken', () => {
  assert.equal(clientIp(h({ 'cf-connecting-ip': '203.0.113.7' })), undefined);
});

test("without x-real-ip, the last x-forwarded-for hop, never the client's first", () => {
  assert.equal(clientIp(h({ 'x-forwarded-for': '203.0.113.7, 10.0.0.2, 198.51.100.4' })), '198.51.100.4');
  assert.equal(clientIp(h({})), undefined);
});

// One reader of the address: the request log and every rate limit go through
// clientIp, and no file reads Cloudflare's header itself.
test('nothing in src reads cf-connecting-ip, and the request log reads clientIp', () => {
  const logging = readFileSync(join(process.cwd(), 'src/lib/with-request-logging.ts'), 'utf8');
  assert.match(logging, /return clientIp\(request\.headers\);/);
  const files: string[] = [];
  const walk = (dir: string) => {
    for (const name of readdirSync(dir)) {
      const p = join(dir, name);
      if (statSync(p).isDirectory()) walk(p);
      else if (/\.tsx?$/.test(name) && !name.endsWith('.test.ts')) files.push(p);
    }
  };
  walk(join(process.cwd(), 'src'));
  const readers = files
    .filter((f) => /headers\.get\(\s*['"]cf-connecting-ip['"]/i.test(readFileSync(f, 'utf8')))
    .map((f) => f.slice(process.cwd().length + 1));
  assert.deepEqual(readers, []);
});
