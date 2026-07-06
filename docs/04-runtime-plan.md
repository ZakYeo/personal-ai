# Runtime Plan

## Runtime Principle

The assistant core should not know where it is running.

Desktop, CLI, and Raspberry Pi execution should be represented as separate runtimes that compose the same core with different adapters.

## Runtime Types

### CLI Runtime

The CLI runtime is the first target.

It should:

- Accept text input.
- Load deterministic mock configuration.
- Invoke the assistant core.
- Print the assistant response.
- Use the assistant's diagnostic-aware outcome path and log internal diagnostics to stderr.
- Print a graceful failure response instead of exposing raw exceptions to the user.
- Support repeatable tests.

Example:

```bash
personal-ai ask "Hey Jarvis, set an alarm to ping me in 10 minutes"
```

### Desktop Voice Runtime

The desktop voice runtime is the first voice target.

It should:

- Listen through the local computer microphone.
- Detect or simulate the wake phrase.
- Convert speech to text.
- Send normalized text to the assistant core.
- Speak or print the response.
- Speak a graceful fallback response when command handling fails.
- Fall back to text/log output if text-to-speech or audio output fails.
- Use command-based desktop adapters before adding native audio libraries or
  provider SDKs.

Milestone 2 starts with a deterministic mock voice loop exposed through:

```bash
personal-ai voice-once --utterance "Hey Jarvis, list my alarms"
```

This command simulates one voice turn with mock audio input, wake detection,
speech-to-text, text-to-speech, and audio output adapters. It still composes the
same assistant core as the text CLI. Missing wake phrases are ignored
deterministically, assistant diagnostics are logged internally, command handling
failures produce the safe fallback response, and speech output failures fall
back to text output. Successful simulated speech is reported separately from
fallback text output so CLI text printing does not depend on audio adapter side
effects. The voice runtime must require configured adapter IDs for every voice
adapter slot it composes; mock adapters are selected by explicit `mock` IDs,
not by absent configuration.

Milestone 3 adds a one-turn desktop voice runtime exposed through:

```bash
personal-ai desktop-voice-once --config path/to/desktop-config.json
```

This command composes the same assistant core with configured desktop voice
adapters. The first desktop adapter set is dependency-light: `sox-rec` records
audio through a configured command, `command` STT reads transcript text from
stdout, `text-prefix` detects wake phrases from transcript text, `command` TTS
writes synthesized audio through a configured command, and `sox-play` plays the
synthesized file through a configured command. Runtime failures preserve
diagnostics internally and produce the same safe CLI/voice fallback behavior as
the mock voice loop.
Temporary capture and speech files are owned by runtime composition, not by the
desktop command adapters. The runtime provides a temp-file owner to adapters and
cleans up files after each turn while logging cleanup failures internally.
The repository includes `config/desktop-voice-demo.json` as a deterministic
command-based smoke config for this path. It uses shell commands to simulate
capture, STT, TTS, and audio output so it is safe to commit and does not depend
on local microphone, provider, or credential setup. Audible real voice still
belongs in operator-owned local config with machine-specific STT/TTS/audio
commands.

Shared voice-turn orchestration, voice result metadata, and fallback semantics
belong in neutral voice runtime modules. Mock voice and desktop voice runtimes
should compose different adapters into the same shared loop rather than importing
generic control-flow behavior from one runtime-specific module into another.
Shared voice runtime composition also belongs in a neutral voice runtime factory:
runtime-specific entry points supply adapter construction, while the factory
loads config, creates the assistant, assembles the voice-turn dependencies, and
returns the `runOnce` entry point.
Text wake phrase normalization and prefix matching are shared by the mock and
desktop voice adapters so user-facing wake behavior stays consistent.

The desktop voice service command is:

```bash
personal-ai desktop-voice-service --config path/to/desktop-config.json
```

This command runs the desktop voice stack in a long-lived service loop. Each
service iteration captures a short wake audio window, transcribes it, detects
the configured wake phrase, and ignores the turn if no wake phrase is detected.
After wake detection, it captures a separate command utterance, transcribes that
command audio, sends the command transcript through the same assistant core, and
speaks or fallback-prints the response. Recoverable activation failures are
logged internally and retried by the neutral service loop. Startup still fails
closed for missing voice adapter IDs or missing desktop command config, and temp
voice files are cleaned up after each activation attempt. The first
always-listening implementation remains command-based and STT-backed; native
low-power wake engines or provider-event wake adapters can be added later behind
the same runtime boundary.

### Raspberry Pi Runtime

The Raspberry Pi runtime runs the assistant as a long-lived service process.

It should:

- Run as a long-lived device process.
- Use Pi-compatible command-based audio input, speech-to-text, text-to-speech,
  and audio output adapters.
- Load device-specific configuration.
- Log in a way that is suitable for a service.
- Keep the service loop alive for recoverable command failures.
- Eventually run under `systemd`.

The first implemented service command is:

```bash
personal-ai pi-service --config path/to/pi-config.json
```

The Raspberry Pi runtime does not fork assistant behavior. It composes the same
assistant core with the existing service loop, shared voice-turn orchestration,
and configured command-based voice adapters. Pi-specific command choices belong
in local config, not in the checked-in default config.

