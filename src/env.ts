/* eslint-disable @typescript-eslint/no-empty-function */
export interface Token {
	token: string;
	cfid: number;
	sid: number;
}

export type ClientKey = number[];

export type HashedData = number[];

/**
 * Init object cannot contain any void fields to prevent Object property hooks...
 */
export interface InitData {
	contentWindow: typeof globalThis;
	coreDataBin: ArrayBuffer[] | false;
	performanceNow: () => number;
	TextDecoder: typeof TextDecoder;
	console: typeof console | null;
	generateToken: (clientKey: string) => Promise<string>;
	WebAssembly: typeof WebAssembly;
	resolve: ((data: string) => void) | null;
}

declare global {
	// eslint-disable-next-line no-var
	var initData: Readonly<InitData> | undefined;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any, no-var
declare var window: any;

{
	Object.defineProperty(globalThis, 'window', {
		configurable: false,
		value: globalThis,
	});

	const getInit = () => {
		const { initData } = globalThis;
		if (!initData) throw new TypeError('Bad initData');
		delete window.initData;
		return initData;
	};

	const initData = getInit();

	// return some data from the script
	if (initData.resolve) {
		const resolve = initData.resolve;
		window.resolve = (data: string) => resolve(data);
	}

	const WebAssembly = initData.WebAssembly;

	const console: Partial<typeof initData['console']> = {};

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

		(console as unknown as CrapConsole)[key] = (...args: unknown[]) => {
			if (initData.console) {
				(initData.console as unknown as CrapConsole)[key](...args);
			}
		};
	}

	const requestAnimationFrame = function requestAnimationFrame() {
		return 0;
	};

	const location = {
		hostname: 'krunker.io',
	};

	const XMLHttpRequest = class XMLHttpRequest {
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
			if (initData.coreDataBin) {
				const splitID = Number(
					(this.#url?.match(/core.dat.split-(\d+)\?/) || [])[1]
				);

				if (isNaN(splitID))
					throw new Error(`Unrecognized XMLHttpRequest resource: ${this.#url}`);

				this.response = new Uint8Array(initData.coreDataBin[splitID]).buffer;
			} else {
				this.response = new Uint8Array();
			}

			if (this.onload) this.onload();
		}
		open(method: string, url: string) {
			this.#url = url;
		}
	};

	const WebSocket = class WebSocket {
		send() {}
	};

	const CanvasRenderingContext2D = class CanvasRenderingContext2D {
		clearRect() {}
		scale() {}
		save() {}
		arcTo() {}
		fillText() {}
	};

	const HTMLElement = class HTMLElement {
		style = {};
	};

	const HTMLIFrameElement = class HTMLIFrameElement extends HTMLElement {
		_contentWindow = null;
		get contentWindow() {
			return this._contentWindow;
		}
	};

	const HTMLCanvasElement = class HTMLCanvasElement extends HTMLElement {
		context = new window.CanvasRenderingContext2D();
		getContext() {
			return this.context;
		}
	};

	const HTMLDivElement = class HTMLDivElement extends HTMLElement {
		addEventListener() {}
	};

	const document = {
		body: {
			appendChild(child: { _contentWindow: InitData['contentWindow'] }) {
				child._contentWindow = initData.contentWindow;
				return child;
			},
			removeChild() {},
		},
		write() {},
		createElement(kind: string): InstanceType<typeof HTMLElement> {
			switch (kind) {
				case 'iframe':
					return new HTMLIFrameElement();
				case 'canvas':
					return new HTMLCanvasElement();
				case 'div':
					return new HTMLDivElement();
				default:
					throw kind;
			}
		},
	};

	const performance = {
		now() {
			return initData.performanceNow();
		},
	};

	interface HotHeaders {
		'Client-Key': number[];
	}

	const Headers = function Headers(init: HotHeaders) {
		return init;
	};

	const fetch = async function fetch(
		url: string | URL,
		init: { headers: HotHeaders }
	) {
		url = url.toString();

		if (url.startsWith('/pkg/loader.wasm')) return;

		if (url === 'https://matchmaker.krunker.io/generate-token')
			return {
				async json() {
					return JSON.parse(
						await initData.generateToken(
							JSON.stringify(init.headers['Client-Key'])
						)
					);
				},
			};
	};

	const localStorage = { logs: true };

	const TextDecoder = class TextDecoder {
		#decoder: InstanceType<InitData['TextDecoder']>;
		constructor(type: string) {
			this.#decoder = new initData.TextDecoder(type);
		}
		decode(data: Uint8Array) {
			return this.#decoder.decode(data);
		}
	};

	window.fetch = fetch;
	window.Headers = Headers;
	window.WebSocket = WebSocket;
	window.CanvasRenderingContext2D = CanvasRenderingContext2D;
	window.location = location;
	window.document = document;
	window.performance = performance;
	window.localStorage = localStorage;
	window.requestAnimationFrame = requestAnimationFrame;
	window.HTMLElement = HTMLElement;
	window.HTMLIFrameElement = HTMLIFrameElement;
	window.HTMLCanvasElement = HTMLCanvasElement;
	window.HTMLDivElement = HTMLDivElement;
	window.XMLHttpRequest = XMLHttpRequest;
	window.TextDecoder = TextDecoder;
	window.WebAssembly = WebAssembly;

	Object.defineProperty(Object.prototype, 'Context', {
		// eslint-disable-next-line @typescript-eslint/no-unused-vars
		set(value) {},
		configurable: false,
		enumerable: false,
	});
}
