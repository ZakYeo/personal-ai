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

For this repository's default desktop OpenAI voice setup, use:

```bash
npm start
```

That script runs the service with `config/local-desktop-voice-openai.json`.
The default config expects OpenWakeWord to be installed in the repository
`.venv` and runs wake activation with `.venv/bin/python`. Create or update that
venv before starting the service:

```bash
npm run setup:openwakeword
```

If the venv should remain active in the current shell, source the setup script:

```bash
source scripts/setup-openwakeword-venv.sh
```

This command runs the desktop voice stack in a long-lived service loop. When
`voice.wakeActivation` is configured, the service waits on a local wake
activation adapter before it records or streams command audio. The checked-in
OpenAI desktop voice config uses the `openwakeword-command` adapter and the
pretrained openWakeWord `"hey jarvis"` model, so wake detection happens locally.
The local desktop config passes `--threshold 0.35` to the listener as a moderate
sensitivity default. Lower values make `"Hey Jarvis"` easier to trigger but can
increase false activations; raise the value again if the service wakes too often
from background speech.
After wake detection, the service streams command audio to the configured
streaming STT adapter when available, writes transcript deltas to progress
output, sends the final command transcript through the same assistant core, and
streams speech audio playback when streaming TTS/output adapters are configured.
For the OpenAI realtime transcription adapter, runtime composition configures a
transcription session before sending audio, uses `gpt-realtime-whisper`, sends
the provider API key through an authenticated websocket client, and captures raw
mono PCM command audio at 24 kHz so the adapter and command config agree on the
provider audio format. The adapter keeps request construction, provider event
parsing, socket/session settlement, and audio streaming in focused modules so
transport and provider-output parsing do not accumulate in one class.
Command-backed streaming input starts when the adapter begins consuming chunks,
not when the stream object is created, so short file-fed inputs and command
processes cannot finish before the realtime socket is ready to read them.
Runtime cleanup terminates owned streaming input processes best-effort when
realtime setup, transcription, or provider events fail.
Desktop streaming STT and TTS provider entries resolve and capture their own
typed configuration. The neutral slot topology returns the selected adapter ID
and constructor without naming OpenAI config types, so another provider is a
registry-only extension.
The default desktop OpenAI command capture keeps an eight-second maximum trim
guard but also uses SoX trailing-silence detection after wake activation. That
keeps the service from waiting for the full capture window after the user has
finished speaking while still bounding command capture if silence detection is
unreliable.
If streaming adapters are not configured, the runtime falls back to the existing
batch capture, STT, TTS, and playback adapters. Pre-wake activation failures are
logged internally and retried by the neutral service loop. After wake detection,
final command capture, transcription, assistant, speech, and playback failures
produce the same safe voice fallback as one-turn voice runtimes whenever
possible. Startup still fails closed for missing selected voice adapter IDs or
missing selected desktop adapter config, and temp voice files are cleaned up
after each activation attempt.

Voice service commands write human-visible progress logs to stdout when the
runtime boundary provides a progress writer. These logs announce the configured
wake phrase, successful wake detection, live command transcript deltas, the
recognized command transcript, and the assistant's safe response. Wake-window
transcripts, raw provider output, adapter command output, credentials, stack
traces, and diagnostic causes remain out of progress logs; diagnostics stay on
stderr.
When an assistant response sets `expectsFollowUp: true`, the neutral voice
activation loop logs that it is listening for the user's reply and captures one
additional command utterance without requiring the wake phrase. The loop may
continue only if the next response also explicitly requests follow-up; otherwise
the service returns to normal wake listening. The neutral voice command
sequence owns the maximum no-wake follow-up count so model output cannot keep a
runtime in unbounded no-wake capture.

The opt-in desktop voice OpenAI smoke command is:

```bash
npm run smoke:desktop-voice:openai
```

This command loads `.env`, requires `OPENAI_API_KEY`, uses committed audio
fixtures from `test/fixtures/audio/`, runs openWakeWord against a file-fed
`"Hey Jarvis"` wake phrase, and streams a file-fed `List my alarms` command as
raw mono 24 kHz PCM through the same SoX trim and trailing-silence chain used by
the local command capture before sending it to the OpenAI realtime transcription
adapter. It is not part of the deterministic validation gate. It is intended to
reproduce the same post-wake path as `npm start` without depending on room
acoustics or a live microphone, and it is the live acceptance guard for
authenticated realtime transcription, assistant handling, and streaming spoken
output.
Successful smoke runs print a diagnostic timing summary with wake activation,
command stream setup, command transcription, assistant handling, speech output,
and total durations. The values are advisory rather than thresholds because live
provider latency varies; local samples after adding the summary were roughly
6.0s to 8.4s total across realtime transcription, intent routing, and streaming
speech.

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
assistant core with the existing service loop, shared voice activation
orchestration, and configured command-based voice adapters. The
`config/pi-voice-openai.example.json` file shows the same openWakeWord and
streaming OpenAI adapter IDs used by desktop with Pi-compatible command
boundaries. Pi-specific command choices belong in local config, not in the
checked-in default config.

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

