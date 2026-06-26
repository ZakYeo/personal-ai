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

### Raspberry Pi Runtime

The Raspberry Pi runtime is a later target.

It should:

- Run as a long-lived device process.
- Use Pi-compatible audio input and output adapters.
- Load device-specific configuration.
- Log in a way that is suitable for a service.
- Keep the service loop alive for recoverable command failures.
- Eventually run under `systemd`.

The Raspberry Pi runtime should not fork the assistant behavior. It should compose the same assistant core with Pi-specific adapters.

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

features:
  calendar:
    enabled: true
    adapter: mock
  messaging:
    enabled: true
    adapter: mock
  alarms:
    enabled: true
    adapter: local
```

The final format can be JSON, YAML, TOML, or TypeScript config. The checked-in deterministic runtime currently uses JSON with `intent.provider`, `voice` adapter IDs, optional `desktopVoice` command settings, and per-feature `adapter` IDs. The important rule is that provider, voice, and feature selection must be configuration-driven. Text-only runtimes may ignore the `voice` and `desktopVoice` sections, but voice runtimes must reject missing or unregistered voice adapter IDs during composition. Desktop voice command adapters replace `{input}`, `{output}`, and `{text}` placeholders in configured argument values.

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

The assistant core should expose application behavior, not process lifecycle behavior.

## Failure Handling

Runtimes are the last line of defense before a failure reaches a human. Lower-level code may throw, but runtime control loops should catch unhandled errors, preserve diagnostic detail in logs, and return a safe response such as "I hit a problem and could not complete that." Core-level feature failures should also preserve diagnostic causes while returning safe public text rather than raw exception messages.

Runtime code should prefer the assistant's diagnostic-aware outcome method over the response-only method. The CLI logs preserved feature diagnostics, including available causes or stacks, to stderr; writes only the safe response to stdout; and routes even executable entrypoint rejections through the same graceful fallback text with diagnostics logged separately.

For voice runtimes, producing some response is more important than preserving the exact internal error message. If command handling fails, the runtime should attempt a spoken fallback. If speech output fails, it should fall back to text or logs rather than silently ending the interaction.

## Deployment Notes

The first Raspberry Pi deployment should be intentionally simple:

- Install Node.js.
- Install application dependencies.
- Provide environment-specific config.
- Run a service command.
- Later wrap it in `systemd`.

Containerization can be considered later, but it is not required for the first Pi deployment.

## Documentation Maintenance

Keep this runtime plan aligned with the implemented CLI, voice, service, configuration, and fallback behavior. Runtime changes should update `README.md`, `AGENTS.md`, and the relevant `docs/` files in the same thin TDD slice.
