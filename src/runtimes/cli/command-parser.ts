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
  const parsed = parseCommandOptions(args, {
    allowPositionals: true,
    flags: ["config"],
  });

  if (!parsed || parsed.positionals.length === 0) {
    return undefined;
  }

  return {
    kind: "ask",
    commandText: parsed.positionals.join(" "),
    ...(parsed.configPath ? { configPath: parsed.configPath } : {}),
  };
}

export function parseVoiceCommand(
  args: string[],
): ParsedVoiceCommand | undefined {
  const parsed = parseCommandOptions(args, {
    allowPositionals: false,
    flags: ["config", "utterance"],
  });

  if (!parsed) {
    return undefined;
  }

  return {
    kind: "voice-once",
    ...(parsed.configPath ? { configPath: parsed.configPath } : {}),
    ...(parsed.utterance ? { utterance: parsed.utterance } : {}),
  };
}

export function parseDesktopVoiceCommand(
  args: string[],
): ParsedVoiceCommand | undefined {
  const parsed = parseCommandOptions(args, {
    allowPositionals: false,
    flags: ["config"],
  });

  if (!parsed) {
    return undefined;
  }

  return {
    kind: "desktop-voice-once",
    ...(parsed.configPath ? { configPath: parsed.configPath } : {}),
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
  const parsed = parseCommandOptions(args, {
    allowPositionals: false,
    flags: ["config"],
  });

  if (!parsed?.configPath) {
    return undefined;
  }

  return {
    configPath: parsed.configPath,
    kind,
  };
}

type CommandFlag = "config" | "utterance";

interface ParsedCommandOptions {
  configPath?: string;
  positionals: string[];
  utterance?: string;
}

function parseCommandOptions(
  args: string[],
  options: {
    allowPositionals: boolean;
    flags: CommandFlag[];
  },
): ParsedCommandOptions | undefined {
  let configPath: string | undefined;
  let utterance: string | undefined;
  const positionals: string[] = [];

  for (let index = 1; index < args.length; index += 1) {
    const arg = args[index];

    if (arg === undefined) {
      return undefined;
    }

    if (arg === "--config" && options.flags.includes("config")) {
      const nextArg = args[index + 1];

      if (!nextArg) {
        return undefined;
      }

      configPath = nextArg;
      index += 1;
    } else if (arg === "--utterance" && options.flags.includes("utterance")) {
      const nextArg = args[index + 1];

      if (!nextArg) {
        return undefined;
      }

      utterance = nextArg;
      index += 1;
    } else if (options.allowPositionals && arg) {
      positionals.push(arg);
    } else if (options.allowPositionals) {
      continue;
    } else {
      return undefined;
    }
  }

  return {
    ...(configPath ? { configPath } : {}),
    positionals,
    ...(utterance ? { utterance } : {}),
  };
}
