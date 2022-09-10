import { writeFile } from 'fs/promises';
import { minify } from 'terser';
import { fileURLToPath } from 'url';

export async function parse(gameScript: string) {
	console.log('Parsing game...');

	console.time('parse');
	const minified = (await minify(gameScript)).code!;
	console.timeEnd('parse');

	await writeFile(
		fileURLToPath(new URL('../bin/game.min.js', import.meta.url)),
		minified
	);

	const [, , ahk] =
		minified.match(/function\((\w+)\){\1\.exports=JSON\.parse\("(\d+)"\)}/) ||
		[];

	const [, build] = minified.match(/\w+\.exports\.buildVersion="(.*?)"/) || [];

	await writeFile(
		fileURLToPath(new URL('../bin/gameVars.json', import.meta.url)),
		Buffer.from(
			JSON.stringify({
				ahk: parseInt(ahk),
				build,
			})
		)
	);
}
