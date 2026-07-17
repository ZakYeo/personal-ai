import { mkdir } from "node:fs/promises";

import { runCommand } from "../../adapters/desktop/process-runner.js";

await mkdir(".voice-benchmark/bin", { mode: 0o700, recursive: true });
await runCommand({
  args: [
    "-std=c++17",
    "-O2",
    "-D_GLIBCXX_USE_CXX11_ABI=0",
    "-I.voice-benchmark/install/sherpa-onnx-v1.13.2-x64/include",
    "scripts/voice-benchmark/sherpa-vits-stdin.cc",
    "-L.voice-benchmark/install/sherpa-onnx-v1.13.2-x64/lib",
    "-lsherpa-onnx-cxx-api",
    "-lsherpa-onnx-c-api",
    "-Wl,-rpath,.voice-benchmark/install/sherpa-onnx-v1.13.2-x64/lib",
    "-o",
    ".voice-benchmark/bin/sherpa-vits-stdin",
  ],
  command: "/usr/bin/c++",
  environment: {},
  timeoutMs: 30_000,
});
process.stdout.write(".voice-benchmark/bin/sherpa-vits-stdin\n");
