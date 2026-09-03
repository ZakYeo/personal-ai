import { AtomicFileReplacementError } from "../adapters/local/atomic-file-replacement.js";
import type { LocalJsonStateFileSystem } from "../adapters/local/json-state-file.js";

export function createDurabilityUnknownStateFileSystem(): LocalJsonStateFileSystem {
  let contents: string | undefined;

  return {
    mkdir: () => Promise.resolve(),
    readFile: () =>
      contents === undefined
        ? Promise.reject(
            Object.assign(new Error("missing"), { code: "ENOENT" }),
          )
        : Promise.resolve(contents),
    replaceFile: (options) => {
      contents = options.contents;
      return Promise.reject(
        new AtomicFileReplacementError(
          new Error("parent directory sync failed"),
          [],
          "durability_unknown",
        ),
      );
    },
  };
}
