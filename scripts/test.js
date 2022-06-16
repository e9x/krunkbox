export default async function (context) {
	console.time('hash');
	const hashed = await context.run(
		{
			token: 'Ybcxf0BXJsAkgNWtQMnvfGgHQkkfYVXg',
			cfid: 3323532784,
			sid: 2094532721,
		},
		{ name: 'hashData' }
	);
	console.timeEnd('hash');

	console.log('hash:', hashed);

	console.time('clientKey');
	const clientKey = await context.run(undefined, { name: 'getClientKey' });
	console.timeEnd('clientKey');

	console.log('clientKey:', clientKey);
}
