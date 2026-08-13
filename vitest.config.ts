import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['tests/**/*.test.ts'],
    environment: 'node',
    coverage: {
      reporter: ['text', 'html'],
      include: ['src/**/*.ts'],
      thresholds: {
        // Tight gates on the parts that decide what the message says —
        // a wrong message is the project's worst failure mode.
        'src/render.ts': { lines: 90, functions: 90, branches: 85 },
        'src/actions.ts': { lines: 90, functions: 90, branches: 85 },
        // Loose floor on everything else.
        lines: 70,
        functions: 70,
      },
    },
  },
});
