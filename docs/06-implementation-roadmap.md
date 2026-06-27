# Implementation Roadmap

## Delivery Process

Work should be delivered in thin, committable TDD slices. Each slice starts with a focused failing test or test update, implements the smallest code and documentation change needed to pass, and is committed as one singular commit before the next slice begins.

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
- A lightweight pre-commit hook for staged formatting/lint fixes plus fast
  repository checks.
- A pre-push hook that runs the full validation suite before pushing to the
  configured remote.

Excluded:

- High global coverage requirements.
- Making duplicate detection a hard pre-commit gate.
- Remote setup or pushing changes anywhere.

Acceptance criteria:

- `npm run check` passes.
- `npm run test:coverage` passes.
- `.githooks/pre-commit` passes.
- `.githooks/pre-push` passes.
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

## Milestone 2.1: Harness Hardening

Status: implemented.

Goal: harden the test-support layers before adding more product, provider, or
runtime milestones so future work stays obvious, modular, and localized.

This milestone should follow the Harness Design Rules in
`docs/03-boundaries-and-rules.md`: each architectural layer should have a
matching test-support layer, tests should use the narrowest public boundary that
proves the behavior, and shared setup should move into focused harness helpers
before it spreads across tests.

Included:

- Voice runtime test-support helpers for arranging voice dependencies, fallback
  writers, throwing assistants, and deterministic utterances.
- Runtime composition harness helpers for overriding one dependency at a time
  without rebuilding the full deterministic app graph in each test.
- Clearer separation between deterministic scenario data, config fixtures, and
  runtime composition helpers.
- Reusable feature contract patterns that make new feature tests mechanical
  without hiding feature-specific behavior.
- Focused tests proving the harness helpers preserve the intended public
  boundaries.
- Documentation updates that keep `README.md`, `AGENTS.md`, and `docs/`
  aligned with the hardened harness structure.

Excluded:

- New product capabilities.
- New provider integrations.
- New runtime types.
- Broad rewrites of passing tests that do not improve locality.
- A single global test harness that couples unrelated layers together.

Acceptance criteria:

- Voice runtime tests can be written without local ad hoc dependency builders.
- Runtime composition tests can swap one adapter, feature, interpreter, clock, or
  config input without duplicating production wiring.
- Scenario fixtures describe behavior and expected outcomes separately from
  runtime composition.
- New feature tests can rely on reusable feature contract patterns and decoded
  `request.args` by default.
- Harness helpers remain layered by responsibility and production code cannot
  import from `src/test-support/`.
- Future feature, adapter, and runtime slices should usually touch one
  production module, one matching test file, one focused harness file if needed,
  and relevant docs.
- `npm run check` passes after the harness hardening refactor.

Implemented structure:

- `src/test-support/primitives.ts` owns neutral testing primitives: the
  canonical deterministic date, captured writers, temporary JSON config files,
  and simple output-line helpers.
- `src/test-support/voice-runtime.ts` owns voice runtime dependency builders,
  fallback writers, throwing assistants, and deterministic utterances.
- `src/test-support/runtime-composition.ts` owns configured text runtime
  composition helpers, one-change config variants, and focused invalid config
  overrides.
- `src/test-support/deterministic-scenarios.ts` owns named command/response
  scenarios; `src/test-support/deterministic-runtime-fixtures.ts` owns clocks,
  deterministic configs, voice config, and runtime-failure fixtures.
- `src/test-support/feature-contract.ts` includes decoded-args execution helpers
  so feature tests can stay mechanical without hiding feature-specific behavior.
- `src/test-support/adapter-contract.ts` owns repeated adapter-boundary
  fixtures for provider fetch responses, command scripts, and voice adapter
  contract examples.

Harness standards going forward:

- Add or extend a focused test-support layer before repeated setup appears in a
  second production test file.
- Keep config changes in tests as one-change helper calls when the behavior is
  adapter selection, missing config, unknown IDs, or provider selection.
