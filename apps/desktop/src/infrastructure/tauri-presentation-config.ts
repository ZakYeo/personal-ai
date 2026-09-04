import { invoke, isTauri } from "@tauri-apps/api/core";

interface PresentationConnectionConfig {
  readonly endpoint: string;
  readonly token: string;
}

export async function loadPresentationConnectionConfig(
  options: {
    readonly invokeCommand?: (command: string) => Promise<unknown>;
    readonly isTauriRuntime?: () => boolean;
  } = {},
): Promise<PresentationConnectionConfig | undefined> {
  const isRuntime = options.isTauriRuntime ?? isTauri;
  if (!isRuntime()) return;
  const invokeRuntime = options.invokeCommand ?? invoke;
  return parsePresentationConnectionConfig(
    await invokeRuntime("presentation_connection_config"),
  );
}

export function loadBrowserTestPresentationConfig(): PresentationConnectionConfig | null {
  if (import.meta.env.MODE !== "test") return null;
  const environment: unknown = import.meta.env;
  if (!isRecord(environment)) return null;
  return parsePresentationConnectionConfig({
    endpoint: environment.VITE_PRESENTATION_ENDPOINT,
    token: environment.VITE_PRESENTATION_TOKEN,
  });
}

function parsePresentationConnectionConfig(
  value: unknown,
): PresentationConnectionConfig {
  if (
    !isRecord(value) ||
    !hasExactKeys(value, ["endpoint", "token"]) ||
    typeof value.endpoint !== "string" ||
    typeof value.token !== "string"
  ) {
    throw new Error(
      "Desktop presentation connection configuration is invalid.",
    );
  }
  return Object.freeze({ endpoint: value.endpoint, token: value.token });
}

function hasExactKeys(value: Record<string, unknown>, keys: readonly string[]) {
  return Object.keys(value).every((key) => keys.includes(key));
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
