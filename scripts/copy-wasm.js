import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));

// Try multiple locations — monorepo hoists to root, standalone installs locally
const possibleSrc = [
  path.resolve(scriptDir, '../node_modules/@wllama/wllama/esm/wasm/wllama.wasm'),
];

const dest = path.resolve(scriptDir, '../public/wllama/wllama.wasm');

const src = possibleSrc.find(p => fs.existsSync(p));
if (!src) {
  console.warn('⚠ wllama.wasm not found. Run: yarn add @wllama/wllama');
  process.exit(0);
}

fs.mkdirSync(path.dirname(dest), { recursive: true });
fs.copyFileSync(src, dest);
console.log('✓ Copied wllama.wasm to public/wllama/');
