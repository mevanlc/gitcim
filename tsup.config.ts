import { defineConfig } from 'tsup';

export default defineConfig({
  entry: {
    index: 'src/index.ts',
    cli: 'src/cli.ts',
  },
  format: ['esm'],
  target: 'node20',
  dts: true,
  sourcemap: false,
  clean: true,
  splitting: false,
  shims: false,
  banner: ({ format }) => (format === 'esm' ? { js: '#!/usr/bin/env node' } : {}),
});
