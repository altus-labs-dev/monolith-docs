#!/usr/bin/env node

import { spawnSync } from 'node:child_process';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(scriptDir, '..');
const localBinDir = path.join(repoRoot, 'scripts', 'bin');
const nodeBinDir = path.join(repoRoot, 'node_modules', '.bin');
const pathSeparator = process.platform === 'win32' ? ';' : ':';
const turboEntrypoint = path.join(repoRoot, 'node_modules', 'turbo', 'bin', 'turbo');

const env = {
  ...process.env,
  PATH: `${localBinDir}${pathSeparator}${nodeBinDir}${pathSeparator}${process.env.PATH ?? ''}`,
};

const result = spawnSync(process.execPath, [turboEntrypoint, 'run', ...process.argv.slice(2)], {
  cwd: repoRoot,
  env,
  stdio: 'inherit',
  windowsHide: true,
});

if (result.error) {
  throw result.error;
}

process.exit(result.status ?? 0);
