import once from '@tootallnate/once';
import { createWriteStream, WriteStream } from 'fs';
import { stat } from 'fs/promises';
import fetch from 'node-fetch';
import { fileURLToPath } from 'url';

interface Resource {
	alias: 'loader js' | 'loader wasm' | 'core dat';
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
	type Updated = Record<Resource['alias'], boolean>;
	const updated: Partial<Updated> = {};
	let anyUpdated = false;

	const writeStreams: WriteStream[] = [];

	for (const res of resources) {
		const response = await fetch(res.url);

		try {
			const stats = await stat(res.path);
			const header = response.headers.get('last-modified');
			if (!header) throw new Error(`Bad last-modified: ${header}`);

			const lastModified = new Date(header);

			if (lastModified.getTime() <= stats.mtimeMs) continue;
		} catch (err) {
			if ((err as { code?: string })?.code !== 'ENOENT') throw err;
		}

		anyUpdated = true;
		updated[res.alias] = true;

		const writeStream = createWriteStream(res.path);
		response.body!.pipe(writeStream);

		writeStreams.push(writeStream);
	}

	for (const writeStream of writeStreams) await once(writeStream, 'end');

	return anyUpdated && (updated as Updated);
}
