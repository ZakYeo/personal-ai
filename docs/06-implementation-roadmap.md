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
- Config-driven deterministic runtime composition for intent provider and feature adapter IDs.
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

## Milestone 1.5: Core Safety and Extension Foundation

Goal: make the assistant core pipeline explicit and make future feature work mechanical before adding voice or real providers.

Included:

- Core command validation stage.
- Confirmation policy stage.
- Application-owned error taxonomy.
- Feature capability metadata for risk and confirmation behavior.
- Feature authoring conventions for capabilities, validation, execution, and tests.
- Config-driven confirmation requirements for risky commands.
- Unit tests for validation, confirmation decisions, and error normalization.
- Integration tests proving the CLI still returns graceful deterministic responses.

Excluded:

- Real voice input or output.
- Real provider integrations.
- Persistent multi-turn confirmation storage unless needed for the minimal confirmation policy.
- New product capabilities beyond what is needed to prove the foundation.

Acceptance criteria:

- Structured commands are validated before feature execution.
- Invalid commands return deterministic assistant responses without executing features.
- Capabilities can declare risk and confirmation requirements.
- Configuration can require confirmation for selected capabilities.
- Confirmation-required commands stop before side effects and ask for yes/no confirmation.
- Expected error categories are mapped to graceful assistant responses.
- Unexpected errors and feature failure causes are preserved for diagnostics and logged at runtime boundaries without exposing raw details in assistant responses.
- Adding a new feature requires feature-local code plus registration, without core changes.

## Milestone 1.6: Test Harness and Authoring Ergonomics

Goal: make future core, feature, runtime, and CLI work easy to test with small, localized diffs before adding more milestones.

Included:

- Core assistant test harness for arranging interpreted commands, feature plugins, fixed clocks, and config overrides.
- Test config builders for common enabled-feature and confirmation-policy shapes.
- CLI integration test helpers for captured IO, temporary config files, and deterministic `ask` invocations.
- Feature contract test helpers for capability metadata, validation expectations, and execution behavior.
- Typed feature authoring helpers that derive handler argument types from declared capability parameter metadata.
- Shared deterministic scenario fixtures for existing calendar, messaging, alarm, unsupported, unknown, and runtime-failure flows.
- Refactor existing tests enough to prove the harness reduces repetition without hiding important behavior.

Excluded:

- New product capabilities.
- New runtime types.
- Real provider integrations.
- Large test rewrites that do not improve locality or readability.
- A single global harness that couples unrelated test layers together.

Acceptance criteria:

- New assistant pipeline tests can be written without manually rebuilding full config, clock, interpreter, and feature fixtures.
- New CLI integration tests can be written without repeating temp config and IO capture boilerplate.
- Existing deterministic scenarios are named once and reused where appropriate.
- Feature metadata conventions are testable through shared helpers.
- Harnesses stay layered by responsibility: core assistant, feature contract, runtime/CLI boundary.
- Future feature changes should normally touch feature-local code/tests plus registration, not broad test setup files.
- `npm run check` passes after the harness refactor.

## Milestone 1.7: Tooling and Repository Hygiene

Goal: give humans and coding agents fast, local feedback before the project grows more adapters and runtimes.

Included:

- Stricter type-aware ESLint rules.
- Vitest-specific lint rules for test files.
- Import hygiene and fast ESLint boundary feedback.
- Package sorting, Markdown linting, spellcheck, secret scanning, duplication checks, and improved Knip configuration.
- V8 coverage reporting with modest thresholds.
- Commit message validation with conventional commits.
- A temporarily stronger pre-commit hook while the repository is local-only.
- A pre-push hook that runs the full validation suite once there is a remote to push to.

Excluded:

- High global coverage requirements.
- Making duplicate detection a hard pre-commit gate.
- Remote setup or pushing changes anywhere.

Acceptance criteria:

- `npm run check` passes.
- `npm run test:coverage` passes.
- `.githooks/pre-commit` passes.
- Commit messages are validated by `.githooks/commit-msg`.
- Tooling and hook behavior are documented in `README.md`, `AGENTS.md`, and `docs/`.

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
