import type { Token, HashedData, ClientKey } from './env.js';
import test from './test.js';
import updateBin from './updateBin.js';
import fastifyCors from '@fastify/cors';
import fastifyStatic from '@fastify/static';
import { expand } from 'dotenv-expand';
import { config } from 'dotenv-flow';
import fastify from 'fastify';
import { access, unlink } from 'fs/promises';
import Piscina from 'piscina';
import { fileURLToPath } from 'url';

expand(config());

export interface ContextWorker extends Piscina {
	run(task: undefined, runOptions: { name: 'game' }): Promise<string>;
	run(task: Token, runOptions: { name: 'hashToken' }): Promise<HashedData>;
	run(
		task: undefined,
		runOptions: { name: 'getClientKey' }
	): Promise<ClientKey>;
}

export interface ParseWorker extends Piscina {
	run(task: string, runOptions: { name: 'parse' }): Promise<void>;
}

const parse: ParseWorker = new Piscina({
	maxThreads: 1,
	filename: fileURLToPath(new URL('./parseWorker.js', import.meta.url)),
});

let context: ContextWorker | undefined;

async function parseGame() {
	await parse.run(await context!.run(undefined, { name: 'game' }), {
		name: 'parse',
	});
}

async function updateContext() {
	const updated = await updateBin();

	if (updated || !context) {
		if (context) context.destroy();

		context = new Piscina({
			filename: fileURLToPath(new URL('./contextWorker.js', import.meta.url)),
		});

		if (updated && updated['core dat']) {
			try {
				await unlink(
					fileURLToPath(new URL('../bin/game.min.js', import.meta.url))
				);
			} catch (err) {
				if ((err as { code?: string })?.code !== 'ENOENT') throw err;
			}

			await parseGame();
		} else {
			try {
				await access(
					fileURLToPath(new URL('../bin/gameVars.json', import.meta.url))
				);
			} catch (err) {
				if ((err as { code?: string })?.code !== 'ENOENT') throw err;

				await parseGame();
			}
		}

		if (updated) {
			console.log('Updated');
		} else {
			console.log('Up-to-date');
		}

		test(context);
	}
}

updateContext();

setInterval(updateContext, 60e3 * 60 * 6);

const server = fastify();

server.register(fastifyStatic, {
	root: fileURLToPath(new URL('../bin/', import.meta.url)),
	serve: false,
});

server.register(fastifyCors);

server.route({
	method: 'GET',
	url: '/source',
	handler(_request, reply) {
		reply.sendFile('game.min.js');
	},
});

server.route({
	method: 'GET',
	url: '/vars',
	handler(request, reply) {
		reply.sendFile('gameVars.json');
	},
});

server.route({
	method: 'GET',
	url: '/clientKey',
	async handler(request, reply) {
		reply.send(await context?.run(undefined, { name: 'getClientKey' }));
	},
});

server.route({
	method: 'POST',
	url: '/hashToken',
	schema: {
		body: {
			type: 'object',
			properties: {
				token: { type: 'string' },
				sid: { type: 'number' },
				cfid: { type: 'number' },
			},
		},
	},
	async handler(request, reply) {
		reply.send(
			await context?.run(request.body as Token, { name: 'hashToken' })
		);
	},
});

let port = parseInt(process.env.PORT || '');

if (isNaN(port)) port = 80;

server.listen(
	{
		port,
	},
	(err, url) => {
		if (err) {
			console.error(err);
			process.exit();
		}
		console.log('Live at', url);
	}
);
