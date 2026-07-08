# Personal AI

Local-first personal assistant built with TypeScript, deterministic adapters, and
a ports-and-adapters architecture.

Personal AI is intended to become a private, voice-activated assistant that runs
on a desktop first and can later be deployed to a Raspberry Pi. The current
implementation keeps behavior deterministic with mock providers and local
adapters so the core, runtimes, features, and dependency boundaries can be tested
without external services.

## Status

Implemented today:

- Configured text CLI runtime with deterministic behavior by default.
- Mock voice loop for one simulated voice turn.
- Desktop voice runtime for one configured local voice turn.
- Desktop voice service command for always-listening wake activation with
  local openWakeWord activation, live command transcript progress, and
  streaming speech playback.
- Neutral service runtime boundary baseline implemented in preparation for
  Milestone 5.1.
- Raspberry Pi service command that runs configured command-based voice turns in
  a long-running service loop.
- Config-driven adapter selection for intent, features, and voice components.
- Explicit nested feature adapter registration for mock/local feature adapters.
- Focused runtime config resolvers for assistant policy, intent providers,
  conversation providers, voice adapter IDs, and desktop voice command settings.
- Opt-in OpenAI intent and conversation adapters behind the existing ports.
- Opt-in Google Calendar adapter behind the calendar search port.
- Provider adapter contract helpers for deterministic credentials, transport,
  provider response, timeout, and diagnostic tests.
- Mock calendar and messaging features.
- Local alarm feature backed by an adapter-owned store.
- Runtime fallback handling that keeps human-facing responses safe while logging
  diagnostics internally.
- Runtime-owned cleanup for desktop voice capture and speech temp files.
- Architecture, linting, formatting, spellcheck, secret scanning, duplication,
  unused-code, typecheck, test, and binary validation scripts.

See the [implementation roadmap](docs/06-implementation-roadmap.md) for
milestones, completed work, and planned persistent-state, Raspberry Pi
operations, and additional provider work.

Current roadmap position:

- Milestones 1 through 5.4 are implemented in the repository, including the
  deterministic text assistant, safety pipeline, harness hardening, tooling,
  mock and desktop voice runtimes, OpenAI intent routing, Google Calendar
  search, the neutral service runtime, the Raspberry Pi service command, opt-in
  Raspberry Pi OS QEMU smoke support, and desktop voice service activation.
- The next planned product milestone is persistent local assistant state,
  starting with a file-backed alarm store behind the existing `AlarmStore` port.
- Raspberry Pi `systemd` installation notes and additional real providers are
  planned follow-up milestones, not part of the default deterministic validation
  gate.

## Requirements

- Node.js 22 or newer.
- npm 10 or newer.

Desktop voice experiments also need local audio commands configured in a local
config file. The default OpenAI desktop voice config uses openWakeWord for local
`"hey jarvis"` activation and streams only post-wake command audio to OpenAI
realtime transcription. See the [runtime plan](docs/04-runtime-plan.md) for the
desktop voice config shape. The checked-in default config expects the
OpenWakeWord Python dependency in `.venv`; run `npm run setup:openwakeword` or
source `scripts/setup-openwakeword-venv.sh` before `npm start`.
Raspberry Pi service experiments use the same explicit command-based voice
configuration and can start from `config/pi-voice-openai.example.json`.

OpenAI intent and conversation experiments need a local config file that
selects `intent.provider: "openai"` and, for general Q&A, selects
`conversation.provider: "openai"`. API keys are read from the configured
environment variable. Do not store API keys in repository config files.
The development CLI loads `.env` when present with Node's
`--env-file-if-exists` support. The opt-in OpenAI E2E test also loads `.env`;
both use the `OPENAI_API_KEY` variable name.

Google Calendar experiments need a local config file that selects
`features.calendar.adapter: "google"` and an OAuth access token in the
configured environment variable. Do not store Google tokens in repository
config files.

## Quick Start

