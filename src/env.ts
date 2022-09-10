'use strict';

{
	globalThis.window = globalThis;

	const {
		contentWindow,
		gameCoreData,
		performanceNow,
		TextDecoder,
		Uint8Array,
		console,
		enableConsole,
		generateToken,
		WebAssembly,
		resolve,
	} = window.initData;

	delete window.initData;

	if (resolve) {
		// "return" from the script
		window.resolve = data => resolve(data);
	}

	window.WebAssembly = WebAssembly;

	if (enableConsole) {
		window.console = {};

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
			window.console[key] = (...args) => console[key](...args);
		}
	}

	window.requestAnimationFrame = () => {};

	window.location = {
		hostname: 'krunker.io',
	};

	window.XMLHttpRequest = class {
		setRequestHeader() {}
		send() {
			this.readyState = 4;
			this.statusText = 'OK';
			this.status = 200;
			this.response = new window.Uint8Array(gameCoreData).buffer;
			this.onload();
		}
		open() {}
	};

	window.WebSocket = class {
		send() {}
	};

	window.CanvasRenderingContext2D = class {
		clearRect() {}
		scale() {}
		save() {}
		arcTo() {}
		fillText() {}
	};

	window.HTMLIFrameElement = class {
		_contentWindow = null;
		get contentWindow() {
			return this._contentWindow;
		}
	};

	window.HTMLCanvasElement = class {
		context = new window.CanvasRenderingContext2D();
		getContext() {
			return this.context;
		}
	};

	window.HTMLDivElement = class {
		addEventListener() {}
	};

	window.document = {
		body: {
			appendChild(child) {
				child._contentWindow = contentWindow;
				return child;
			},
			removeChild() {},
		},
		write() {},
		createElement(kind) {
			let element;

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
			}

			element.style = {};

			return element;
		},
	};

	window.performance = {
		now() {
			return performanceNow();
		},
	};

	window.Headers = function Headers(init) {
		return init;
	};

	window.fetch = async (url, init = {}) => {
		if (url.startsWith('/pkg/loader.wasm')) {
			return;
		}

		if (url === 'https://matchmaker.krunker.io/generate-token') {
			return {
				async json() {
					return JSON.parse(await generateToken(init.headers['Client-Key']));
				},
			};
		}
	};

	window.localStorage = { logs: true };

	window.TextDecoder = class {
		#decoder;
		constructor(type) {
			this.#decoder = new TextDecoder(type ? String(type) : undefined);
		}
		decode(data) {
			// data is only Uint8Array
			return this.#decoder.decode(new Uint8Array(data));
		}
	};

	Object.defineProperty(Object.prototype, 'Context', {
		// eslint-disable-next-line no-unused-vars
		set(_value) {},
		configurable: false,
		enumerable: false,
	});
}
