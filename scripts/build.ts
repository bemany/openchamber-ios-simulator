// Builds the installable package into dist/: IIFE bundles for the frames
// (the sandboxed iframe cannot load ESM), ESM bundles for the service and its
// compose worker, and the JPEG decoder's WASM next to the worker.
import { copyFile, mkdir, rm, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';

const root = resolve(import.meta.dir, '..');
const dist = resolve(root, 'dist');

const bundle = async (entry: string, outfile: string, target: 'browser' | 'node') => {
  const result = await Bun.build({
    entrypoints: [resolve(root, entry)],
    format: target === 'node' ? 'esm' : 'iife',
    target,
    minify: target === 'browser',
  });
  const output = result.outputs[0];
  if (!result.success || !output) {
    throw new Error(result.logs.map((log) => log.message).join('\n') || `Build failed: ${entry}`);
  }
  const file = resolve(dist, outfile);
  await mkdir(dirname(file), { recursive: true });
  await writeFile(file, await output.text());
};

await rm(dist, { recursive: true, force: true });
await bundle('src/panel/main.ts', 'panel/main.js', 'browser');
await bundle('src/status/main.ts', 'status/main.js', 'browser');
await bundle('src/page/main.ts', 'page/main.js', 'browser');
await bundle('src/service/main.ts', 'service/main.js', 'node');
await bundle('src/service/compose-worker.ts', 'service/compose-worker.js', 'node');
await copyFile(resolve(root, 'node_modules/@jsquash/jpeg/codec/dec/mozjpeg_dec.wasm'), resolve(dist, 'service/mozjpeg_dec.wasm'));
await copyFile(resolve(root, 'node_modules/@jsquash/jpeg/codec/enc/mozjpeg_enc.wasm'), resolve(dist, 'service/mozjpeg_enc.wasm'));
await copyFile(resolve(root, 'src/panel/index.html'), resolve(dist, 'panel/index.html'));
await copyFile(resolve(root, 'src/status/index.html'), resolve(dist, 'status/index.html'));
await copyFile(resolve(root, 'src/page/index.html'), resolve(dist, 'page/index.html'));
console.log('Built dist/');
