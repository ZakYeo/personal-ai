# Personal AI

Local-first personal assistant built with TypeScript, deterministic adapters, and
a ports-and-adapters architecture.

Personal AI is a private, voice-activated assistant that runs on a desktop and
has a dedicated Raspberry Pi service runtime. The checked-in default remains
deterministic with mock providers and local adapters, while opt-in OpenAI and
Google Calendar integrations exercise real provider paths without making normal
validation depend on external services.

## Status

Implemented today:

- Configured text CLI runtime with deterministic behavior by default.
- Mock voice loop for one simulated voice turn.
- Desktop voice runtime for one configured local voice turn.
- Desktop voice service command for always-listening wake activation with
  local openWakeWord activation, live command transcript progress, and
  streaming speech playback. If a response explicitly asks for a reply, the
  service captures the next utterance without requiring the wake phrase again.
- Neutral service runtime boundary for long-running startup, retry, signal, and
  shutdown behavior.
- Raspberry Pi service command that runs configured command-based voice turns in
  a long-running service loop.
- Tested Raspberry Pi systemd deployment using a dedicated service account,
  stable application/config/state paths, restart policy, and operator guidance.
- Config-driven adapter selection for intent, features, and voice components.
- Explicit nested feature adapter registration whose selected entries parse,
  retain, construct, and preflight their own typed adapter configuration.
- Focused runtime config resolvers for assistant policy, intent providers,
  conversation providers, response rewriters, voice adapter IDs, and desktop
  voice command settings.
- Provider-neutral desktop streaming voice selections whose registry entries
  parse and capture their own typed provider config, constructor, and
  provider-specific test dependencies.
- Extensible intent, conversation, and response-rewriter provider entries that
  parse selected provider config and capture neutral factories during runtime
  config loading.
- Opt-in OpenAI intent and conversation adapters behind the existing ports.
- Bounded compound command plans that validate every step before execution,
  aggregate exact confirmation for risky actions, execute sequentially, and
  report succeeded, failed, and skipped steps without exposing diagnostics.
- Opt-in OpenAI command response rewriter for spoken-friendly command answers.
- Shared OpenAI Responses configuration parsing with provider-local config
  types rather than provider details in application ports.
- Shared labeled OpenAI Responses transport policy for credentials, JSON POSTs,
  timeouts, provider failures, and malformed responses.
- Opt-in Google Calendar adapter behind the calendar search and upcoming-events
  port, with a three-month default upcoming window and refresh-token OAuth
  support.
- Read-only calendar result follow-ups using one assistant-owned set of up to
  ten opaque references, deterministic expiry, safe OpenAI grounding, stable
  Google event lookup, and no-wake voice continuation.
- Provider adapter contract helpers for deterministic credentials, transport,
  provider response, timeout, and diagnostic tests.
- Mock calendar and messaging features.
- Local alarm feature backed by an adapter-owned store, durable lifecycle
  state, runtime-owned scheduling, and configured voice delivery.
- Built-in assistant capability catalog feature for listing and describing the
  currently enabled capabilities from feature metadata, with concise spoken
  summaries for normal voice answers.
- Runtime fallback handling that keeps human-facing responses safe while logging
  diagnostics internally.
- Runtime-owned cleanup for desktop voice capture and speech temp files.
- Architecture, linting, formatting, spellcheck, secret scanning, duplication,
  unused-code, typecheck, test, and binary validation scripts.

See the [implementation roadmap](docs/06-implementation-roadmap.md) for
milestones, completed work, and planned capability and provider work.

Current roadmap position:

- Milestones 1 through 7 are implemented in the repository, including the
  deterministic text assistant, safety pipeline, harness hardening, tooling,
  mock and desktop voice runtimes, OpenAI intent routing, Google Calendar
  search, the neutral service runtime, the Raspberry Pi service command, opt-in
  Raspberry Pi OS QEMU smoke support, desktop voice service activation, and a
  JSON-file-backed alarm store with consistent runtime path resolution, and the
  tested Raspberry Pi systemd deployment path. Milestone 8 is implemented after
  its required independent maintainability review; it adds runtime-owned alarm
  scheduling and desktop/Pi voice delivery.
- Milestone 8.1 is implemented after its required independent maintainability
  review. It adds snooze, daily and weekly recurrence, rescheduling, label
  editing, human-facing lifecycle status, and 30-day terminal-history
  retention. Spike 9 is implemented, and every finding from its required
  independent review is addressed. Milestone 10 is implemented after its
  independent maintainability review, adding bounded compound command plans,
  whole-plan validation, aggregate confirmation, ordered execution, and smoke
  coverage across text and voice runtimes. Milestone 11 is implemented after
  its required independent review, with bounded process-local calendar
  references and read-only detail lookup. The
  [discovery report](docs/08-spike-9-report.md) makes compound command plans the
  first post-spike milestone, followed by calendar result follow-ups, measured
  local voice, target-specific messaging, and a benchmarked local intent
  provider. Real providers and hardware validation remain opt-in work outside
  the default deterministic validation gate.

