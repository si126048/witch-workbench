import { defineConfig } from 'vitest/config';
export default defineConfig({ test: {
  environment: 'node', include: ['src/lib/teamGit.test.ts','src/lib/sceneDocument.test.ts','src/lib/teamLfs.test.ts'],
  maxWorkers: 2, testTimeout: 30000,
} });
