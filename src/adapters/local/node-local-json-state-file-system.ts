import { mkdir, open, readFile, rename, unlink } from "node:fs/promises";

import {
  atomicReplaceFile,
  type AtomicFileSystem,
} from "./atomic-file-replacement.js";
import type { LocalJsonStateFileSystem } from "./json-state-file.js";

const nodeAtomicFileSystem: AtomicFileSystem = {
  open,
  rename,
  unlink,
};

export function createNodeLocalJsonStateFileSystem(): LocalJsonStateFileSystem {
  return {
    mkdir: (path, options) => mkdir(path, options),
    readFile: (path) => readFile(path, "utf8"),
    replaceFile: (options) =>
      atomicReplaceFile({ ...options, fileSystem: nodeAtomicFileSystem }),
  };
}
