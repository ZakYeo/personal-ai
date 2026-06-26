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
- Use mock adapters until the core flow is stable.

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
  speech_to_text: mock
  text_to_speech: mock
  voice_id: default

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

The final format can be JSON, YAML, TOML, or TypeScript config. The checked-in deterministic runtime currently uses JSON with `intent.provider` and per-feature `adapter` IDs. The important rule is that provider and feature selection must be configuration-driven.

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

The assistant core should expose application behavior, not process lifecycle behavior.

## Failure Handling

Runtimes are the last line of defense before a failure reaches a human. Lower-level code may throw, but runtime control loops should catch unhandled errors, preserve diagnostic detail in logs, and return a safe response such as "I hit a problem and could not complete that." Core-level feature failures should also preserve diagnostic causes while returning safe public text rather than raw exception messages.

Runtime code should prefer the assistant's diagnostic-aware outcome method over the response-only method. The CLI logs preserved feature diagnostics to stderr, writes only the safe response to stdout, and routes even executable entrypoint rejections through the same graceful fallback text with diagnostics logged separately.

For voice runtimes, producing some response is more important than preserving the exact internal error message. If command handling fails, the runtime should attempt a spoken fallback. If speech output fails, it should fall back to text or logs rather than silently ending the interaction.

## Deployment Notes

The first Raspberry Pi deployment should be intentionally simple:

- Install Node.js.
- Install application dependencies.
- Provide environment-specific config.
- Run a service command.
- Later wrap it in `systemd`.

Containerization can be considered later, but it is not required for the first Pi deployment.
