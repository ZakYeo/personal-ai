import { humanizeSpokenText } from "../../application/human-text.js";
import { resolveConfiguredRuntimeConfigSource } from "../config/runtime-config-source.js";
import { createConfiguredFeatureSelection } from "../feature-adapter-selection.js";
import { logRuntimeFailure } from "../human-boundary.js";
import { readPresentationProjection } from "../presentation/presentation-projection-reader.js";
import { awaitAbortableOperation } from "../abortable-operation.js";
import { runConfigurationCheck } from "./configuration-check.js";

const shutdown = new AbortController();
const stop = () => shutdown.abort(new Error("Setup check interrupted."));
const signal = AbortSignal.any([shutdown.signal, AbortSignal.timeout(30_000)]);
const now = () => new Date();
const reportFailure = (error: unknown) =>
  logRuntimeFailure(error, { stderr: process.stderr });
const fetch: typeof globalThis.fetch = (input, init) => {
  const inputSignal =
    init?.signal ?? (input instanceof Request ? input.signal : undefined);
  return globalThis.fetch(input, {
    ...init,
    signal: inputSignal ? AbortSignal.any([signal, inputSignal]) : signal,
  });
};
process.once("SIGINT", stop);
process.once("SIGTERM", stop);
try {
  process.exitCode = await runConfigurationCheck(process.argv.slice(2), {
    load: (configPath) =>
      resolveConfiguredRuntimeConfigSource({
        configPath,
        env: process.env,
        fetch,
      }),
    reportFailure,
    verify: async ({ config }) => {
      const { services } = createConfiguredFeatureSelection(config, {
        runtime: { clock: { now } },
      });
      const projection = await awaitAbortableOperation(
        readPresentationProjection({
          config,
          services,
          now: now(),
          projectProfile: () => [],
          reportFailure,
        }),
        signal,
      );
      return projection.integrations;
    },
    writeLine: (line) =>
      process.stdout.write(
        `${humanizeSpokenText(line, { now: now(), timeZone: "UTC", assistantTimeZone: "UTC" })}\n`,
      ),
  });
} finally {
  stop();
  process.removeListener("SIGINT", stop);
  process.removeListener("SIGTERM", stop);
}