Install dependencies:

```bash
npm install
```

Configure the repository Git hooks:

```bash
git config core.hooksPath .githooks
```

Set up the local OpenWakeWord Python environment for the default desktop voice
service:

```bash
npm run setup:openwakeword
```

To leave the venv active in your current shell, source the setup script instead:

```bash
source scripts/setup-openwakeword-venv.sh
```

Run the default deterministic CLI:

```bash
npm run cli -- ask "Hey Jarvis, list my alarms"
```

Start the default desktop OpenAI voice service:

```bash
npm start
```

Voice service commands write progress logs to stdout, including wake listening,
wake detection, live transcript deltas, recognized command text, and the
assistant response. Internal diagnostics and adapter failures stay on stderr.
The default OpenAI desktop voice config routes casual questions such as
`"Hey Jarvis, how are you today?"` to the OpenAI conversation provider after
wake activation, keeps one in-memory chat window for the running assistant
instance, and compacts chat history after 5 completed user/assistant turns.

Run the opt-in desktop voice OpenAI smoke test:

```bash
npm run smoke:desktop-voice:openai
```

This command loads `.env`, requires `OPENAI_API_KEY`, uses the committed voice
fixtures in `test/fixtures/audio/`, runs local openWakeWord activation for
`"Hey Jarvis"`, and streams a file-fed `List my alarms` command through the
OpenAI realtime transcription adapter over an authenticated websocket. It also
exercises the assistant turn and streaming spoken-output path. It is
intentionally outside `npm run check` and guards the same post-wake path used by
`npm start` without depending on room acoustics or a live microphone.

Run one simulated voice turn:

```bash
npm run cli -- voice-once --utterance "Hey Jarvis, list my alarms"
```

Run one configured desktop voice turn:

```bash
npm run cli -- desktop-voice-once --config path/to/desktop-config.json
```

Run the committed deterministic desktop voice demo config:

```bash
npm run cli -- desktop-voice-once --config config/desktop-voice-demo.json
```

Run the always-listening desktop voice service with local command-based voice
config:

```bash
npm run cli -- desktop-voice-service --config path/to/desktop-config.json
```

Run the Raspberry Pi service loop with local command-based voice config:

```bash
npm run cli -- pi-service --config path/to/pi-config.json
```

Run an optional ARM64 Linux container smoke check for Pi-like userland
compatibility:

```bash
docker run --rm --platform linux/arm64 \
  -v "$PWD":/workspace -w /workspace node:22-bookworm-slim \
  sh -lc "npm ci && npm run build && npm run cli -- ask 'Hey Jarvis, list my alarms'"
```

On non-ARM hosts, Docker may need QEMU/binfmt enabled first:

```bash
docker run --privileged --rm tonistiigi/binfmt --install arm64
```

This is a compatibility smoke check, not full Raspberry Pi hardware simulation.

Print an opt-in Raspberry Pi OS QEMU smoke command:

```bash
npm run smoke:pi:qemu -- \
  --config path/to/pi-config.json \
  --image path/to/raspios.img \
  --kernel path/to/kernel8.img \
  --dtb path/to/bcm2710-rpi-3-b-plus.dtb
```

This command validates the local config, image, kernel, DTB, and QEMU binary,
then prints the QEMU command plus the `pi-service` command to run after the
guest boots. Add `--run` to spawn QEMU. This smoke path is opt-in, requires
operator-provided Raspberry Pi OS artifacts, and is not part of `npm run check`.

Run the CLI with a local OpenAI intent config:

```bash
npm run cli -- ask --config path/to/openai-config.json "Hey Jarvis, list my alarms"
```

Run the CLI with a local OpenAI conversation config:

```bash
npm run cli -- ask --config path/to/openai-config.json "Hey Jarvis, how are you today?"
```

Run the live OpenAI intent routing E2E test:

```bash
npm run test:e2e:openai
```

