import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';

const sharedSrc = fileURLToPath(new URL('./shared/src/index.ts', import.meta.url));

export default defineConfig({
  resolve: { alias: { '@frog/shared': sharedSrc } },
  test: {
    projects: [
      { extends: true, test: { name: 'shared', include: ['shared/test/**/*.test.ts'], environment: 'node' } },
      { extends: true, test: { name: 'server', include: ['server/test/**/*.test.ts'], environment: 'node' } },
      { extends: true, test: { name: 'client', include: ['client/test/**/*.test.ts'], environment: 'node' } },
    ],
  },
});
