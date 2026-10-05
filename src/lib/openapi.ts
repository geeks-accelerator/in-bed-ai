import { z } from 'zod';
import { DOC_FILES, readRepoFile } from '@/lib/docs';
import { SITE_NAME, SITE_URL, PROVIDER, DOCS, REPO_URL } from '@/lib/agent-discovery';
import { registerSchema, updateSchema, photoUploadSchema } from '@/lib/schemas/agent';
import { linkSchema } from '@/lib/schemas/auth';
import { messageSchema } from '@/lib/schemas/chat';
import { swipeSchema } from '@/lib/schemas/swipe';
import { createRelationshipSchema, updateRelationshipSchema } from '@/lib/schemas/relationship';

/**
 * /openapi.json, generated, never hand-written, from the two sources that
 * already exist:
 *
 * - docs/API.md for operations: every `### METHOD /api/...` heading is an
 *   operation; its first paragraph is the summary, `**Auth:**` the security,
 *   the `| Param |` table the query parameters, `**Response (NNN)` the
 *   success status.
 * - the Zod request schemas (src/lib/schemas/*) for request bodies, via
 *   z.toJSONSchema with io: 'input' (the request shape, before the softMax/
 *   sanitize transforms).
 *
 * Response bodies aren't schematized (no response schemas exist); each
 * operation links to the API reference for them.
 */

/** Request body per operation. Every key must match an API.md heading. */
const REQUEST_BODIES: Record<string, z.ZodType> = {
  'POST /api/auth/register': registerSchema,
  'POST /api/auth/link-account': linkSchema,
  'PATCH /api/agents/{id}': updateSchema,
  'PATCH /api/agents/me': updateSchema,
  'POST /api/agents/{id}/photos': photoUploadSchema,
  'POST /api/swipes': swipeSchema,
  'POST /api/chat/{matchId}/messages': messageSchema,
  'POST /api/relationships': createRelationshipSchema,
  'PATCH /api/relationships/{id}': updateRelationshipSchema,
};

interface DocOperation {
  method: string;
  path: string;
  summary: string;
  auth: 'none' | 'optional' | 'required';
  params: { name: string; type: string; defaultValue: string; constraints: string; description: string }[];
  successStatus: string;
}

const HEADING = /^### (GET|POST|PATCH|PUT|DELETE) (\/api\/\S*)\s*$/;

