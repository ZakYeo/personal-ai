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
- Use mock adapters until the core flow is stable.

### Raspberry Pi Runtime

The Raspberry Pi runtime is a later target.

It should:

- Run as a long-lived device process.
- Use Pi-compatible audio input and output adapters.
- Load device-specific configuration.
- Log in a way that is suitable for a service.
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

llm:
  provider: mock
  model: deterministic-v1

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

The final format can be JSON, YAML, TOML, or TypeScript config. The important rule is that provider and feature selection must be configuration-driven.

## Process Lifecycle

Runtimes should own:

- Startup.
- Config loading.
- Adapter construction.
- Signal handling.
- Shutdown.
- Logging setup.

The assistant core should expose application behavior, not process lifecycle behavior.

## Deployment Notes

The first Raspberry Pi deployment should be intentionally simple:

- Install Node.js.
- Install application dependencies.
- Provide environment-specific config.
- Run a service command.
- Later wrap it in `systemd`.

Containerization can be considered later, but it is not required for the first Pi deployment.
