/* eslint-disable @typescript-eslint/no-empty-function */
export interface Token {
	token: string;
	cfid: number;
	sid: number;
}

export type ClientKey = number[];

export type HashedData = number[];

export interface InitContext {
	contentWindow: typeof globalThis;
	coreDataBin: ArrayBuffer[] | false;
	performanceNow: () => number;
	TextDecoder: typeof TextDecoder;
	Uint8Array: typeof Uint8Array;
	console: typeof console;
	generateToken: (clientKey: string) => Promise<string>;
	WebAssembly: typeof WebAssembly;
	resolve?: (data: string) => void;
}

declare global {
	// eslint-disable-next-line no-var
	var initData: InitContext | undefined;
	// eslint-disable-next-line no-var
	var resolve: (data: string) => void;
}

{
	Object.defineProperty(globalThis, 'window', {
		configurable: false,
		value: globalThis,
	});

	const {
		contentWindow,
		coreDataBin,
		performanceNow,
		TextDecoder,
		Uint8Array,
		console,
		generateToken,
		WebAssembly,
		resolve,
	} = window.initData!;

	delete window.initData;

	if (resolve) {
		// "return" from the script
		window.resolve = (data: string) => {
			resolve(data);
		};
	}

	window.WebAssembly = WebAssembly;

	if (console) {
		const consoleLike: Partial<typeof console> = {};

		for (const key of [
			'log',
			'warn',
			'error',
			'trace',
			'info',
			'debug',
			'time',
			'timeEnd',
		]) {
			interface CrapConsole {
				[key: string]: (...args: unknown[]) => void;
			}

			(consoleLike as unknown as CrapConsole)[key] = (...args: unknown[]) =>
				(console as unknown as CrapConsole)[key](...args);
		}

		window.console = consoleLike as typeof console;
	}

	window.requestAnimationFrame = () => 0;

	window.location = {
		hostname: 'krunker.io',
	} as Location;

	window.XMLHttpRequest = class {
		#url?: string;
		readyState?: number;
		statusText?: string;
		status?: number;
		response?: ArrayBuffer;
		onload?: () => void;
		setRequestHeader() {}
		send() {
			this.readyState = 4;
			this.statusText = 'OK';
			this.status = 200;
			if (coreDataBin) {
				const splitID = Number(
					(this.#url?.match(/core.dat.split-(\d+)\?/) || [])[1]
				);

				if (isNaN(splitID))
					throw new Error(`Unrecognized XMLHttpRequest resource: ${this.#url}`);

				this.response = new window.Uint8Array(coreDataBin[splitID]).buffer;
			} else {
				this.response = new window.Uint8Array();
			}

			if (this.onload) this.onload();
		}
		open(method: string, url: string) {
			this.#url = url;
		}
	} as unknown as typeof XMLHttpRequest;

	window.WebSocket = class {
		send() {}
	} as unknown as typeof WebSocket;

	window.CanvasRenderingContext2D = class {
		clearRect() {}
		scale() {}
		save() {}
		arcTo() {}
		fillText() {}
	} as unknown as typeof CanvasRenderingContext2D;

	window.HTMLIFrameElement = class {
		_contentWindow = null;
		get contentWindow() {
			return this._contentWindow;
		}
	} as unknown as typeof HTMLIFrameElement;

	window.HTMLCanvasElement = class {
		context = new window.CanvasRenderingContext2D();
		getContext() {
			return this.context;
		}
	} as unknown as typeof HTMLCanvasElement;

	window.HTMLDivElement = class {
		addEventListener() {}
	} as unknown as typeof HTMLDivElement;

	window.document = {
		body: {
			appendChild(child: { _contentWindow: typeof contentWindow }) {
				child._contentWindow = contentWindow;
				return child;
			},
			removeChild() {},
		},
		write() {},
		createElement(kind: string) {
			let element: { style?: unknown };

			switch (kind) {
				case 'iframe':
					element = new window.HTMLIFrameElement();
					break;
				case 'canvas':
					element = new window.HTMLCanvasElement();
					break;
				case 'div':
					element = new window.HTMLDivElement();
					break;
				default:
					throw kind;
			}

			element.style = {};

			return element;
		},
	} as unknown as typeof document;

	window.performance = {
		now() {
			return performanceNow();
		},
	} as unknown as typeof performance;

	interface HotHeaders {
		'Client-Key': number[];
	}

	window.Headers = function Headers(init: HotHeaders) {
		return init;
	} as unknown as typeof Headers;

	window.fetch = (async (url: string | URL, init: { headers: HotHeaders }) => {
		url = url.toString();

		if (url.startsWith('/pkg/loader.wasm')) return;

		if (url === 'https://matchmaker.krunker.io/generate-token')
			return {
				async json() {
					return JSON.parse(
						await generateToken(JSON.stringify(init.headers['Client-Key']))
					);
				},
			};
	}) as unknown as typeof fetch;

	window.localStorage = { logs: true } as unknown as typeof localStorage;

	window.TextDecoder = class {
		#decoder: TextDecoder;
		constructor(type: string) {
			this.#decoder = new TextDecoder(type ? String(type) : undefined);
		}
		decode(data: Uint8Array) {
			// data is only Uint8Array
			return this.#decoder.decode(new Uint8Array(data));
		}
	} as unknown as typeof TextDecoder;

	Object.defineProperty(Object.prototype, 'Context', {
		// eslint-disable-next-line @typescript-eslint/no-unused-vars
		set(value) {},
		configurable: false,
		enumerable: false,
	});
}
