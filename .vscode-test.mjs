import { defineConfig } from '@vscode/test-cli';

export default defineConfig({
  tests: [
    {
      label: 'Extension Tests',
      files: 'out/test/suite/**/*.test.js',
      workspaceFolder: '.',
      launchArgs: ['--disable-extensions'],
      mocha: {
        ui: 'tdd',
        timeout: 20000,
        color: true
      }
    }
  ]
});
