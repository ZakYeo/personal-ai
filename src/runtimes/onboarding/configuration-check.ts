import type { PresentationIntegrationItem } from "../../ports/presentation.js";
import type { RuntimeConfigSource } from "../config/runtime-config-source.js";
import { inspectRuntimeConfiguration } from "./configuration-inspection.js";

export async function runConfigurationCheck(
  args: readonly string[],
  options: {
    load(configPath: string): Promise<RuntimeConfigSource>;
    verify(
      source: RuntimeConfigSource,
    ): Promise<readonly PresentationIntegrationItem[]>;
    writeLine(line: string): void;
    reportFailure(error: unknown): void;
  },
): Promise<number> {
  if (
    args[0] !== "--config" ||
    !args[1]?.trim() ||
    ![2, 3].includes(args.length) ||
    (args.length === 3 && args[2] !== "--verify")
  ) {
    options.writeLine(
      "Usage: npm run setup:check -- --config path/to/config.json [--verify]",
    );
    return 1;
  }
  try {
    const source = await options.load(args[1]);
    for (const line of inspectRuntimeConfiguration(source))
      options.writeLine(line);
    if (args[2] !== "--verify") return 0;
    const checks = await options.verify(source);
    for (const check of checks)
      options.writeLine(`${check.label}: ${check.status} · ${check.lastCheck}`);
    options.writeLine(
      "Checks cover the displayed read surfaces, not sends, write permissions, or speech quality.",
    );
    return checks.some((check) => check.status === "degraded") ? 1 : 0;
  } catch (error) {
    options.reportFailure(error);
    options.writeLine(
      "Setup checks could not finish. Check the selected config, state-directory access, and integration credentials, then retry.",
    );
    return 1;
  }
}