conversation:
  provider: disabled
  history:
    maxTurnsBeforeCompaction: 5
  openai:
    model: gpt-5.5
    apiKeyEnv: OPENAI_API_KEY
    baseUrl: https://api.openai.com/v1
    timeoutMs: 30000

responseRewriter:
  provider: disabled
  openai:
    model: gpt-5.5
    apiKeyEnv: OPENAI_API_KEY
    baseUrl: https://api.openai.com/v1
    timeoutMs: 30000

features:
  calendar:
    enabled: true
    adapter: mock
    upcomingWindowDays: 92
    google:
      accessTokenEnv: GOOGLE_CALENDAR_ACCESS_TOKEN
      clientIdEnv: GOOGLE_CALENDAR_CLIENT_ID
      clientSecretEnv: GOOGLE_CALENDAR_CLIENT_SECRET
      refreshTokenEnv: GOOGLE_CALENDAR_REFRESH_TOKEN
      calendarId: primary
      baseUrl: https://www.googleapis.com/calendar/v3
      tokenUrl: https://oauth2.googleapis.com/token
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
`intent.openai` settings, `conversation.provider`, optional
`conversation.openai` settings, `responseRewriter.provider`, optional
`responseRewriter.openai` settings, `voice` adapter IDs, optional
`desktopVoice` command settings, and per-feature `adapter` IDs. Deterministic
behavior is one selected intent provider, not a separate runtime identity. The
important rule is that provider, conversation, response rewriting, voice, and
feature selection must be
configuration-driven. Text-only runtimes may ignore the `voice` and
`desktopVoice` sections, but voice runtimes must reject missing or unregistered
voice adapter IDs during composition.
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
Development CLI runs load `.env` when present through Node's
`--env-file-if-exists` support, so local provider credentials can be supplied
without prefixing each `npm run cli` invocation.
The OpenAI adapter keeps request construction, Responses API transport,
provider-output text extraction, and assistant intent-output parsing in separate
adapter-local modules, with the interpreter class only orchestrating those
pieces.
Intent, conversation, and response rewriting share the provider-local OpenAI
Responses config type and one labeled runtime parser for API key environment,
base URL, model, and timeout fields. Application ports do not name that provider
config.
They also share one labeled Responses transport client for credential lookup,
authenticated JSON POST construction, URL normalization, timeouts, HTTP
failures, and malformed JSON. Each operation supplies its own error factory and
keeps request construction and output validation separate.
OpenAI adapter contract tests remain deterministic by default. A separate
opt-in `npm run test:e2e:openai` routing E2E test may load `.env`, read the
`OPENAI_API_KEY` variable, call the live Responses API with a weak/cheap model,
cover routing for the currently enabled feature capabilities, and consume
provider quota. This live test is not part of `npm run check`.

