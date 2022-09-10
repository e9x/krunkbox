import { writeFile } from 'node:fs/promises';

import { minify } from 'terser';

import { gameMinified, gameVars } from './config/paths.js';

export async function parse(gameScript) {
	console.log('Parsing game...');

	console.time('parse');
	const minified = (await minify(gameScript)).code;
	console.timeEnd('parse');

	await writeFile(gameMinified, minified);

	const [, , ahk] = minified.match(
		/function\((\w+)\){\1\.exports=JSON\.parse\("(\d+)"\)}/
	);

	const [, build] = minified.match(/\w+\.exports\.buildVersion="(.*?)"/);

	await writeFile(
		gameVars,
		Buffer.from(
			JSON.stringify({
				ahk: parseInt(ahk),
				build,
			})
		)
	);
}
