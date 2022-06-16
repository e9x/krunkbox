import { realpath } from 'node:fs/promises';
import { resolve } from 'node:path';
import { cwd } from 'node:process';

const appDirectory = await realpath(cwd());

export function resolveApp(relativePath) {
	return resolve(appDirectory, relativePath);
}

export const bin = resolveApp('bin');
export const envJs = resolveApp('env.js');
export const loaderJs = resolveApp('bin/loader.js');
export const contextWorker = resolveApp('contextWorker.js');
export const minifyWorker = resolveApp('minifyWorker.js');
export const loaderWasm = resolveApp('bin/loader.wasm');
export const gameCore = resolveApp('bin/core.dat');
export const game = resolveApp('bin/game.js');
export const gameMinified = resolveApp('bin/game.min.js');
export const checksumJson = resolveApp('bin/checksums.json');
export const gameAhk = resolveApp('bin/gameAhk.json');