## Configuration

Configuration should be explicit and environment-aware.

Example shape:

```yaml
assistant:
  name: Jarvis
  wake_phrases:
    - "hey jarvis"

voice:
  input: mock
  wakeWord: mock
  speechToText: mock
  textToSpeech: mock
  audioOutput: mock

desktopVoice:
  wakeAudioInput:
    command: rec
    args:
      - "{output}"
    timeoutMs: 5000
  audioInput:
    command: rec
    args:
      - "{output}"
    timeoutMs: 30000
  audioOutput:
    command: play
    args:
      - "{input}"
    timeoutMs: 30000
  speechToText:
    command: your-stt-command
    args:
      - "--input"
      - "{input}"
    timeoutMs: 30000
  textToSpeech:
    command: your-tts-command
    args:
      - "--text"
      - "{text}"
      - "--output"
      - "{output}"
    timeoutMs: 30000

intent:
  provider: deterministic
  openai:
    model: gpt-5.5
    apiKeyEnv: OPENAI_API_KEY
    baseUrl: https://api.openai.com/v1
    timeoutMs: 30000

features:
  calendar:
    enabled: true
    adapter: mock
    google:
      accessTokenEnv: GOOGLE_CALENDAR_ACCESS_TOKEN
      calendarId: primary
      baseUrl: https://www.googleapis.com/calendar/v3
      timeoutMs: 30000
      maxResults: 10
  messaging:
    enabled: true
    adapter: mock
  alarms:
    enabled: true
    adapter: local
```

The final format can be JSON, YAML, TOML, or TypeScript config. The configured
text runtime currently uses JSON with `intent.provider`, optional
`intent.openai` settings, `voice` adapter IDs, optional `desktopVoice` command
settings, and per-feature `adapter` IDs. Deterministic behavior is one selected
intent provider, not a separate runtime identity. The important rule is that
provider, voice, and feature selection must be configuration-driven. Text-only
runtimes may ignore the `voice` and `desktopVoice` sections, but voice runtimes
must reject missing or unregistered voice adapter IDs during composition.
Desktop voice runtimes must also reject missing desktop command settings for
selected command-based adapters. Desktop voice command adapters replace
`{input}`, `{output}`, and `{text}` placeholders in configured argument values.
The desktop voice service additionally requires `desktopVoice.wakeAudioInput`
for short wake-window capture; `desktopVoice.audioInput` remains the command
utterance capture config.

The `openai` intent provider is opt-in and selected with
`intent.provider: openai`. It requires `intent.openai.model`; `apiKeyEnv`,
`baseUrl`, and `timeoutMs` default to `OPENAI_API_KEY`,
`https://api.openai.com/v1`, and `30000`. API keys must stay in environment
variables and out of repository config files. The checked-in default config
remains deterministic and uses mock/local adapters.
The OpenAI adapter keeps request construction, Responses API transport,
provider-output text extraction, and assistant intent-output parsing in separate
adapter-local modules, with the interpreter class only orchestrating those
pieces.
OpenAI adapter contract tests remain deterministic by default. A separate
opt-in `npm run test:e2e:openai` routing E2E test may load `.env`, read the
`OPENAI_API_KEY` variable, call the live Responses API with a weak/cheap model,
cover routing for the currently enabled feature capabilities, and consume
provider quota. This live test is not part of `npm run check`.
The `google` calendar adapter is opt-in and selected with
`features.calendar.adapter: google`. It requires an OAuth access token from the
configured environment variable, defaulting to
`GOOGLE_CALENDAR_ACCESS_TOKEN`; `calendarId`, `baseUrl`, `timeoutMs`, and
`maxResults` default to `primary`, `https://www.googleapis.com/calendar/v3`,
`30000`, and `10`. Google credentials must stay out of repository config files,
and the checked-in default config continues to use the deterministic mock
calendar adapter.
Intent provider selection and feature adapter selection are runtime composition
policy, owned by shared runtime selector helpers so missing IDs, unknown IDs,
and provider-specific construction rules do not drift between runtimes. Runtime
config parsing stays separate from assistant policy projection, intent provider
resolution, voice adapter ID resolution, and desktop voice command resolution.
Provider-facing capability catalog construction is shared by runtime composition
so future intent providers can reuse the same feature metadata projection.

Runtime composition should resolve broad optional configuration into
runtime-specific validated shapes before adapter construction. For a voice
runtime, the resolved shape should contain all required voice adapter IDs. For a
desktop voice runtime, the resolved shape should also contain the command
settings needed by selected command-based adapters. This keeps optional config
handling at the boundary instead of spreading `undefined` checks through the
runtime loop or adapter registry.

Config parsing and config resolution are separate runtime responsibilities.
Parsing validates the external config shape from `unknown`; focused resolvers
prove the invariants required by one runtime or provider. Do not duplicate
missing-provider, missing-adapter, or missing-command checks in both places when
one canonical resolver can own the policy.

