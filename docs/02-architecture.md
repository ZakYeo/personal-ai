# Architecture

## Architectural Style

The project uses ports and adapters, also known as hexagonal architecture.

The assistant core owns behavior. Ports define the contracts the core needs. Adapters implement those contracts for mock providers, desktop voice, Raspberry Pi hardware, AI providers, and external services. Runtimes compose the core with a selected set of adapters.

## System Flow

```text
Audio Input
  -> Wake Word Detection
  -> Speech To Text
  -> Assistant Core
  -> Intent Interpretation
  -> Feature Selection
  -> Feature Execution
  -> Assistant Response
  -> Text To Speech
  -> Audio Output
```

The same assistant core should also support a text-first flow:

```text
Text Command
  -> Assistant Core
  -> Intent Interpretation
  -> Feature Selection
  -> Feature Execution
  -> Assistant Response
```

The text-first flow is the preferred first milestone because it is deterministic and easy to test. Voice support should wrap the same core instead of creating a separate path.

## Main Modules

```text
src/
  core/
    assistant/
    conversation/
    intent/
    response/
  ports/
    audio-input
    audio-output
    speech-to-text
    text-to-speech
    wake-word
    llm
    feature
    clock
    config
    memory
  features/
    alarms/
    calendar/
    messaging/
  adapters/
    mock/
    desktop/
    raspberry-pi/
    openai/
    google-calendar/
  runtimes/
    cli/
    desktop-voice/
    pi-service/
```

This structure is illustrative. The implementation can adjust names and file layout, but the dependency direction must stay intact.

## Core

The core coordinates assistant behavior:

- Receives normalized user input.
- Tracks conversation/session context.
- Calls the configured intent interpreter.
- Chooses or invokes feature plugins.
- Applies validation and confirmation rules.
- Produces structured assistant responses.

The core must not know whether input came from a microphone, CLI, test fixture, HTTP request, or Raspberry Pi device.

## Ports

Ports are interfaces owned by the application. They describe what the core needs without naming any specific provider or device.

Expected ports include:

- `LlmPort`
- `SpeechToTextPort`
- `StreamingSpeechToTextPort`
- `TextToSpeechPort`
- `StreamingTextToSpeechPort`
- `WakeWordPort`
- `WakeActivationPort`
- `AudioInputPort`
- `StreamingAudioInputPort`
- `AudioOutputPort`
- `StreamingAudioOutputPort`
- `FeaturePort`
- `ClockPort`
- `ConfigPort`
- `MemoryPort`
- `AlarmStore` for storing alarms and assigning storage-owned alarm IDs

## Adapters

Adapters implement ports.

Initial adapters should be deterministic and local:

- Mock LLM adapter.
- Mock speech-to-text adapter.
- Mock text-to-speech adapter.
- Command-based desktop speech-to-text adapter.
- Command-based desktop text-to-speech adapter.
- SoX-compatible desktop audio input and output adapters.
- Mock calendar adapter.
- Mock messaging adapter.
- Local/in-memory alarm storage adapter implementing the alarm store port.

Real-provider experiments can integrate behind the same ports:

- OpenAI intent interpreter adapter using the Responses API.
- Anthropic or local model LLM adapters.
- Whisper, Vosk, cloud STT, or Python sidecar STT adapters.
- Piper, system TTS, or cloud TTS adapters.
- Google Calendar or other calendar adapters.
- Messaging adapters if feasible and safe.

## Runtimes

Runtimes wire the application together for a specific environment.

Expected runtimes:

- CLI runtime for deterministic text commands.
- Desktop voice runtime for local microphone and speaker development.
- Neutral service runtime boundary for long-running startup, loop failure,
  signal, and shutdown behavior.
- Raspberry Pi service runtime for deployment as a long-running device process
  using explicit local command-based voice configuration.

The assistant core should not contain desktop-specific or Raspberry Pi-specific imports.

## LLM Role

The LLM should help with:

- Natural-language interpretation.
- Structured command proposal.
- Feature/tool selection.
- Summarization.
- Drafting responses.
- Asking clarification questions.

The LLM should not directly perform irreversible actions. The core must validate structured commands and route side effects through feature plugins.

## TypeScript and Python

The main application should be TypeScript unless a future decision changes this explicitly.

TypeScript is preferred for:

- Strong interfaces for ports and adapters.
- Dependency graph enforcement.
- API-heavy integration work.
- Testable orchestration logic.
- Possible future web/admin tooling.

Python can be used later for specialized adapters if it earns its place, especially for local speech or ML tooling. In that case, Python should run behind a TypeScript port as a child process, local service, or isolated adapter boundary.

## Documentation Maintenance

Keep this architecture document aligned with the implemented module layout, ports, adapters, runtimes, and dependency direction. Any architecture-affecting code change should update `README.md`, `AGENTS.md`, and the relevant `docs/` files in the same thin TDD slice.
