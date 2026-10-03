// Converts harfbuzzjs's WebAssembly build into plain JavaScript, because
// Affinity's script engine ships without WebAssembly.
//   node tools/build-hb.mjs  ->  build/hb-asm.cjs
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const bin = path.join(root, 'node_modules/binaryen/bin');
const wasm = path.join(root, 'node_modules/harfbuzzjs/dist/harfbuzz.wasm');
const out = path.join(root, 'build');
mkdirSync(out, { recursive: true });

// wasm2js cannot express bulk-memory / sign-ext / saturating truncation, so lower them first.
execFileSync(process.execPath, [path.join(bin, 'wasm-opt'), wasm,
  '--enable-bulk-memory', '--enable-bulk-memory-opt', '--enable-sign-ext', '--enable-nontrapping-float-to-int',
  '--enable-mutable-globals', '--enable-multivalue', '--enable-reference-types',
  '--llvm-memory-copy-fill-lowering', '--signext-lowering', '--llvm-nontrapping-fptoint-lowering',
  '-o', path.join(out, 'hb-lowered.wasm')], { stdio: 'inherit' });
execFileSync(process.execPath, [path.join(bin, 'wasm2js'), path.join(out, 'hb-lowered.wasm'), '-O2',
  '-o', path.join(out, 'hb.mjs')], { stdio: 'inherit' });

// Turn the ES module into a CommonJS factory that receives the imports.
let src = readFileSync(path.join(out, 'hb.mjs'), 'utf8');
src = src.replace(/^import \* as (\w+) from '[^']+';\s*$/gm, '');
src = src.replace(/^export var \w+ = retasmFunc\.\w+;\s*$/gm, '');
src = `'use strict';\nmodule.exports = function createHarfBuzzAsm(env, wasi_snapshot_preview1) {\n${src}\nreturn retasmFunc;\n};\n`;
writeFileSync(path.join(out, 'hb-asm.cjs'), src);
console.log('wrote build/hb-asm.cjs', (src.length / 1e6).toFixed(2), 'MB');
