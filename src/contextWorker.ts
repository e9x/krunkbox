import type { ClientKey, HashedData, Token, InitContext } from './env.js';
import type { CoreData } from './updateBin.js';
import { readFile } from 'fs/promises';
import fetch from 'node-fetch';
import { performance } from 'perf_hooks';
import { Script, createContext } from 'vm';

type CompatibleContext = { initData: InitContext };

const coreDataBin: ArrayBuffer[] = [];

const coreDataPath = new URL('../bin/coreData.json', import.meta.url);
const coreDir = new URL('../bin/cores/', import.meta.url);

const coreData = JSON.parse(await readFile(coreDataPath, 'utf-8')) as CoreData;

for (let i = 0; i < coreData.length; i++)
	coreDataBin.push(
		(await readFile(new URL(`core.dat.split-${i}`, coreDir))).buffer
	);

const initScriptPath = new URL('./env.js', import.meta.url);

const initScript = new Script(
	(await readFile(initScriptPath, 'utf-8')).replace('export {};', ''),
	{
		filename: initScriptPath.toString(),
	}
);

const loaderScriptPath = new URL('../bin/loader.js', import.meta.url);
const loaderScript = new Script(await readFile(loaderScriptPath, 'utf-8'), {
	filename: loaderScriptPath.toString(),
});

const getThis = new Script('this');

// context provides: WebAssembly, pre-compiled module
const WebAssemblyContext = {
	loaderWasmData: (
		await readFile(new URL('../bin/loader.wasm', import.meta.url))
	).buffer,
};

createContext(WebAssemblyContext);

const [WebAssembly, modulePromise] = new Script(`
const modulePromise = WebAssembly.compile(loaderWasmData);

WebAssembly.instantiateStreaming = async function (_source, importObject) {
	const module = await modulePromise;
	const instance = await WebAssembly.instantiate(module, importObject);
	return { module, instance };
};

[WebAssembly, modulePromise]`).runInContext(WebAssemblyContext);

console.time('Compile WASM module');
await modulePromise;
console.timeEnd('Compile WASM module');

const baseInit = () => ({
	WebAssembly,
	coreDataBin,
	performanceNow: performance.now,
	TextDecoder,
	Uint8Array,
	console,
	async generateToken(clientKey: string) {
		return await (
			await fetch('https://matchmaker.krunker.io/generate-token', {
				headers: {
					'Client-Key': clientKey,
					'User-Agent':
						'Mozilla/5.0 (Windows NT 6.1; rv:31.0) Gecko/20100101 Firefox/31.0',
				},
			})
		).text();
	},
	fetch,
	contentWindow: getThis.runInNewContext(),
});

/*{
	const context = {
		initData: {
			...baseInit,
			TextDecoder: class extends TextDecoder {
				decode(buffer) {
					const decoded = super.decode(buffer);
					// decoded === "return new Function('WP_fetchMMToken',new TextDecoder().decode(new Uint8Array(arg)))(token)"

					return decoded;
				},
			},
	};
	
	createContext(context);
	initScript.runInContext(context);
	loaderScript.runInContext(context);
}*/

const dummyToken = {
	token: '',
	cfid: 0,
	sid: 0,
};

export const getClientKey = () =>
	new Promise<ClientKey>((resolve) => {
		const context: CompatibleContext = {
			initData: {
				...baseInit(),
				coreDataBin: false,
				async generateToken(clientKey) {
					resolve(JSON.parse(clientKey));
					return JSON.stringify(dummyToken);
				},
			},
		};

		createContext(context);
		initScript.runInContext(context);
		loaderScript.runInContext(context);
	});

export const hashToken = (token: Token) =>
	new Promise<HashedData>((resolve) => {
		const context: CompatibleContext = {
			initData: {
				...baseInit(),
				coreDataBin: false,
				resolve: (hashed) => resolve(JSON.parse(hashed)),
				async generateToken() {
					return JSON.stringify(token);
				},
				TextDecoder: class extends TextDecoder {
					decode(buffer: BufferSource | undefined) {
						const decoded = super.decode(buffer);

						if (
							decoded ===
							"return new Function('WP_fetchMMToken',new TextDecoder().decode(new Uint8Array(arg)))(token)"
						) {
							return 'return token.then(data => window.resolve(JSON.stringify(data))), () => {}';
						}

						return decoded;
					}
				},
			},
		};

		createContext(context);
		initScript.runInContext(context);
		loaderScript.runInContext(context);
	});

export const game = () =>
	new Promise<string>((resolve) => {
		const context: CompatibleContext = {
			initData: {
				...baseInit(),
				resolve: (script) => resolve(script),
				async generateToken() {
					return JSON.stringify(dummyToken);
				},
				TextDecoder: class extends TextDecoder {
					decode(buffer: BufferSource | undefined) {
						const decoded = super.decode(buffer);

						if (
							decoded ===
							"return new Function('WP_fetchMMToken',new TextDecoder().decode(new Uint8Array(arg)))(token)"
						) {
							return 'return window.resolve(new TextDecoder().decode(new Uint8Array(arg))), () => {}';
						}

						return decoded;
					}
				},
			},
		};

		createContext(context);
		initScript.runInContext(context);
		loaderScript.runInContext(context);
	});
