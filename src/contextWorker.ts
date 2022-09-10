import { readFile } from 'node:fs/promises';
import { performance } from 'node:perf_hooks';
import { Script, createContext } from 'node:vm';

import fetch from 'node-fetch';

import { envJs, gameCore, loaderJs, loaderWasm } from './config/paths.js';

const gameCoreData = (await readFile(gameCore)).buffer;

const initScript = new Script(await readFile(envJs, 'utf-8'), {
	filename: envJs,
});

const loaderScript = new Script(await readFile(loaderJs, 'utf-8'), {
	filename: loaderJs,
});

const getThis = new Script('this');

// context provides: WebAssembly, pre-compiled module
const WebAssemblyContext = {
	loaderWasmData: (await readFile(loaderWasm)).buffer,
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

export function getClientKey() {
	return new Promise(resolve => {
		const context = {
			initData: {
				...baseInit(),
				enableConsole: false,
				gameCoreData: new ArrayBuffer(),
				async generateToken(clientKey) {
					resolve(clientKey);
					return JSON.stringify(dummyToken);
				},
			},
		};

		createContext(context);
		initScript.runInContext(context);
		loaderScript.runInContext(context);
	});
}

// data being {sid,etc, obj}
export function hashData(data) {
	return new Promise(resolve => {
		const context = {
			initData: {
				...baseInit(),
				enableConsole: false,
				gameCoreData: new ArrayBuffer(),
				resolve,
				async generateToken() {
					return JSON.stringify(data);
				},
				TextDecoder: class extends TextDecoder {
					decode(buffer) {
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
}

export function game() {
	return new Promise(resolve => {
		const context = {
			initData: {
				...baseInit(),
				enableConsole: false,
				resolve,
				async generateToken() {
					return JSON.stringify(dummyToken);
				},
				TextDecoder: class extends TextDecoder {
					decode(buffer) {
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
}
