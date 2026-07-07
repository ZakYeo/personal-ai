import {
  runAskCommand,
  runDesktopVoiceServiceCommand,
  runPiServiceCommand,
  runVoiceCommand,
} from "./command-handlers.js";
import {
  parseAskCommand,
  parseDesktopVoiceCommand,
  parseDesktopVoiceServiceCommand,
  parsePiServiceCommand,
  parseVoiceCommand,
  type ParsedCliCommand,
} from "./command-parser.js";
import type { CliDependencies, CliIo } from "./types.js";

interface CliCommandDefinition<TCommand extends ParsedCliCommand> {
  name: TCommand["kind"];
  parse(args: string[]): TCommand | undefined;
  run(
    parsed: TCommand,
    io: CliIo,
    dependencies: CliDependencies,
  ): Promise<number>;
  usage: string;
}

type AnyCliCommandDefinition = CliCommandDefinition<ParsedCliCommand>;

const cliCommands = [
  {
    name: "ask",
    parse: parseAskCommand,
    run: runAskCommand,
    usage: 'personal-ai ask [--config path/to/config.json] "command text"',
  },
  {
    name: "voice-once",
    parse: parseVoiceCommand,
    run: runVoiceCommand,
    usage:
      'personal-ai voice-once [--config path/to/config.json] [--utterance "spoken command"]',
  },
  {
    name: "desktop-voice-once",
    parse: parseDesktopVoiceCommand,
    run: runVoiceCommand,
    usage: "personal-ai desktop-voice-once [--config path/to/config.json]",
  },
  {
    name: "desktop-voice-service",
    parse: parseDesktopVoiceServiceCommand,
    run: runDesktopVoiceServiceCommand,
    usage:
      "personal-ai desktop-voice-service --config path/to/desktop-config.json",
  },
  {
    name: "pi-service",
    parse: parsePiServiceCommand,
    run: runPiServiceCommand,
    usage: "personal-ai pi-service --config path/to/pi-config.json",
  },
] satisfies AnyCliCommandDefinition[];

export async function runCliCommand(
  args: string[],
  io: CliIo,
  dependencies: CliDependencies,
): Promise<number> {
  const command = findCliCommand(args[0]);
  const parsed = command?.parse(args);

  if (!command || !parsed) {
    io.stderr.write(`${usage()}\n`);
    return 1;
  }

  return command.run(parsed, io, dependencies);
}

function usage(): string {
  return cliCommands
    .map(
      (command, index) =>
        `${index === 0 ? "Usage: " : "       "}${command.usage}`,
    )
    .join("\n");
}

function findCliCommand(
  commandName: string | undefined,
): AnyCliCommandDefinition | undefined {
  return cliCommands.find((command) => command.name === commandName);
}