The conversation provider is selected separately with `conversation.provider`.
The default provider is `disabled`, so deterministic configs remain network-free
and unknown non-command text stays deterministic. The `openai` conversation
provider requires `conversation.openai.model` and uses the same environment
credential defaults as the OpenAI intent provider. One assistant instance owns
one in-memory chat window. Conversation turns append user and assistant text to
that window; after `conversation.history.maxTurnsBeforeCompaction` completed
user/assistant turns, the configured compactor replaces older turns with a
summary. The default compaction threshold is 5. OpenAI conversation responses
return strict JSON containing safe response text and `expectsFollowUp`; raw
provider output stays inside adapter diagnostics.
The command response rewriter is selected separately with
`responseRewriter.provider`. The default provider is `disabled`, so
deterministic configs remain network-free. The `openai` response rewriter
requires `responseRewriter.openai.model` and uses the same environment
credential defaults as the OpenAI intent provider. It post-processes successful
command responses into spoken-friendly wording, preserving command facts and
falling back to the original safe response while logging diagnostics if
rewriting fails.
Calendar features return factual titles and exact provider date strings before
this post-processing step; natural date and relative-time phrasing belongs to
the rewriter rather than deterministic feature policy.
The `google` calendar adapter is opt-in and selected with
`features.calendar.adapter: google`. Generic upcoming event searches default to
`features.calendar.upcomingWindowDays: 92`, so normal list requests stay within
roughly three months unless the user or config supplies a different date range.
The adapter can use a legacy OAuth access token from
`GOOGLE_CALENDAR_ACCESS_TOKEN`, or exchange `GOOGLE_CALENDAR_CLIENT_ID`,
`GOOGLE_CALENDAR_CLIENT_SECRET`, and `GOOGLE_CALENDAR_REFRESH_TOKEN` for an
access token at `https://oauth2.googleapis.com/token`. `calendarId`, `baseUrl`,
`timeoutMs`, and `maxResults` default to `primary`,
`https://www.googleapis.com/calendar/v3`, `30000`, and `10`. Google credentials
must stay out of repository config files, and the checked-in default config
continues to use the deterministic mock calendar adapter. The local desktop
OpenAI config selects the Google adapter and therefore fails clearly until local
OAuth credentials are present, with startup guidance to run
`npm run setup:google-calendar`. When a Google OAuth app remains in external
testing mode, the setup helper can only authorize accounts listed as test users
for that Google Cloud project; add the local operator account in Google Auth
Platform > Audience > Test users before rerunning the helper.
Intent provider selection and feature adapter selection are runtime composition
policy, owned by shared runtime selector helpers so missing IDs and unknown IDs
do not drift between runtimes. Selected feature registry entries parse and
capture their provider config during runtime config loading, then own typed
construction and startup preflight without widening common feature config.
Selected desktop streaming provider entries likewise parse and capture their
typed config and provider-specific transport factory during config loading;
later desktop composition receives only provider-neutral constructors.
Intent, conversation, and response-rewriter selection follow the same
registry-owned parsing boundary, leaving loaded operation config with common
fields, its provider ID, and a captured neutral factory rather than
provider-specific config fields.
Assistant policy projection, intent provider resolution, voice adapter ID
resolution, and desktop voice command resolution remain focused boundaries.
Provider-facing capability catalog construction is shared by runtime composition
so future intent and conversation providers can reuse the same feature metadata
projection. Capability summaries and descriptions are generated from enabled
feature metadata and also back the built-in assistant capability catalog
feature.
Voice-facing answers should present this capability metadata in natural spoken
language. Normal user-facing responses should avoid bullets, semicolon-delimited
lists, and internal capability names such as `alarm.list` unless the user asks
for technical detail.

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
graceful shutdown before unregistering. Shutdown signals also abort the active
service turn so long-running command-backed wake activation, capture, or
transcription input can terminate promptly instead of waiting for a wake phrase
or command timeout.

The Raspberry Pi service command builds on this service boundary. It validates
the required voice and desktop command config during startup, runs configured
voice turns until a shutdown signal is received, writes voice progress logs to
stdout, logs diagnostics to stderr, and cleans up temporary capture and speech
files after each service turn.
Cleanup is best-effort runtime resource release unless a runtime explicitly
documents and tests a stricter lifecycle guarantee. Voice and service runtimes
should keep cleanup failure policy aligned with the shared runtime helper:
preserve diagnostics internally and avoid turning cleanup drift into a different
turn or retry outcome by accident.

## Failure Handling

Runtimes are the last line of defense before a failure reaches a human. Lower-level code may throw, but runtime control loops should catch unhandled errors, preserve diagnostic detail in logs, and return a safe response such as "I hit a problem and could not complete that." Core-level feature failures should also preserve diagnostic causes while returning safe public text rather than raw exception messages.

Runtime code should prefer the assistant's diagnostic-aware outcome method over the response-only method. CLI and voice boundaries log every preserved assistant diagnostic category, including available causes or stacks, to stderr; write only the safe response to human-facing output; and route even executable entrypoint rejections through the same graceful fallback text with diagnostics logged separately.

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
The executable wrapper owns process argv/env, exit code, filesystem lookup, and
spawn wiring; parse, preflight, command construction, and run behavior live in
injectable helpers.
After the guest boots, run `npm run cli -- pi-service --config
path/to/pi-config.json` inside the guest or an equivalent deployed checkout.

## Documentation Maintenance

Keep this runtime plan aligned with the implemented CLI, voice, service, configuration, and fallback behavior. Runtime changes should update `README.md`, `AGENTS.md`, and the relevant `docs/` files in the same thin TDD slice.
