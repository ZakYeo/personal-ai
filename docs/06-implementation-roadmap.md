# Implementation Roadmap

## Milestone 1: Deterministic Text Assistant

Goal: prove the assistant core, ports, feature plugin model, and dependency boundaries without voice or external APIs.

Included:

- TypeScript project setup.
- Assistant core.
- Initial ports.
- Mock LLM or deterministic intent interpreter.
- Mock calendar feature.
- Mock messaging feature.
- Local/in-memory alarm feature.
- CLI runtime for text input.
- Config loading.
- Unit tests for example commands.
- Dependency graph enforcement.

Excluded:

- Real microphone input.
- Real speech-to-text.
- Real text-to-speech.
- Real LLM providers.
- Real calendar or messaging integrations.
- Raspberry Pi deployment.

Acceptance criteria:

- A text command can be passed into the CLI.
- The assistant returns a deterministic response.
- Example calendar, messaging, and alarm commands are covered by tests.
- Core code does not import adapters or runtimes.
- Architecture check passes.

## Milestone 2: Mock Voice Loop

Goal: introduce the voice pipeline shape while keeping behavior deterministic.

Included:

- Wake phrase port.
- Audio input/output ports.
- Speech-to-text and text-to-speech ports.
- Mock voice adapters.
- Runtime loop that simulates listening and speaking.

Excluded:

- Real microphone and speaker integration.
- Real STT/TTS providers.
- Raspberry Pi deployment.

Acceptance criteria:

- A runtime can process a simulated voice command.
- The same assistant core handles text and voice-originated commands.
- Voice-specific code remains outside the core.

## Milestone 3: Desktop Voice Runtime

Goal: run the assistant locally on a computer using real or semi-real voice input/output adapters.

Included:

- Desktop runtime.
- Desktop microphone input adapter.
- Desktop audio output adapter.
- Initial STT/TTS adapter choices.
- Local configuration for desktop development.

Excluded:

- Raspberry Pi-specific runtime.
- Real external feature integrations unless explicitly chosen.

Acceptance criteria:

- The assistant can be activated and used by voice on the development machine.
- The desktop runtime composes existing core and feature modules.
- Mock providers can still be selected through configuration.

## Milestone 4: Real Provider Experiments

Goal: add real adapters one at a time without changing core behavior.

Candidate adapters:

- OpenAI or Anthropic LLM adapter.
- Local or cloud STT adapter.
- Local or cloud TTS adapter.
- Google Calendar adapter.

Acceptance criteria:

- Each real provider is introduced behind an existing port.
- Mock adapters remain available.
- Provider selection is configuration-driven.
- Tests still run deterministically without external API calls.

## Milestone 5: Raspberry Pi Deployment

Goal: deploy the assistant to a Raspberry Pi as a long-running personal assistant process.

Included:

- Raspberry Pi runtime.
- Pi-specific audio configuration.
- Service command.
- `systemd` service definition or deployment notes.
- Device-specific config.
- Logging suitable for a long-running service.

Acceptance criteria:

- The Pi runtime uses the same assistant core.
- Pi-specific dependencies are isolated to adapters and runtime code.
- The assistant can start, process commands, and shut down cleanly.

## Roadmap Rule

Do not introduce external API dependencies before the deterministic core, mock adapters, feature model, and dependency boundary checks exist.
