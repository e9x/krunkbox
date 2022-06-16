import { readFile, writeFile } from 'node:fs/promises';

import md5 from 'md5';
import fetch from 'node-fetch';

import {
	checksumJson,
	gameCore,
	loaderJs,
	loaderWasm,
} from './config/paths.js';

let checksums;

try {
	checksums = JSON.parse(await readFile(checksumJson, 'utf-8'));
} catch (error) {
	checksums = {};
}

const resources = {
	[loaderJs]: 'https://krunker.io/pkg/loader.js',
	[loaderWasm]: 'https://krunker.io/pkg/loader.wasm',
	[gameCore]: 'https://krunker.io/pkg/core.dat',
};

export default async function updateBin() {
	const updated = {};
	let anyUpdated = false;

	for (const file in resources) {
		const url = resources[file];

		const response = await fetch(url);
		const body = await response.arrayBuffer();
		const checksum = md5(new Uint8Array(body));

		if (checksum === checksums[file]) {
			continue;
		}

		anyUpdated = true;
		updated[file] = true;

		checksums[file] = checksum;

		await writeFile(file, Buffer.from(body));
	}

	if (updated) {
		await writeFile(checksumJson, JSON.stringify(checksums));
	}
	return anyUpdated && updated;
}
