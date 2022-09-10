import md5 from 'md5';
import fetch from 'node-fetch';
import { access, readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'url';

interface Checksums {
	'loader js'?: string;
	'loader wasm'?: string;
	'core dat'?: string;
}

let checksums: Checksums;

try {
	checksums = JSON.parse(
		await readFile(
			fileURLToPath(new URL('../bin/checksums.json', import.meta.url)),
			'utf-8'
		)
	);
} catch (err) {
	checksums = {};
}

interface Resource {
	alias: keyof Checksums;
	url: string;
	path: string;
}

const resources: Resource[] = [
	{
		alias: 'loader js',
		url: 'https://krunker.io/pkg/loader.js',
		path: fileURLToPath(new URL('../bin/loader.js', import.meta.url)),
	},
	{
		alias: 'loader wasm',
		url: 'https://krunker.io/pkg/loader.wasm',
		path: fileURLToPath(new URL('../bin/loader.wasm', import.meta.url)),
	},
	{
		alias: 'core dat',
		url: 'https://krunker.io/pkg/core.dat',
		path: fileURLToPath(new URL('../bin/core.dat', import.meta.url)),
	},
];
export default async function updateBin() {
	type Updated = Record<keyof Checksums, boolean>;
	const updated: Partial<Updated> = {};
	let anyUpdated = false;

	for (const res of resources) {
		const response = await fetch(res.url);
		const body = await response.arrayBuffer();
		const checksum = md5(new Uint8Array(body));

		try {
			await access(res.path);
		} catch (err) {
			if ((err as { code?: string })?.code !== 'ENOENT') throw err;

			delete checksums[res.alias];
		}

		if (checksum === checksums[res.alias]) continue;

		anyUpdated = true;
		updated[res.alias] = true;

		checksums[res.alias] = checksum;

		await writeFile(res.path, Buffer.from(body));
	}

	if (updated)
		await writeFile(
			fileURLToPath(new URL('../bin/checksums.json', import.meta.url)),
			JSON.stringify(checksums)
		);

	return anyUpdated && (updated as Updated);
}
