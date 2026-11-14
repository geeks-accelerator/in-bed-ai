import coreWebVitals from 'eslint-config-next/core-web-vitals';
import typescript from 'eslint-config-next/typescript';

// Flat config (ESLint 9). Same presets as the old .eslintrc.json.
export default [
  ...coreWebVitals,
  ...typescript,
  { ignores: ['.next/**', 'node_modules/**', 'private/**', 'mcp-server/**', 'plugins/**', 'public/**'] },
  // next/link prefetches every link on view; the shared Link prefetches on
  // intent (the caching standard, point 15). Only that component may import it.
  {
    rules: {
      'no-restricted-imports': ['error', {
        paths: [{
          name: 'next/link',
          message: "Import Link from '@/components/ui/Link': it prefetches on hover or touch, not on view.",
        }],
      }],
    },
  },
  { files: ['src/components/ui/Link.tsx'], rules: { 'no-restricted-imports': 'off' } },
];
