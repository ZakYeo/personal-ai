import { mkdir, open, rename, unlink } from "node:fs/promises";

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
    readFile: readBoundedUtf8File,
    replaceFile: (options) =>
      atomicReplaceFile({ ...options, fileSystem: nodeAtomicFileSystem }),
  };
}

async function readBoundedUtf8File(
  path: string,
  options: { maxBytes: number },
): Promise<string> {
  const file = await open(path, "r");
  try {
    const metadata = await file.stat();
    if (metadata.size > options.maxBytes) {
      throw stateFileTooLarge(options.maxBytes);
    }

    const decoder = new TextDecoder();
    let bytesReadTotal = 0;
    let contents = "";
    while (true) {
      const remainingWithOverflowByte = options.maxBytes - bytesReadTotal + 1;
      const buffer = Buffer.allocUnsafe(
        Math.min(64 * 1024, remainingWithOverflowByte),
      );
      const { bytesRead } = await file.read(buffer, 0, buffer.byteLength, null);
      if (bytesRead === 0) {
        return contents + decoder.decode();
      }

      bytesReadTotal += bytesRead;
      if (bytesReadTotal > options.maxBytes) {
        throw stateFileTooLarge(options.maxBytes);
      }
      contents += decoder.decode(buffer.subarray(0, bytesRead), {
        stream: true,
      });
    }
  } finally {
    await file.close();
  }
}

function stateFileTooLarge(maxBytes: number): Error {
  return new Error(`Local JSON state file exceeds ${maxBytes} bytes.`);
}
