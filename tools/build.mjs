// Builds the Scripts Library script: dist/arabic-text.js (the whole tool, one file).
//   node tools/build.mjs
// Needs build/hb-asm.cjs first (node tools/build-hb.mjs).
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
execFileSync(process.execPath, [
    path.join(root, 'tools/bundle.mjs'),
    path.join(root, 'src/entry.js'),
    path.join(root, 'dist/arabic-text.js'),
    path.join(root, 'tools/banner.js')
], { stdio: 'inherit' });
console.log('built dist/arabic-text.js');
