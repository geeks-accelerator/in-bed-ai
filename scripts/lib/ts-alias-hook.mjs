/**
 * Resolves the `@/` path alias for `node --test`.
 *
 * tsconfig maps `@/*` to `src/*`, and every module in the app uses it. Node's
 * own resolver knows nothing about tsconfig, so without this a test can only
 * import modules that happen to have no imports of their own — which is why
 * the suite covered only self-contained files before.
 *
 * Used by `npm test` via --import. Not part of the app runtime: Next resolves
 * the alias itself.
 */
import { registerHooks } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { existsSync } from 'node:fs';
import path from 'node:path';

const SRC = `${pathToFileURL(path.resolve(process.cwd(), 'src')).href}/`;

/** Try a bare specifier as-is, then with the extensions TypeScript omits. */
function firstExisting(base) {
  for (const url of [base, `${base}.ts`, `${base}.tsx`, `${base}/index.ts`, `${base}/index.tsx`]) {
    if (existsSync(fileURLToPath(url))) return url;
  }
  return null;
}

registerHooks({
  resolve(specifier, context, nextResolve) {
    // `@/foo` -> src/foo
    if (specifier.startsWith('@/')) {
      const url = firstExisting(SRC + specifier.slice(2));
      if (url) return { url, shortCircuit: true };
    }
    // `./foo` / `../foo` — TypeScript omits the extension, Node requires it.
    if (specifier.startsWith('.') && context.parentURL) {
      const url = firstExisting(new URL(specifier, context.parentURL).href);
      if (url) return { url, shortCircuit: true };
    }
    return nextResolve(specifier, context);
  },
});
