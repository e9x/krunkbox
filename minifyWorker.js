import { writeFile } from 'node:fs/promises';
import { workerData } from 'node:worker_threads';

import { minify } from 'terser';

import { gameAhk, gameMinified } from './config/paths.js';

const minified = (await minify(workerData)).code;

await writeFile(gameMinified, minified);

const [, , ahk] = minified.match(
	/function\((\w+)\){\1\.exports=JSON\.parse\("(\d+)"\)}/
);

await writeFile(gameAhk, Buffer.from(ahk));
