import { mirrorAttributes } from "./hook";
import { magic } from "./magic";
import type { KruSource } from "./inject";

function argsIsSource(args: string[]) {
  return args.length === 2 && args[1].length > 5000;
}

export const hashToken = (token: string) =>
  new Promise<string>((resolve) =>
    magic((collect) => ({
      resolve: (hashed) => {
        resolve(hashed);
        collect();
      },
      generateToken: () =>
        new TextEncoder().encode(token).buffer as ArrayBuffer,
      newFunction: (args, construct) => {
        // spoof the result of new Function() to appear like the real result
        if (argsIsSource(args))
          return construct(args[0], `window.resolve(${args[0]})`);
        // return mirrorAttributes(
        //   construct(args[0], `window.resolve(${args[0]})`),
        //   construct(...args)
        // );

        return construct(...args);
      },
    }))
  );

export const source = () =>
  new Promise<KruSource>((resolve) =>
    magic((collect, helpers) => ({
      generateToken: () =>
        new Uint8Array([25, 30, 17, 17, 27, 16, 16, 29, 16, 24]).buffer,
      resolve: () => collect(),
      newFunction: (args, construct) => {
        // spoof the result of new Function() to appear like the real result
        if (argsIsSource(args)) {
          resolve({
            source: args[1],
            token: args[0],
            renamed: helpers.getRenamed(),
            skins: helpers.getSkins(),
          });

          return mirrorAttributes(
            construct("window.resolve()"),
            construct(...args)
          );
        }

        return construct(...args);
      },
    }))
  );
