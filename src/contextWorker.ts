import { ClientKey, HashedData, InitContext, Token } from './env.js';
import { readFile } from 'fs/promises';
import fetch from 'node-fetch';
import { performance } from 'perf_hooks';
import { fileURLToPath } from 'url';
import { Script, createContext } from 'vm';

const gameCoreData = (
	await readFile(fileURLToPath(new URL('../bin/core.dat', import.meta.url)))
).buffer;

const initScriptPath = fileURLToPath(new URL('./env.js', import.meta.url));

const initScript = new Script(
	(await readFile(initScriptPath, 'utf-8')).replace('export {};', ''),
	{
		filename: initScriptPath,
	}
);

const loaderScriptPath = fileURLToPath(
	new URL('../bin/loader.js', import.meta.url)
);

const loaderScript = new Script(await readFile(loaderScriptPath, 'utf-8'), {
	filename: loaderScriptPath,
});

const getThis = new Script('this');

// context provides: WebAssembly, pre-compiled module
const WebAssemblyContext = {
	loaderWasmData: (
		await readFile(
			fileURLToPath(new URL('../bin/loader.wasm', import.meta.url))
		)
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

const baseInit = () =>
	({
		WebAssembly,
		gameCoreData,
		performanceNow: performance.now,
		TextDecoder,
		Uint8Array,
		console,
		enableConsole: true,
		async generateToken(clientKey) {
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
		contentWindow: getThis.runInNewContext(),
	} as InitContext);

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
		const context = {
			initData: {
				...baseInit(),
				enableConsole: false,
				gameCoreData: new ArrayBuffer(0),
				async generateToken(clientKey) {
					resolve(JSON.parse(clientKey));
					return JSON.stringify(dummyToken);
				},
			} as InitContext,
		};

		createContext(context);
		initScript.runInContext(context);
		loaderScript.runInContext(context);
	});

export const hashToken = (token: Token) =>
	new Promise<HashedData>((resolve) => {
		const context = {
			initData: {
				...baseInit(),
				enableConsole: false,
				gameCoreData: new ArrayBuffer(0),
				resolve,
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
							return 'return window.resolve(token), () => {}';
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
		const context = {
			initData: {
				...baseInit(),
				enableConsole: false,
				resolve,
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