The loaded runtime config may include provider selection, adapter IDs, voice
settings, desktop command settings, and provider-specific options. Before the
assistant core is constructed, runtime composition maps that broad shape to the
narrow assistant policy config containing only assistant identity, wake phrases,
feature enablement, and confirmation policy.

Runtime factories may compose other runtime factories, but dependency injection
must remain transitive. A voice or service runtime that builds the text
assistant should forward injected environment maps, network clients, clocks, IO
streams, and process state instead of allowing nested composition to read
globals implicitly.
For long-running runtimes, clock injection should remain a callable clock all
the way to the assistant core. A runtime may freeze time for a deterministic
test, but service and voice composition should not accidentally turn an injected
clock into a single startup timestamp.

Command-based adapters should execute configured programs as `command` plus an
argument array, not as shell-concatenated command strings. They should enforce a
timeout, capture stdout and stderr for diagnostics, preserve captured output on
non-zero exits, spawn failures where available, and timeout failures, and let
the runtime boundary decide what safe response or fallback output reaches the
human.

## Process Lifecycle

Runtimes should own:

- Startup.
- Config loading.
- Adapter construction.
- Signal handling.
- Shutdown.
- Logging setup.
- Final catch-all error handling at the human interaction boundary.
- Graceful response fallback for CLI, voice, and service loops.
- Shared runtime-boundary fallback and diagnostic logging policy.
- Canonical configuration selection and adapter lookup policy for the runtime.

The assistant core should expose application behavior, not process lifecycle behavior.

The neutral service runtime boundary baseline has been implemented in
preparation for Milestone 5.1. It accepts injectable assistant composition, turn
execution, clock access, signal registration, stderr diagnostics, and shutdown
hooks. Startup failures return a safe fallback outcome, signal registration
failures clean up partial handlers, recoverable turn failures are logged before
the injected retry policy runs, and injected `SIGINT`/`SIGTERM` handlers request
graceful shutdown before unregistering.

The Raspberry Pi service command builds on this service boundary. It validates
the required voice and desktop command config during startup, runs configured
voice turns until a shutdown signal is received, logs diagnostics to stderr, and
cleans up temporary capture and speech files after each service turn.
Cleanup is best-effort runtime resource release unless a runtime explicitly
documents and tests a stricter lifecycle guarantee. Voice and service runtimes
should keep cleanup failure policy aligned with the shared runtime helper:
preserve diagnostics internally and avoid turning cleanup drift into a different
turn or retry outcome by accident.

## Failure Handling

Runtimes are the last line of defense before a failure reaches a human. Lower-level code may throw, but runtime control loops should catch unhandled errors, preserve diagnostic detail in logs, and return a safe response such as "I hit a problem and could not complete that." Core-level feature failures should also preserve diagnostic causes while returning safe public text rather than raw exception messages.

Runtime code should prefer the assistant's diagnostic-aware outcome method over the response-only method. The CLI logs preserved feature diagnostics, including available causes or stacks, to stderr; writes only the safe response to stdout; and routes even executable entrypoint rejections through the same graceful fallback text with diagnostics logged separately.

For voice runtimes, producing some response is more important than preserving the exact internal error message. If command handling fails, the runtime should attempt a spoken fallback. If speech output fails, it should fall back to text or logs rather than silently ending the interaction.

## Deployment Notes

The first Raspberry Pi deployment should be intentionally simple:

- Install Node.js.
- Install application dependencies.
- Provide environment-specific config.
- Run `npm run cli -- pi-service --config path/to/pi-config.json`.
- Later wrap it in `systemd`.

An optional ARM64 Linux container smoke check can validate Pi-like userland
compatibility without real hardware:

```bash
docker run --rm --platform linux/arm64 \
  -v "$PWD":/workspace -w /workspace node:22-bookworm-slim \
  sh -lc "npm ci && npm run build && npm run cli -- ask 'Hey Jarvis, list my alarms'"
```

On non-ARM hosts, Docker may need QEMU/binfmt enabled first:

```bash
docker run --privileged --rm tonistiigi/binfmt --install arm64
```

This container smoke path does not emulate Raspberry Pi audio hardware,
firmware, GPIO, or `systemd`. Automated Raspberry Pi OS provisioning and
`systemd` validation remain deferred.

The first Raspberry Pi OS QEMU smoke path is opt-in and operator-driven:

```bash
npm run smoke:pi:qemu -- \
  --config path/to/pi-config.json \
  --image path/to/raspios.img \
  --kernel path/to/kernel8.img \
  --dtb path/to/bcm2710-rpi-3-b-plus.dtb
```

By default, this validates required local artifacts and prints the QEMU command
without spawning a VM. Passing `--run` starts QEMU with the printed arguments.
The command does not download Raspberry Pi OS images, kernels, or DTBs, does not
provision `systemd`, and is not part of the deterministic `npm run check` gate.
After the guest boots, run `npm run cli -- pi-service --config
path/to/pi-config.json` inside the guest or an equivalent deployed checkout.

## Documentation Maintenance

Keep this runtime plan aligned with the implemented CLI, voice, service, configuration, and fallback behavior. Runtime changes should update `README.md`, `AGENTS.md`, and the relevant `docs/` files in the same thin TDD slice.