## Requirements

- Node.js 22 or newer.
- npm 10 or newer.

Desktop voice experiments also need local audio commands configured in a local
config file. The default OpenAI desktop voice config uses openWakeWord for local
`"hey jarvis"` activation and streams only post-wake command audio to OpenAI
realtime transcription. See the [runtime plan](docs/04-runtime-plan.md) for the
desktop voice config shape. The checked-in default config expects the
OpenWakeWord Python dependency in `.venv`; run `npm run setup:openwakeword` or
source `scripts/setup-openwakeword-venv.sh` before `npm start`. Setup passes the
committed, fully pinned `scripts/openwakeword-requirements.lock` to pip so the
same checkout resolves the same Python dependency versions. The checked-in
desktop config passes `--threshold 0.25` to the listener for more sensitive
local wake activation; tune that value if your room or microphone needs a
different false-wake tradeoff.
The default desktop command capture uses SoX silence detection after wake
activation so recording stops shortly after trailing silence while retaining an
eight-second maximum capture guard.
Raspberry Pi service experiments use the same explicit command-based voice
configuration and can start from `config/pi-voice-openai.example.json`.

OpenAI intent and conversation experiments need a local config file that
selects `intent.provider: "openai"` and, for general Q&A, selects
`conversation.provider: "openai"`. API keys are read from the configured
environment variable. Do not store API keys in repository config files.
The development CLI loads `.env` when present with Node's
`--env-file-if-exists` support. The opt-in OpenAI E2E test also loads `.env`;
both use the `OPENAI_API_KEY` variable name.

The default desktop OpenAI voice service config used by `npm start` selects the
Google Calendar adapter and OpenAI response rewriter. Google Calendar access
requires local OAuth credentials in `.env`: `GOOGLE_CALENDAR_CLIENT_ID`,
`GOOGLE_CALENDAR_CLIENT_SECRET`, and `GOOGLE_CALENDAR_REFRESH_TOKEN`. If you
already have the client ID and secret, run `npm run setup:google-calendar` to
approve read-only calendar access and print the refresh-token line to add to
`.env`. `npm start` fails before listening when Google Calendar is selected and
the required token setup is missing, with a message pointing back to that setup
command. If Google shows "Access blocked" because the app has not completed
verification, open the matching Google Cloud project, go to Google Auth
Platform > Audience, and add your Google account under Test users before running
the setup command again. Do not store Google tokens in repository config files.
Generic upcoming calendar requests default to a 92-day window through
`features.calendar.upcomingWindowDays`, which prevents long-running recurring
events from filling normal spoken answers.
Deterministic calendar text preserves exact ISO provider dates. The optional
response rewriter owns conversational surrounding wording, while core protects
every displayed event title and date and restores nearby dates with deterministic
UTC phrases such as `today`, `tomorrow`, `this Friday the 17th`, or
`next Monday the 20th`. Protected event-local times use natural forms such as
`11am`; date-only events are identified as `all day`.

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
assistant response. `Ctrl+C` requests graceful shutdown and aborts active
command-backed wake activation, capture, or transcription input. Internal
diagnostics and adapter failures stay on stderr.
The default OpenAI desktop voice config routes casual questions such as
`"Hey Jarvis, how are you today?"` to the OpenAI conversation provider after
wake activation, keeps one in-memory chat window for the running assistant
instance, and compacts chat history after 5 completed user/assistant turns.
OpenAI conversation responses use structured JSON with safe text plus an
`expectsFollowUp` flag; when that flag is true, voice service runtimes listen
for the next reply without another wake word before returning to normal wake
listening.

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
Configured OpenAI streaming speech timeouts and service shutdown signals cover
both the initial request and streamed response body.
Successful smoke runs print a `Voice timing summary` with wake activation,
command stream setup, command transcription, assistant handling, speech output,
and total durations. These timings are diagnostic and provider-variable; recent
local end-to-end samples were roughly 6.0s to 8.4s total across realtime
transcription, intent routing, and streaming speech.

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

Spike 12 personal STT fixtures are captured incrementally on the target
microphone:

```bash
npm run benchmark:voice:capture -- --speaker primary
```

The guided command records only active phrase IDs that do not already have an
accepted recording, plays each take back, validates its PCM WAV structure and
signal, and requires explicit consent before promoting it into tracked corpus
history. Adding a capability adds new phrase IDs; it does not require recording
the existing commands again.

