#!/usr/bin/env node
/**
 * OPPO EHS GLB optimizer.
 *
 * Usage:
 *   npm run optimize:glb -- input.glb output.glb environment
 *   npm run optimize:glb -- character.glb character-optimized.glb character
 *
 * Environment mode is for static factory assets only. Character mode is
 * deliberately conservative to preserve skinning, skeletons and animation.
 */
import { stat } from 'node:fs/promises';
import { resolve, extname } from 'node:path';
import { NodeIO } from '@gltf-transform/core';
import {
  dedup, flatten, instance, join, palette, prune, simplify, sparse,
  textureCompress, weld,
} from '@gltf-transform/functions';
import { MeshoptSimplifier } from 'meshoptimizer';

const [inputArg, outputArg, modeArg = 'environment'] = process.argv.slice(2);
if (!inputArg || !outputArg || !['environment', 'character'].includes(modeArg)) {
  console.error('Usage: npm run optimize:glb -- <input.glb> <output.glb> <environment|character>');
  process.exit(2);
}
const input = resolve(inputArg);
const output = resolve(outputArg);
if (input === output) {
  console.error('Input and output must be different files. The source asset will not be overwritten.');
  process.exit(2);
}
if (extname(input).toLowerCase() !== '.glb' || extname(output).toLowerCase() !== '.glb') {
  console.error('This pipeline expects .glb input and output files.');
  process.exit(2);
}

const io = new NodeIO();
const document = await io.read(input);
const root = document.getRoot();
const animations = root.listAnimations();
const skins = root.listSkins();

if (modeArg === 'environment' && (animations.length > 0 || skins.length > 0)) {
  console.error('Safety stop: environment mode is only for static assets. This GLB contains animation or skin data. Re-run in character mode.');
  process.exit(3);
}

const before = (await stat(input)).size;
await MeshoptSimplifier.ready;

if (modeArg === 'environment') {
  // Aggressive static-scene optimization. Never run this on the rigged player.
  await document.transform(
    dedup(),
    instance({ min: 5 }),
    palette({ min: 5 }),
    flatten(),
    join(),
    weld(),
    simplify({
      simplifier: MeshoptSimplifier,
      error: 0.0001,
      ratio: 0.5,
      lockBorder: true,
    }),
    prune(),
    sparse({ ratio: 0.2 }),
    textureCompress({ targetFormat: 'webp', resize: [1024, 1024] }),
  );
} else {
  // Rig-safe path: deliberately avoids flatten/join/instance/palette/weld/
  // simplify/resample, which may alter node hierarchy, skin weights or clips.
  await document.transform(
    dedup(),
    prune(),
    sparse({ ratio: 0.2 }),
    textureCompress({ targetFormat: 'webp', resize: [1024, 1024] }),
  );
}

await io.write(output, document);
const after = (await stat(output)).size;
const reduction = before > 0 ? ((before - after) / before) * 100 : 0;
console.log(JSON.stringify({
  mode: modeArg,
  input,
  output,
  beforeBytes: before,
  afterBytes: after,
  reductionPercent: Number(reduction.toFixed(2)),
  preservedAnimations: root.listAnimations().length,
  preservedSkins: root.listSkins().length,
}, null, 2));
