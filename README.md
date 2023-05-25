# krunkbox

This script runs a webserver that will serve the rotating byte (AHK), game source, and endpoints for hashing matchmaking tokens.

## Unix permissions

Assuming `game` is your desired user:

```sh
$ chmod 760 ./bin/ -R
$ chown game ./bin/ -R
```

## bin

You will need to feed some files into the `bin` directory to support Sketch. These files can be update during runtime without restarting the server.

### `bin/sketch.user.js`

Contains the Tampermonkey userscript for Sketch. It should validate against the following regex for version support:

```js
/^\/\/ @version\s+(.*?)$/m;
```

### `bin/compat.json`

Contains a JSON object that looks like the following:

```ts
interface CompatibleChecksums {
  /**
   * Key is the checksum used in Sketch (SKETCH_SUPPORTED_GAME)
   * Value is an array of checksums that are compatible with the checksum described in the key.
   * The checksums are newer/older versions of the game
   *
   * If you can support X, then you can support one of Y
   */
  [oldSourceChecksum: string]: string[];
}
```

```json
{
  "b81c2a2bf4db6f77a82b7b405be4fc1dbeca89517c5ee90f8c44b52832553392aaa87b399ad601a9aa0f1b3926fc024a69c73adec04fcab7afe1d8047f5f252a": [
    "5bad288e2a4feb4be4be198d8f94f835aef620976779daec04ec52aadf2d9abf409d556f58b3e578e0b6c1b736c898d1c98f7a3c0587340e61803591aed9ae8d"
  ]
}
```
