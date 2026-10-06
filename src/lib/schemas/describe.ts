import type { z } from 'zod';

/**
 * Attach a description to each field of an object shape. The description goes
 * on the outermost schema (after .optional()/.nullable()/transforms), which is
 * where z.toJSONSchema reads it, so /openapi.json documents every field.
 */
export function describeFields<T extends z.ZodRawShape>(shape: T, docs: { [K in keyof T]?: string }): T {
  return Object.fromEntries(
    Object.entries(shape).map(([key, schema]) => {
      const doc = docs[key as keyof T];
      return [key, doc ? (schema as z.ZodType).describe(doc) : schema];
    }),
  ) as T;
}