This command is opt-in, calls the live OpenAI Responses API, covers routing for
the currently enabled feature capabilities, uses `gpt-5.4-nano`, and may
consume API quota. It is not part of `npm run check`; normal validation remains
deterministic and network-free.

Run the CLI with a local Google Calendar feature config:

```bash
GOOGLE_CALENDAR_ACCESS_TOKEN=... npm run cli -- ask --config path/to/google-calendar-config.json "Hey Jarvis, check my calendar for the upcoming wedding"
```

## Scripts

Common development commands:

- `npm test` - run Vitest in watch mode.
- `npm run test:run` - run Vitest once.
- `npm run test:file -- path/to/file.test.ts` - run one focused Vitest file.
- `npm run test:e2e:openai` - run the opt-in live OpenAI intent routing E2E test.
- `npm run test:coverage` - run Vitest once with V8 coverage thresholds.
- `npm run lint` - run ESLint.
- `npm run format:check` - check Prettier formatting.
- `npm run typecheck` - run TypeScript without emitting files.
- `npm run build` - compile production JavaScript.
- `npm run setup:openwakeword` - create or update `.venv` with the Python
  `openwakeword` dependency used by the default desktop voice service.
- `npm start` - run the default desktop OpenAI voice service with
  `config/local-desktop-voice-openai.json`; progress logs are written to
  stdout.
- `npm run smoke:desktop-voice:openai` - run the opt-in file-fed desktop voice
  smoke against local openWakeWord and live OpenAI realtime transcription.
- `npm run cli -- desktop-voice-once --config config/desktop-voice-demo.json` -
  run the committed command-based desktop voice demo.
- `npm run cli -- desktop-voice-service --config path/to/desktop-config.json` -
  run the always-listening desktop voice service loop.
- `npm run cli -- pi-service --config path/to/pi-config.json` - run the
  Raspberry Pi service loop.
- `npm run smoke:pi:qemu -- --config path/to/pi-config.json --image path/to/raspios.img --kernel path/to/kernel8.img --dtb path/to/pi.dtb` -
  print an opt-in Raspberry Pi OS QEMU smoke command.
- `npm run architecture:check` - enforce dependency boundaries.
- `npm run check` - run the full validation suite.

Additional hygiene scripts are available in `package.json`, including package
sorting, Markdown linting, spellcheck, secret scanning, unused-code checks,
duplication checks, and CLI binary validation.

## Documentation

The files in `docs/` are the source of truth for implementation decisions:

- [Product Vision](docs/01-product-vision.md) - goals, non-goals, and product
  principles.
- [Architecture](docs/02-architecture.md) - ports-and-adapters structure,
  modules, ports, adapters, and runtime responsibilities.
- [Boundaries and Rules](docs/03-boundaries-and-rules.md) - dependency rules,
  failure handling, safety defaults, harness standards, and tooling policy.
- [Runtime Plan](docs/04-runtime-plan.md) - CLI, voice, desktop voice,
  configuration, lifecycle, and fallback behavior.
- [Feature Plugin Model](docs/05-feature-plugin-model.md) - feature and
  capability authoring model.
- [Implementation Roadmap](docs/06-implementation-roadmap.md) - milestones,
  acceptance criteria, and current implementation status.

## Development Workflow

This repository has a GitHub remote configured. Push normal completed slices
after the local hooks pass.

Work is delivered in thin, committable TDD slices:

1. Write or update the focused failing test first.
2. Implement the smallest code and documentation change that passes.
3. Run the relevant validation.
4. Commit the singular slice.

Use the personal Git identity from `/home/zak/personal/.gitconfig-personal` for
commits in this repository.

The pre-commit hook runs staged formatting/lint fixes plus lightweight
repository checks. The pre-push hook is the full confidence gate through
`npm run check`.

Keep `README.md`, `AGENTS.md`, and the relevant `docs/` files aligned whenever
behavior, architecture, tooling, or workflow changes.
