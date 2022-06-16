import { unlink } from 'fs/promises';

import fastifyStatic from '@fastify/static';
import fastify from 'fastify';
import Piscina from 'piscina';

import {
	bin,
	contextWorker,
	gameCore,
	gameMinified,
	parseWorker,
} from '../config/paths.js';
import updateBin from '../updateBin.js';
import test from './test.js';

const parse = new Piscina({ maxThreads: 1, filename: parseWorker });

/**
 * @type {Piscina|undefined}
 */
let context;

async function updateContext() {
	const updated = await updateBin();

	if (updated || !context) {
		if (context) {
			context.terminate();
		}

		context = new Piscina({ filename: contextWorker });

		if (updated && updated[gameCore]) {
			try {
				await unlink(gameMinified);
			} catch (error) {
				if (error.code !== 'ENOENT') {
					throw error;
				}
			}

			await parse.run(await context.run(undefined, { name: 'game' }), {
				name: 'parse',
			});
		}

		test(context);
	}
}

updateContext();

setInterval(updateContext, 60e3);

const server = fastify();

server.register(fastifyStatic, {
	root: bin,
	serve: false,
});

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
	handler(_request, reply) {
		reply.sendFile('gameVars.json');
	},
});

server.route({
	method: 'GET',
	url: '/clientKey',
	async handler(_request, reply) {
		reply.send(await context.run(undefined, { name: 'getClientKey' }));
	},
});

server.route({
	method: 'POST',
	url: '/hashData',
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
		reply.send(await context.run(request.body, { name: 'hashData' }));
	},
});

server.listen(
	{
		port: process.env.PORT || 80,
	},
	(error, url) => {
		if (error) {
			console.error(error);
			process.exit();
		}
		console.log('Live at', url);
	}
);