- Add adapter-contract helpers before adding real provider, process, voice, or
  service adapters whose tests would otherwise repeat transport or command
  fixtures.
- CLI and runtime-boundary tests should prefer boundary helpers for stdout,
  stderr, exit codes, safe user responses, and internal diagnostics.

## Milestone 3: Desktop Voice Runtime

Status: implemented.

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

Implemented structure:

- `desktop-voice-once` runs one configured desktop voice turn from the CLI.
- Desktop voice composition selects `sox-rec`, `text-prefix`, command STT,
  command TTS, and `sox-play` through configured adapter IDs.
- `desktopVoice` config owns all machine-specific command, argument, and timeout
  settings for desktop voice commands, including SoX input and output commands.
- Command adapters preserve subprocess diagnostics internally while runtime
  boundaries return or speak safe fallback responses.
- The checked-in default config remains mock and deterministic; desktop voice
  uses an explicit local config.

Harness follow-up:

- Desktop voice command config builders live in focused desktop voice test
  support so broad CLI tests assert human-facing behavior without owning
  reusable runtime fixture setup.

## Milestone 4: Real Provider Experiments

Status: started.

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

Implemented structure:

- `openai` can be selected as an intent provider through local runtime config.
- OpenAI intent config requires an explicit model and reads credentials from a
  configured environment variable, defaulting to `OPENAI_API_KEY`.
- The OpenAI adapter calls the Responses API through injected `fetch`, requests
  structured JSON intent output, validates the returned command or response
  shape, and preserves provider failures as diagnostics.
- Tests mock HTTP and environment dependencies; the checked-in default config
  remains deterministic.

Next implementation slices:

### Milestone 4.1: Runtime Composition Refinement

Status: implemented.

Goal: make runtime composition naming and configuration boundaries clear before
adding more providers or service runtimes.

Included:

- Rename the current deterministic runtime factory to describe its real
  responsibility as the configured text assistant runtime.
- Keep deterministic behavior as one selected intent provider, not as the
  runtime identity.
- Split broad runtime config parsing and resolution into focused modules for
  parsing, assistant policy projection, intent provider resolution, voice
  runtime resolution, and desktop voice command resolution.
- Extract provider-facing capability catalog construction from intent provider
  selection so future LLM providers share one mapping from feature metadata.

Acceptance criteria:

- Runtime factory names match their configuration-driven behavior.
- Broad loaded config remains at runtime composition boundaries.
- Core, provider, feature, and voice construction receive the narrowest resolved
  config shape they need.
- Capability catalog mapping is tested once and reused by provider selection.
- Existing CLI, mock voice, desktop voice, and OpenAI intent behavior remains
  unchanged.

Implemented structure:

- The text assistant runtime is named `createConfiguredTextRuntime`; deterministic
  behavior is selected through `intent.provider: "deterministic"`.
- Broad config parsing remains in `src/runtimes/config/config.ts`, while
  assistant policy projection, intent provider resolution, voice adapter ID
  resolution, and desktop voice command resolution live in focused config
  modules.
- Provider-facing capability catalog construction lives in shared runtime
  composition and is reused by OpenAI intent provider selection.

### Milestone 4.2: Provider Adapter Contract Hardening

Goal: make the next real provider adapter mechanical and deterministic to test.

Included:

- Shared adapter-contract helpers for provider credentials, transport failures,
  non-OK responses, malformed provider output, timeout behavior, and diagnostic
  preservation.
- OpenAI adapter tests updated where useful to prove the shared provider
  contract helpers.
- A provider adapter checklist covering injected network clients, environment
  credentials, config validation, safe user-facing failures, and internal
  diagnostics.

Acceptance criteria:

- New provider adapters can cover common failure cases without live network
  calls or repeated fetch/env setup.
- Provider failures preserve useful diagnostics internally without exposing raw
  provider, credential, adapter, or stack details to the user.
