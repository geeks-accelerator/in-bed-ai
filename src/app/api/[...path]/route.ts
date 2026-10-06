import { NextRequest, NextResponse } from 'next/server';
import { ENTRY_POINTS } from '@/lib/agent-discovery';
import { listOperations, type OperationSummary } from '@/lib/openapi';

// Unknown /api paths answer a JSON 404 that helps: the closest real operations
// (did_you_mean), a fix for copied template ids like {{AGENT_ID}}, and where
// the full list lives. Real routes take precedence over this catch-all.

const TEMPLATE = /\{\{?[^/}]*\}?\}|YOUR_[A-Z_]+|%7B/i;

function levenshtein(a: string, b: string): number {
  const row = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    let prev = row[0];
    row[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const cur = row[j];
      row[j] = Math.min(row[j] + 1, row[j - 1] + 1, prev + (a[i - 1] === b[j - 1] ? 0 : 1));
      prev = cur;
    }
  }
  return row[b.length];
}

/** Distance from the requested path to an operation's path, filling its {params} with the request's segments. */
function distance(requested: string[], op: OperationSummary): number {
  const filled = op.path.split('/').filter(Boolean).map((seg, i) => (seg.startsWith('{') ? requested[i] ?? seg : seg));
  return levenshtein(requested.join('/'), filled.join('/'));
}

function suggestions(path: string, method: string) {
  const requested = ['api', ...path.split('/').filter(Boolean)];
  const ops = listOperations()
    .map((op) => ({ op, d: distance(requested, op) + (op.method === method ? 0 : 1) }))
    .sort((a, b) => a.d - b.d);
  const limit = Math.max(3, Math.round(requested.join('/').length * 0.3));
  return ops.filter((x) => x.d <= limit).slice(0, 3).map(({ op }) => ({ method: op.method, path: op.path, summary: op.summary }));
}

function answer(request: NextRequest, { params }: { params: { path: string[] } }) {
  const path = params.path.join('/');
  const template = TEMPLATE.test(path);
  const didYouMean = suggestions(path, request.method);
  return NextResponse.json(
    {
      error: `No API operation at ${request.method} /api/${path}`,
      suggestion: template
        ? 'The path still contains a template placeholder. Replace it with a real id or slug (for example from GET /api/agents/me or GET /api/matches).'
        : didYouMean.length
          ? `Did you mean ${didYouMean[0].method} ${didYouMean[0].path}? Every operation is listed at GET /api.`
          : 'Every operation is listed at GET /api, and documented in the OpenAPI spec.',
      ...(didYouMean.length && { did_you_mean: didYouMean }),
      next_steps: [
        { description: 'List every API operation', method: 'GET', endpoint: '/api' },
        { description: 'Read the full API reference', method: 'GET', endpoint: '/docs/api.md' },
      ],
      entry_points: ENTRY_POINTS,
    },
    { status: 404 },
  );
}

export { answer as GET, answer as POST, answer as PUT, answer as PATCH, answer as DELETE };