For a device deployment under systemd, follow the
[Raspberry Pi operations guide](docs/07-raspberry-pi-operations.md). It installs
the built CLI under `/opt/personal-ai`, operator config under
`/etc/personal-ai`, and persistent alarm state under `/var/lib/personal-ai`.

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
the currently enabled feature capabilities plus confirmed persistent-alarm
creation through the configured assistant, listing, and restart behavior, uses
`gpt-5.4-nano`, and may consume API quota.
Run `npm run test:e2e:openai:alarms` for only the persistent-alarm smoke. These
tests are not part of `npm run check`; normal validation remains deterministic
and network-free.
Run `npm run test:e2e:openai:plans` for the focused live compound calendar and
alarm plan smoke.
Run `npm run test:e2e:openai:pi` for the focused live alarm flow through Pi
service composition. It does not validate physical audio hardware.

Generate a local Google Calendar refresh token:

```bash
npm run setup:google-calendar
```

If the browser shows `Error 403: access_denied` with an "app is currently being
tested" message, the Google Cloud OAuth app is still in external testing mode.
Add the account you are approving, such as `zakyeomanson@gmail.com`, to Google
Auth Platform > Audience > Test users for the same project as
`GOOGLE_CALENDAR_CLIENT_ID`, then rerun the setup command.

Run the CLI with a local Google Calendar feature config:

```bash
npm run cli -- ask --config path/to/google-calendar-config.json "Hey Jarvis, what upcoming events do I have?"
```

Persist alarms by selecting the file adapter in a local config. The checked-in
default continues to use the deterministic in-memory adapter. Relative paths
resolve from the directory containing the selected config, as demonstrated by
`config/persistent-alarms.example.json`.

```json
{
  "features": {
    "alarms": {
      "enabled": true,
      "adapter": "file",
      "state": {
        "path": "state/alarms.json"
      },
      "confirmationRequiredCapabilities": ["alarm.create"]
    }
  }
}
```

The file store creates a missing state file on the first successful alarm
write. It synchronizes the temporary contents before atomic replacement and
synchronizes the containing directory before reporting success. Existing
state directories and files are created with private `0700` and `0600` modes.
Malformed or unsupported existing state fails safely: human-facing responses remain
generic while runtime diagnostics retain the underlying cause.

Long-running desktop and Pi voice services schedule enabled alarms through the
same store instance used by assistant commands. A due alarm is spoken through
the configured text-to-speech and audio-output adapters, then repeated once
after 60 seconds unless it is acknowledged or dismissed. On startup, alarms up
to 15 minutes overdue are delivered; older alarms are marked missed. Delivery
claims are persisted before audio output so an uncertain attempt is not replayed
after restart. Normal responses and alarm speech share a serialized output
session, while wake/input capture stays independent; alarm delivery constructs
only synthesis and playback adapters. Cancelling a scheduled alarm requires
confirmation. A ringing alarm can be snoozed, and scheduled or snoozed alarms
can be renamed or rescheduled without changing their ID. Rescheduling requires
confirmation; listing alarms describes each lifecycle state in human-facing
language.
Daily and weekly alarms require an explicit IANA timezone, retain their local
wall-clock time across daylight-saving changes, and atomically schedule their
next occurrence on the same alarm ID after acknowledgement, dismissal, final
delivery, or a missed occurrence. For nonexistent local times, the schedule
moves forward across the daylight-saving gap; for repeated local times, the
earlier occurrence is used.
Long-running services run terminal-history cleanup immediately at startup and
then daily. Completed, dismissed, cancelled, and missed records older than 30
days are removed through the same serialized store used by lifecycle commands;
active alarms and records exactly at the cutoff are retained.

## Scripts

Common development commands:

- `npm test` - run Vitest in watch mode.
- `npm run test:run` - run Vitest once.
- `npm run test:file -- path/to/file.test.ts` - run one focused Vitest file.
- `npm run test:e2e:openai` - run the opt-in live OpenAI intent routing E2E test.
- `npm run test:e2e:openai:alarms` - run the focused opt-in live OpenAI
  persistent-alarm smoke.
- `npm run test:e2e:openai:plans` - run the focused opt-in live OpenAI compound
  plan smoke.
- `npm run test:e2e:openai:calendar-followup` - run the focused opt-in live
  OpenAI plus Google Calendar result-follow-up smoke; requires a configured
  fixture query, expected title/location detail, and Google credentials.
- `npm run test:coverage` - run Vitest once with V8 coverage thresholds.
- `npm run lint` - run ESLint.
- `npm run format:check` - check Prettier formatting.
- `npm run typecheck` - run TypeScript without emitting files.
- `npm run build` - compile production JavaScript.
- `npm run benchmark:voice:capture -- --speaker primary` - capture only missing
  personal benchmark phrases through the target SoX microphone path.
- `npm run setup:google-calendar` - run the local OAuth loopback helper and
  print a `GOOGLE_CALENDAR_REFRESH_TOKEN` line for `.env`.
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
- `npm run test:e2e:openai:pi` - run the opt-in live OpenAI alarm flow through
  Pi service composition without physical audio hardware.
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
- [Raspberry Pi Operations](docs/07-raspberry-pi-operations.md) - systemd
  installation, permissions, logs, validation, upgrades, and rollback.

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