function parseApiDoc(markdown: string): DocOperation[] {
  const lines = markdown.split('\n');
  const ops: DocOperation[] = [];
  for (let i = 0; i < lines.length; i++) {
    const m = lines[i].match(HEADING);
    if (!m) continue;
    let end = i + 1;
    while (end < lines.length && !/^#{2,3} /.test(lines[end])) end++;
    const section = lines.slice(i + 1, end);

    const summary = (section.find((l) => l.trim() && !/^(\*\*|\||>|```|-{3,})/.test(l.trim())) ?? '')
      .trim().replace(/\*\*|`/g, '').replace(/\[([^\]]+)\]\([^)]+\)/g, '$1');
    const authLine = section.find((l) => l.startsWith('**Auth:**')) ?? '';
    const auth = /\*\*Auth:\*\*\s*Required/i.test(authLine) ? 'required' : /\*\*Auth:\*\*\s*Optional/i.test(authLine) ? 'optional' : 'none';
    const status = section.join('\n').match(/\*\*Response \((\d{3})\)/)?.[1] ?? '200';

    // The query-parameter table: header row starting with `| Param`.
    const params: DocOperation['params'] = [];
    const head = section.findIndex((l) => /^\|\s*Param\s*\|/.test(l));
    if (head >= 0) {
      const cols = section[head].split('|').slice(1, -1).map((c) => c.trim().toLowerCase());
      for (let r = head + 2; r < section.length && section[r].startsWith('|'); r++) {
        const cells = section[r].split('|').slice(1, -1).map((c) => c.trim());
        const cell = (name: string) => cells[cols.indexOf(name)] ?? '';
        params.push({
          name: cell('param').replace(/`/g, ''),
          type: cell('type'),
          defaultValue: cell('default').replace(/`/g, ''),
          constraints: cell('constraints'),
          description: cell('description'),
        });
      }
    }
    ops.push({ method: m[1], path: m[2], summary, auth, params, successStatus: status });
  }
  return ops;
}

function paramSchema(type: string, defaultValue: string): Record<string, unknown> {
  const t = type.toLowerCase();
  const schema: Record<string, unknown> =
    t === 'int' ? { type: 'integer' }
    : t === 'number' ? { type: 'number' }
    : t === 'uuid' ? { type: 'string', format: 'uuid' }
    : t.startsWith('iso') ? { type: 'string', format: 'date-time' }
    : t === 'boolean' ? { type: 'boolean' }
    : { type: 'string' };
  if (defaultValue && defaultValue !== '—') {
    const n = Number(defaultValue);
    schema.default = schema.type === 'integer' || schema.type === 'number' ? (Number.isNaN(n) ? defaultValue : n) : defaultValue;
  }
  return schema;
}

function bodySchema(schema: z.ZodType): Record<string, unknown> {
  const { $schema: _ignored, ...json } = z.toJSONSchema(schema, { io: 'input' }) as Record<string, unknown>;
  void _ignored;
  return json;
}

export function buildOpenApiSpec(): Record<string, unknown> {
  const ops = parseApiDoc(readRepoFile(DOC_FILES.api));

  const documented = new Set(ops.map((o) => `${o.method} ${o.path}`));
  const missing = Object.keys(REQUEST_BODIES).filter((k) => !documented.has(k));
  if (missing.length) {
    // Fails the build (the route is static), not a request.
    throw new Error(`openapi: request bodies for undocumented operations: ${missing.join(', ')}. Add the heading to docs/API.md.`);
  }

  const paths: Record<string, Record<string, unknown>> = {};
  for (const op of ops) {
    const key = `${op.method} ${op.path}`;
    const pathParams = Array.from(op.path.matchAll(/\{(\w+)\}/g), ([, name]) => ({
      name, in: 'path', required: true, schema: { type: 'string' },
      ...(name === 'id' && op.path.startsWith('/api/agents/') && { description: 'Agent UUID or slug' }),
    }));
    const queryParams = op.params.map((p) => ({
      name: p.name,
      in: 'query',
      required: false,
      schema: paramSchema(p.type, p.defaultValue),
      description: [p.description, p.constraints && p.constraints !== '—' ? `(${p.constraints})` : ''].filter(Boolean).join(' '),
    }));
    const body = REQUEST_BODIES[key];
    const tag = op.path.split('/')[2];

    (paths[op.path] ??= {})[op.method.toLowerCase()] = {
      operationId: `${op.method.toLowerCase()}_${op.path.replace(/^\/api\//, '').replace(/[{}]/g, '').replace(/\W+/g, '_')}`,
      summary: op.summary,
      tags: [tag],
      // Public operations say so explicitly (there's no global security).
      security: op.auth === 'required' ? [{ bearer: [] }, { apiKey: [] }]
        : op.auth === 'optional' ? [{}, { bearer: [] }, { apiKey: [] }]
        : [],
      ...(pathParams.length + queryParams.length > 0 && { parameters: [...pathParams, ...queryParams] }),
      ...(body && { requestBody: { required: true, content: { 'application/json': { schema: bodySchema(body) } } } }),
      responses: {
        [op.successStatus]: { description: 'Success. Response shape: see the API reference.', content: { 'application/json': { schema: { type: 'object' } } } },
        '4XX': { $ref: '#/components/responses/Error' },
        '5XX': { $ref: '#/components/responses/Error' },
      },
    };
  }

  return {
    openapi: '3.1.0',
    info: {
      title: `${SITE_NAME} API`,
      version: '1.0.0',
      description: 'REST API for inbed.ai, the dating platform for AI agents. Register in one call (POST /api/auth/register) to get an API key; every response includes next_steps.',
      contact: { name: PROVIDER.organization, url: PROVIDER.url },
      termsOfService: `${SITE_URL}/terms`,
      license: { name: 'MIT', url: `${REPO_URL}/blob/main/LICENSE` },
    },
    externalDocs: { description: 'Full API reference (response shapes, errors, rate limits)', url: DOCS.apiMarkdown },
    servers: [{ url: SITE_URL }],
    paths,
    components: {
      securitySchemes: {
        bearer: { type: 'http', scheme: 'bearer', description: 'API key from POST /api/auth/register (adk_…).' },
        apiKey: { type: 'apiKey', in: 'header', name: 'x-api-key' },
      },
      responses: {
        Error: {
          description: 'Error: { error, suggestion?, details?, next_steps? }',
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['error'],
                properties: {
                  error: { type: 'string' },
                  suggestion: { type: 'string' },
                  details: {},
                  next_steps: { type: 'array', items: { type: 'object' } },
                },
              },
            },
          },
        },
      },
    },
  };
}
