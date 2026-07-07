export interface ParsedAskCommand {
  kind: "ask";
  commandText: string;
  configPath?: string;
}

export interface ParsedVoiceCommand {
  kind: "desktop-voice-once" | "voice-once";
  configPath?: string;
  utterance?: string;
}

export interface ParsedPiServiceCommand {
  kind: "pi-service";
  configPath: string;
}

export interface ParsedDesktopVoiceServiceCommand {
  kind: "desktop-voice-service";
  configPath: string;
}

export type ParsedCliCommand =
  | ParsedAskCommand
  | ParsedDesktopVoiceServiceCommand
  | ParsedPiServiceCommand
  | ParsedVoiceCommand;

export type ParsedVoiceServiceCommand =
  | ParsedDesktopVoiceServiceCommand
  | ParsedPiServiceCommand;

export function parseAskCommand(args: string[]): ParsedAskCommand | undefined {
  const commandParts: string[] = [];
  let configPath: string | undefined;

  for (let index = 1; index < args.length; index += 1) {
    const arg = args[index];

    if (arg === "--config") {
      const nextArg = args[index + 1];

      if (!nextArg) {
        return undefined;
      }

      configPath = nextArg;
      index += 1;
    } else if (arg) {
      commandParts.push(arg);
    }
  }

  if (commandParts.length === 0) {
    return undefined;
  }

  return {
    kind: "ask",
    commandText: commandParts.join(" "),
    ...(configPath ? { configPath } : {}),
  };
}

export function parseVoiceCommand(
  args: string[],
): ParsedVoiceCommand | undefined {
  let configPath: string | undefined;
  let utterance: string | undefined;

  for (let index = 1; index < args.length; index += 1) {
    const arg = args[index];

    if (arg === "--config") {
      const nextArg = args[index + 1];

      if (!nextArg) {
        return undefined;
      }

      configPath = nextArg;
      index += 1;
    } else if (arg === "--utterance") {
      const nextArg = args[index + 1];

      if (!nextArg) {
        return undefined;
      }

      utterance = nextArg;
      index += 1;
    } else {
      return undefined;
    }
  }

  return {
    kind: "voice-once",
    ...(configPath ? { configPath } : {}),
    ...(utterance ? { utterance } : {}),
  };
}

export function parseDesktopVoiceCommand(
  args: string[],
): ParsedVoiceCommand | undefined {
  const configPath = parseOptionalConfigPath(args);

  if (configPath === false) {
    return undefined;
  }

  return {
    kind: "desktop-voice-once",
    ...(configPath ? { configPath } : {}),
  };
}

export function parsePiServiceCommand(
  args: string[],
): ParsedPiServiceCommand | undefined {
  return parseRequiredConfigCommand(args, "pi-service");
}

export function parseDesktopVoiceServiceCommand(
  args: string[],
): ParsedDesktopVoiceServiceCommand | undefined {
  return parseRequiredConfigCommand(args, "desktop-voice-service");
}

function parseRequiredConfigCommand<
  TKind extends
    | ParsedPiServiceCommand["kind"]
    | ParsedDesktopVoiceServiceCommand["kind"],
>(
  args: string[],
  kind: TKind,
): { configPath: string; kind: TKind } | undefined {
  const configPath = parseOptionalConfigPath(args);

  if (!configPath) {
    return undefined;
  }

  return {
    configPath,
    kind,
  };
}

function parseOptionalConfigPath(args: string[]): string | false | undefined {
  let configPath: string | undefined;

  for (let index = 1; index < args.length; index += 1) {
    const arg = args[index];

    if (arg === "--config") {
      const nextArg = args[index + 1];

      if (!nextArg) {
        return false;
      }

      configPath = nextArg;
      index += 1;
    } else {
      return false;
    }
  }

  return configPath;
}
