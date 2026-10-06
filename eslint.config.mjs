import coreWebVitals from 'eslint-config-next/core-web-vitals';
import typescript from 'eslint-config-next/typescript';

// Flat config (ESLint 9). Same presets as the old .eslintrc.json.
export default [
  ...coreWebVitals,
  ...typescript,
  { ignores: ['.next/**', 'node_modules/**', 'private/**', 'mcp-server/**', 'plugins/**', 'public/**'] },
];