- Real providers remain opt-in through local config and credentials stay in
  environment variables.

### Milestone 4.3: Feature Adapter Registration Refinement

Goal: prepare feature adapter selection for real feature integrations such as
calendar or messaging providers.

Included:

- An explicit per-feature adapter registry shape that can receive narrow adapter
  dependencies, credentials, and resolved config.
- Canonical feature adapter selection errors for missing adapter IDs, unknown
  adapter IDs, and unregistered adapters.
- Test-support helpers for one-change feature adapter config variants.

Acceptance criteria:

- Mock/local feature adapters still compose through config.
- Adding a real feature adapter does not require new selection-policy branches
  outside the canonical feature adapter registry.
- Tests can swap one feature adapter ID or missing config field without broad
  inline config object spreads.

### Milestone 4.4: Next Real Provider Adapter

Goal: add one additional real adapter behind an existing port after the
composition and contract refinements are in place.

Candidate adapters:

- Anthropic or local-model intent adapter.
- Local or cloud speech-to-text adapter.
- Local or cloud text-to-speech adapter.
- Google Calendar adapter.

Acceptance criteria:

- The adapter is introduced behind an existing application-owned port.
- Provider selection remains configuration-driven.
- Mock adapters remain available and the checked-in default config stays
  deterministic.
- Tests use deterministic mocks rather than live provider calls.

Deferred hardening themes to keep checking during Milestone 4:

- Split broad runtime config into narrower core, provider, feature, and runtime
  composition shapes where that removes optionality or prevents provider/runtime
  settings from leaking through core contracts.
- Keep raw config parsing separate from runtime-specific resolution so selected
  provider, adapter, and command invariants are proved by one canonical owner.
- Promote diagnostic-aware assistant outcomes to a stable public contract for
  runtime boundaries before more runtime helpers depend on preserved diagnostic
  data.
- Extract canonical provider and feature adapter selection helpers before adding
  another intent provider or concrete feature adapter.
- Prefer explicit nested adapter registries over encoded registry keys that
  require string parsing to recover feature or provider ownership.
- Decompose real provider adapters when they begin combining transport,
  request-body construction, provider response extraction, provider-output
  parsing, and application validation in one module.
- Factor repeated voice runtime composition and shared wake phrase matching
  before adding another voice runtime or wake word adapter.
- Ensure nested runtime factories forward injected environment, network, clock,
  IO, and process dependencies rather than falling back to globals.
- Preserve captured command stdout/stderr for timeout diagnostics as well as
  non-zero exits.
- Keep deterministic intent matching data-backed or feature-local once it grows
  beyond the initial fixture set.

## Milestone 5: Raspberry Pi Deployment

### Milestone 5.1: Service Runtime Boundary

Goal: define the long-running service runtime boundary before adding
Raspberry Pi-specific device behavior.

Included:

- A small service runtime contract with injectable logger, clock, config path,
  IO/process state, signal handling, and shutdown hooks.
- Tests for startup failure, one recoverable loop failure, graceful shutdown,
  and safe human/operator-facing diagnostics.
- Shared service runtime test-support helpers before broad service tests
  accumulate reusable setup.

Acceptance criteria:

- The service runtime composes the same assistant core and adapters as existing
  runtimes.
- Recoverable turn failures do not terminate the long-running loop.
- Startup and unrecoverable failures log diagnostics and fail gracefully without
  leaking raw provider, credential, adapter, or stack details to users.
- Process state, clocks, IO streams, and shutdown hooks remain injectable at the
  runtime boundary.

### Milestone 5.2: Raspberry Pi Deployment

Goal: deploy the assistant to a Raspberry Pi as a long-running personal
assistant process.

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

Keep this roadmap aligned with the codebase as milestones are completed, split, deferred, or changed. Updates to implementation status, tooling, workflow, or milestone scope should be reflected in `README.md`, `AGENTS.md`, and the relevant `docs/` files in the same thin TDD slice.
