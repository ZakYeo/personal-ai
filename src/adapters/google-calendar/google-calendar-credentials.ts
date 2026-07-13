import type { GoogleCalendarConfig } from "./google-calendar-config.js";
import { GoogleCalendarError } from "./google-calendar-error.js";

type GoogleCalendarCredentials =
  | { accessToken: string; kind: "access-token" }
  | {
      clientId: string;
      clientSecret: string;
      kind: "refresh-token";
      refreshToken: string;
    };

interface MissingCredential {
  envName: string;
  label: string;
}

interface ResolveGoogleCalendarCredentialsOptions {
  config: GoogleCalendarConfig;
  createMissingCredentialError?(credential: MissingCredential): Error;
  env: Record<string, string | undefined>;
}

export function resolveGoogleCalendarCredentials(
  options: ResolveGoogleCalendarCredentialsOptions,
): GoogleCalendarCredentials {
  const accessToken = options.env[options.config.accessTokenEnv];

  if (accessToken) {
    return { accessToken, kind: "access-token" };
  }

  return {
    clientId: requireCredential(options, "clientIdEnv", "client ID"),
    clientSecret: requireCredential(
      options,
      "clientSecretEnv",
      "client secret",
    ),
    kind: "refresh-token",
    refreshToken: requireCredential(
      options,
      "refreshTokenEnv",
      "refresh token",
    ),
  };
}

function requireCredential(
  options: ResolveGoogleCalendarCredentialsOptions,
  configKey: "clientIdEnv" | "clientSecretEnv" | "refreshTokenEnv",
  label: string,
): string {
  const envName = options.config[configKey];
  const value = options.env[envName];

  if (value) {
    return value;
  }

  throw (
    options.createMissingCredentialError?.({ envName, label }) ??
    new GoogleCalendarError(
      `Google Calendar ${label} environment variable ${envName} is not set.`,
    )
  );
}
