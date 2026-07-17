# Implemented Milestone Archive

This document preserves the detailed scope, exclusions, acceptance criteria,
and outcomes for completed implementation milestones. The active roadmap and
future ordering remain in `docs/06-implementation-roadmap.md`.

## Milestone 12.1: Bounded Tool-Chain Workflows

Status: implemented.

Goal: allow an intent provider to execute a small sequence of explicitly
authorized reads before proposing one fully resolved command or existing
bounded compound plan.

Included:

- One provider-neutral intent session per workflow, with at most two sequential
  capabilities explicitly declared as tool-chain reads.
- Whole-step core validation before every read, safe observations containing
  only human-safe text, scalar data, and opaque public references, and immediate
  stop on validation or execution failure.
- One optional process-local clarification that resumes the exact provider
  session, followed by the existing terminal validation, aggregate
  confirmation, and ordered execution pipeline.
- OpenAI Responses continuation through `previous_response_id`, strict read
  tools, and disabled parallel calls, with provider-managed response-state
  privacy documented for operators. Every intent response requires a non-empty
  response ID before its interpretation is accepted.
- Calendar-event-to-alarm binding with exact timed-event instants, deterministic
  all-day local-time resolution in `assistant.timeZone`, protected confirmation
  facts, and snapshot rather than tracking semantics.
- Text, voice, service, deterministic adapter, and opt-in live OpenAI workflow
  coverage.

Excluded:

- Arbitrary loops, parallel calls, more than two reads, more than one
  clarification, or provider-directed retries after failure.
- Intermediate writes, rollback claims, durable workflow sessions, or a general
  output-path expression language.
- Calendar-linked alarm synchronization, remote MCP servers, or exposing
  credentials, private provider identifiers, raw payloads, or diagnostics to
  the intent provider.

Outcomes:

- “Remind me ten minutes before the second event” can read calendar results,
  bind an opaque event reference, render an exact protected confirmation, and
  persist the approved local alarm without retaining a calendar provider ID.
- Timed events preserve their exact provider instant. All-day events trigger an
  application-declared, event-specific time question before confirmation;
  provider prompting is guidance rather than the safety mechanism.
- The confirmed calendar handoff uses one typed, validated snapshot containing
  the original event instant and final alarm instant; incomplete snapshots fail
  before persistence and the event instant remains available in result data for
  auditability.
- Every tool observation is explicitly treated as untrusted data. Prompt-like
  text in response fields, event titles, labels, or data remains input data and
  is never an instruction source.
- Tool-chain outcome metadata preserves each completed read and its safe data
  across clarification and confirmation turns, including when the provider
  fails during tool-result or clarification continuation.
- Intermediate reads bypass response rewriting; the optional rewriter remains
  final human-response post-processing only. Core returns provider-session
  failures through the normal safe outcome with internal diagnostics.
- The fresh thermonuclear maintainability review findings were all addressed:
  intent sessions became the sole interpreter contract; invalid post-read
  terminal states, identifiers, validation failures, and execution failures
  gained adversarial coverage; all-day clarification moved into a generic
  application declaration; calendar snapshots became typed and complete; and
  tool-result prompt-injection policy became explicit and tested.
- A later fresh whole-codebase thermonuclear review was also fully remediated.
  Result-reference retention now owns its turn bookkeeping across clarification
  replies; `IntentWorkflow` no longer carries ceremonial duplicate state;
  benchmark structural validation and spoken ordinal parsing use shared
  primitives; and local alarm stores require an injected clock.

Acceptance criteria:

- Only declared, confirmation-free reads execute before terminal validation;
  no write occurs before approval.
- The workflow permits at most two reads and one clarification, remains one
  serialized assistant transaction, and stops on the first failure.
- Private provider IDs and internal diagnostics never enter provider
  observations or human responses.
- Timed and all-day events produce deterministic protected alarm confirmations
  and persist the same frozen instant after approval.
- Existing command, compound-plan, conversation, calendar-follow-up, and human
  runtime failure semantics remain compatible, and `npm run check` passes.

## Milestone 11: Calendar Result Follow-Ups

Status: implemented.

Goal: answer read-only follow-ups about calendar events displayed earlier in the
same assistant session.

Included:

- One process-local latest result set capped at ten opaque event references.
- Replacement on each new calendar result and expiry after three subsequent
  completed assistant turns or conversation compaction.
- Deterministic ordinal, location, summary, and next-event follow-up routing.
- Core-owned selection rejects conflicting or provider-guessed references,
  retains the latest explicit focus, and supports “the second one” followed by
  “what comes after it?”.
- Explicit clarification for ambiguous, missing, expired, and unavailable
  events without guessing.
- Read-only stable event lookup through mock and Google Calendar adapters.
- Safe OpenAI grounding containing only opaque references and displayed facts;
  private provider event IDs remain behind the execution resolver. Result data
  is serialized as delimited untrusted JSON with a tightly typed fact projection.
- Protected feature facts and no-wake voice continuation after calendar results.
- Deterministic core, feature, configured text, voice, and Google adapter tests,
  plus an explicit opt-in live OpenAI and Google Calendar smoke.

Excluded:

- Calendar creation, editing, deletion, or attendance changes.
- Persistent long-term memory or provider identifiers exposed to an LLM.
- Compound output binding such as scheduling an alarm from an event result.

Acceptance criteria:

- Follow-ups resolve only against unexpired results from the same assistant
  instance.
- Tests prove the ten-event cap, newest-set replacement, three-turn expiry, and
  immediate clearing during conversation compaction.
- Ambiguous, missing, or expired references ask for clarification and never
  guess an event.
- Provider IDs and raw event payloads do not enter user-facing responses or
  unrestricted conversation history.
- The Google Calendar adapter remains read-only and `npm run check` passes.

## Milestone 10: Compound Command Plans

Status: implemented.

Goal: allow one utterance to request a small, safe, ordered set of existing
capabilities, including checking upcoming events and setting an alarm.

Included:

- Separate raw `ProposedAssistantPlan` and immutable, core-validated
  `ValidatedAssistantPlan` contracts, bounded to three commands.
- Deterministic and OpenAI interpretation of single commands or compound plans.
- Whole-plan argument decoding, route resolution, and confirmation validation
  before any step executes.
- One aggregate confirmation containing every exact material fact rendered by
  confirmation-required capabilities, with the validated plan retained
  process-locally and resumed without reinterpretation.
- Sequential utterance-order execution that stops on the first failure and
  classifies every step as succeeded, failed, or skipped.
- Diagnostic-aware per-step outcomes with safe human summaries, protected facts,
  feature data, and no raw provider or adapter details.
- Text, simulated voice, desktop voice, Raspberry Pi service, deterministic
  configured-runtime, and opt-in live OpenAI smoke coverage.

Excluded:

- Provider-directed loops or dynamically generated follow-on commands.
- Passing one command's output into another command's arguments.
- Parallel execution, rollback, or transactional side-effect claims.
- More than three commands in one utterance.

Outcomes:

- Invalid plans execute no steps, including when only a later step is invalid.
- Explicit confirmation resumes the exact frozen plan; rejection discards it;
  unrelated input preserves the aggregate prompt.
- Single-command and compound-command handling share the same validation,
  confirmation, pending-plan, execution, and outcome pipeline.
- Confirmation fails closed when a capability's risk, metadata, or configuration
  requires confirmation but no deterministic renderer is declared.
- Provider schema parsing rejects mixed command, plan, conversation, and fallback
  branches instead of silently accepting ambiguous output.
- Deterministic compound interpretation rejects the entire request when any
  requested clause is unresolved and counts unresolved clauses toward the bound.
- Confirmed plan execution uses its validation-time clock so relative alarm
  actions persist and report the exact absolute time shown in the prompt.
- Independent maintainability review findings were addressed by consolidating
  orchestration, preserving textual command order, deepening immutable plan and
  route contracts, enriching outcome metadata, splitting the assistant plan
  tests, and adding desktop and Pi integration coverage.

Acceptance criteria:

- A calendar-and-alarm utterance produces a two-step plan and executes both in
  order after one aggregate confirmation.
- No step executes when any command is invalid or cannot be routed.
- Aggregate confirmation states every material decoded fact for each risky step.
- A failed step prevents later execution and reports completed, failed, and
  skipped actions without exposing internal diagnostics.
- Concurrent calls cannot interleave plan execution, pending confirmation, or
  conversation-history commits.
- Existing single-command behavior remains compatible and `npm run check`
  passes.

## Milestone 1: Deterministic Text Assistant

Status: implemented.

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

Status: implemented.

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
- An explicit yes on the next serialized assistant turn executes the already
  validated pending command without another provider interpretation; an
  explicit no discards it.
- Expected error categories are mapped to graceful assistant responses.
- Unexpected errors and feature failure causes are preserved for diagnostics and logged at runtime boundaries without exposing raw details in assistant responses.
- Adding a new feature requires feature-local code plus registration, without core changes.

## Milestone 1.6: Test Harness and Authoring Ergonomics

Status: implemented.

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

Status: implemented.

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

Status: implemented.

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

Status: implemented for the first provider track.

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
- Intent, conversation, and response rewriting reuse one provider-local OpenAI
  Responses config type and one labeled runtime parser; application ports stay
  provider-neutral.
- The OpenAI adapter calls the Responses API through injected `fetch`, requests
  structured JSON intent output, validates the returned command or response
  shape, and preserves provider failures as diagnostics.
- Intent, conversation, and rewriting use one labeled Responses transport
  client while retaining operation-specific error classes and diagnostics.
- Tests mock HTTP and environment dependencies; the checked-in default config
  remains deterministic.
- `npm run test:e2e:openai` provides opt-in live Responses API routing coverage
  for currently enabled feature capabilities using `OPENAI_API_KEY` from `.env`
  and `gpt-5.4-nano`; it is excluded from normal deterministic validation.

Completed implementation slices:

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
- `src/runtimes/config/config.ts` owns top-level config loading and assembly,
  while raw subsection parsing, assistant policy projection, intent provider
  resolution, voice adapter ID resolution, and desktop voice command resolution
  live in focused config modules.
- Provider-facing capability catalog construction lives in shared runtime
  composition and is reused by OpenAI intent provider selection.

### Milestone 4.2: Provider Adapter Contract Hardening

Status: implemented.

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

Implemented structure:

- `src/test-support/adapter-contract.ts` owns shared provider helpers for
  credential environments, deterministic JSON responses, non-OK response bodies,
  malformed JSON, transport failures, and abort-driven timeout tests.
- OpenAI intent adapter tests use the shared provider contract helpers for
  credential, provider response, malformed body, transport failure, and timeout
  paths while keeping OpenAI-specific request and output assertions local.
- The provider adapter checklist lives in `docs/03-boundaries-and-rules.md`.

### Milestone 4.3: Feature Adapter Registration Refinement

Status: implemented.

Goal: prepare feature adapter selection for real feature integrations such as
calendar or messaging providers.

Included:

- An explicit per-feature adapter registry shape that can receive narrow adapter
  dependencies and own typed parsing, construction, and startup preflight.
- Canonical feature adapter selection errors for missing adapter IDs, unknown
  adapter IDs, and unregistered adapters.
- Test-support helpers for focused raw feature adapter config variants.

Acceptance criteria:

- Mock/local feature adapters still compose through config.
- Adding a real feature adapter does not require new selection-policy branches
  outside the canonical feature adapter registry.
- Tests can load one-change raw adapter IDs or missing config fields without
  mutating already-resolved runtime config.

Implemented structure:

- Feature adapter registration uses an explicit nested feature-to-adapter
  registry, currently covering `calendar.mock`, `messaging.mock`, and
  `alarms.local`.
- Feature adapter factories receive a narrow runtime-owned context containing
  adapter dependencies and the selected feature config instead of broad loaded
  runtime config.
- Feature selection keeps canonical errors for missing adapter IDs, unknown
  feature IDs, and unregistered adapter IDs.
- Runtime composition test support includes one-change helpers for adapter IDs,
  missing adapter IDs, and enabled/disabled feature variants.

### Milestone 4.4: Next Real Provider Adapter

Status: implemented.

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

Implemented structure:

- `calendar.search_events` now runs through an application-owned calendar search
  port with optional query and date-range criteria; the deterministic fixture
  data lives behind a mock calendar adapter.
- `google` can be selected as the calendar feature adapter through local runtime
  config while the checked-in default config remains mock and deterministic.
- The Google Calendar adapter calls the read-only events list API through
  injected `fetch`, reads a configured OAuth access token or exchanges configured
  refresh-token credentials for one, validates provider output from `unknown`,
  and preserves provider failures as diagnostics.
- The optional OpenAI command response rewriter can post-process successful
  command responses into spoken-friendly wording while preserving the original
  safe feature response if rewriting fails.
- Upcoming calendar lists protect every displayed event title and date before
  rewriting; core restores nearby ISO dates with deterministic UTC calendar-week
  wording and uses spoken absolute dates farther out.
- Google timed starts preserve their event-local wall-clock time behind the
  calendar port; spoken responses protect and render that time naturally, while
  date-only events are explicitly identified as all day.

Ongoing hardening themes to keep checking during future provider work:

- Split broad runtime config into narrower core, provider, feature, and runtime
  composition shapes where that removes optionality or prevents provider/runtime
  settings from leaking through core contracts.
- Keep raw config parsing separate from runtime-specific resolution so selected
  provider, adapter, and command invariants are proved by one canonical owner;
  do not carry raw adapter config bags past the config boundary.
- Keep selected adapter config typed with the selected adapter factory rather
  than passing untyped config bags through generic contexts and casting later.
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
- Keep deterministic intent matching feature-local and capability-name keyed,
  but outside provider-facing capability metadata.
- Factor repeated voice runtime composition and shared wake phrase matching
  before adding another voice runtime or wake word adapter.
- Ensure nested runtime factories forward injected environment, network, clock,
  IO, and process dependencies rather than falling back to globals.
- Preserve live clock injection through long-running runtime composition instead
  of snapshotting a construction-time `Date`.
- Preserve captured command stdout/stderr for spawn, timeout, and non-zero exit
  diagnostics.
- Keep deterministic intent matching data-backed or feature-local once it grows
  beyond the initial fixture set.
- Keep cleanup failure handling aligned with shared runtime lifecycle semantics
  unless a runtime documents and tests a stricter failure policy.

## Milestone 5: Raspberry Pi Deployment

### Milestone 5.1: Service Runtime Boundary

Status: implemented.

Goal: define the long-running service runtime boundary before adding
Raspberry Pi-specific device behavior.

Included:

- A small service runtime contract with injectable stderr diagnostics, clock,
  config path, IO/process state, signal handling, retry policy, and shutdown
  hooks.
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

Implemented structure:

- `src/runtimes/service/service-runtime.ts` owns a neutral service loop with
  injectable assistant composition, turn execution, clock access, signal
  registration, retry behavior, stderr diagnostics, and shutdown hooks.
- `src/test-support/service-runtime.ts` provides service runtime dependency
  builders and injected signal controllers before broader service tests
  accumulate setup.
- Tests cover startup failure, one recoverable loop failure, graceful signal
  shutdown, safe fallback outcomes, diagnostic logging, and signal cleanup.

### Milestone 5.2: Raspberry Pi Deployment

Status: implemented.

Goal: provide the repository runtime needed to run the assistant on a Raspberry
Pi as a long-running personal assistant process.

Included:

- Raspberry Pi runtime.
- Pi-specific audio configuration.
- Service command.
- Deployment notes for running the service command locally on a device.
- Device-specific config.
- Logging suitable for a long-running service.

Acceptance criteria:

- The Pi runtime uses the same assistant core.
- Pi-specific dependencies are isolated to adapters and runtime code.
- The assistant can start, process commands, and shut down cleanly.

Implemented structure:

- `pi-service` runs a long-lived Raspberry Pi service loop from the CLI with an
  explicit local config path.
- The Pi runtime composes the neutral service runtime boundary, configured text
  assistant, shared voice-turn orchestration, and existing command-based voice
  adapters.
- Startup validates required voice adapter IDs and desktop command settings;
  invalid config returns a safe startup failure outcome while logging
  diagnostics internally.
- Recoverable voice turn failures are logged and retried through the service
  retry policy, while `SIGINT` and `SIGTERM` request graceful shutdown and
  abort active command-backed wake activation, capture, or transcription input.
- Temporary voice capture and speech files are cleaned up after each service
  turn.
- ARM64 Docker/QEMU userland smoke commands are documented as optional
  compatibility checks. At this milestone, automated Raspberry Pi OS
  provisioning and `systemd` validation were deferred; Milestone 7 later added
  portable structural validation for the unit and an operator deployment path.

### Milestone 5.3: Raspberry Pi OS QEMU Smoke Support

Status: implemented.

Goal: provide an opt-in Raspberry Pi OS QEMU smoke path for closer service and
OS simulation without making default validation depend on hardware, QEMU, or
downloaded OS images.

Included:

- `smoke:pi:qemu` script that validates explicit local Pi service config, image,
  kernel, DTB, and QEMU binary inputs.
- Stable dry-run output by default, with `--run` required before spawning QEMU.
- Operator overrides for QEMU binary path, SSH host port, memory, and CPU count.
- A small executable wrapper around injectable parse, preflight, command-build,
  and run helpers.
- Documentation for required local artifacts, example usage, and limitations.

Excluded:

- Downloading or generating Raspberry Pi OS images, kernels, or DTBs.
- Automated guest provisioning or `systemd` installation.
- Inclusion in `npm run check` or repository hooks.

Acceptance criteria:

- The script prints a reproducible QEMU command by default.
- Missing artifacts, missing QEMU, and invalid numeric options fail before
  spawn with clear operator-facing messages.
- QEMU is spawned only when `--run` is explicit.
- README, AGENTS, runtime docs, and roadmap describe the smoke path and limits.

### Milestone 5.4: Desktop Voice Service Activation

Status: implemented.

Goal: provide true desktop voice activation without adding native wake-word SDKs
or live provider dependencies to the deterministic validation gate.

Included:

- `npm start` default entrypoint for the desktop OpenAI voice service using
  `config/local-desktop-voice-openai.json`, including a more sensitive
  OpenWakeWord `--threshold 0.25` default.
- `desktop-voice-service` CLI command with an explicit local config path.
- `npm run smoke:desktop-voice:openai` opt-in file-fed smoke for local
  openWakeWord activation plus live OpenAI realtime command transcription,
  assistant handling, and streaming spoken output.
- Two-stage command-based activation: short wake-window capture followed by a
  separate command utterance capture.
- Shared voice activation orchestration that reuses assistant diagnostics,
  spoken response fallback, wake phrase matching, and service-loop retry
  semantics.
- Required `desktopVoice.wakeAudioInput` command config for the service runtime.

Acceptance criteria:

- Missing wake audio config fails at startup with a safe human-facing response
  and internal diagnostics.
- Non-wake audio is ignored without invoking the assistant.
- Wake detection captures and transcribes a separate command utterance before
  invoking the assistant core.
- Recoverable activation failures are logged and retried by the service loop.
- Shutdown signals abort long-running wake activation, capture, or
  transcription input instead of waiting for a wake phrase or command timeout.
- One-shot desktop voice behavior remains backward compatible.

## Milestone 6: Persistent Local Assistant State

Status: implemented.

Goal: establish a persistent local-state foundation that survives process
restarts while preserving the existing ports-and-adapters boundaries.

This milestone should stay intentionally narrow. Persistent state belongs behind
application-owned ports, is selected by runtime config, and must not push file
system details into core or feature logic.

### Milestone 6.1: File-Backed Alarm Store

Status: implemented.

Goal: add a persistent local alarm store adapter behind the existing
`AlarmStore` port.

Included:

- A JSON-file-backed alarm store adapter selected through
  `features.alarms.adapter`.
- Asynchronous `AlarmStore` operations so feature success is returned only
  after persistence completes.
- Runtime config for the local alarm store file path.
- Field-by-field parsing and validation of stored alarm data from `unknown`.
- Atomic or failure-aware write behavior documented and tested at the adapter
  boundary.
- Adapter contract or local persistence test-support helpers if setup starts to
  repeat.
- README, AGENTS, and docs updates describing the persistent alarm option.

Excluded:

- Database dependencies.
- Cloud sync.
- Recurring alarms unless a separate capability slice justifies them.
- Reminder scheduling or background notification delivery.

Acceptance criteria:

- The default checked-in config remains deterministic and safe for tests.
- The in-memory alarm store remains available.
- A configured file-backed alarm store preserves alarms across adapter
  instances.
- Alarm creation and listing await persistence and surface store failures
  through the existing diagnostic-safe feature failure boundary.
- Missing persisted data initializes an empty store. Malformed, unreadable, or
  unsupported persisted data fails safely with internal diagnostics and no raw
  file system details in human-facing responses.
- Tests cover persistence, invalid persisted data, write failure diagnostics,
  and runtime config selection.
- `npm run check` passes.

### Milestone 6.2: State Configuration and Lifecycle Hardening

Status: implemented.

Goal: make stateful local adapters predictable across CLI, desktop voice, and
service runtimes.

Included:

- A canonical runtime-owned resolver for local state paths and state adapter
  config.
- Clear lifecycle rules for reading, writing, and cleanup of local state.
- Tests proving nested runtime factories forward injected IO, clock, and config
  dependencies to stateful adapters.
- Documentation for local config examples that keep machine-specific paths out
  of `config/default.json`.

Excluded:

- A general repository-wide persistence framework before a second stateful
  adapter proves the shape.
- Cross-device sync.
- Background scheduling.

Acceptance criteria:

- Config parsing remains separate from runtime-specific state resolution.
- Stateful adapters receive the narrowest validated config they need.
- CLI, desktop voice, and Pi service composition can select the persistent
  alarm store without duplicating adapter-selection policy.
- Tests use focused runtime-composition helpers rather than broad inline config
  spreads.

## Milestone 7: Raspberry Pi Operations Hardening

Status: implemented.

Goal: turn the implemented Pi service command into an operator-friendly device
deployment path without making default validation depend on Raspberry Pi
hardware.

Included:

- `systemd` unit template and installation notes.
- Local config examples for command-based Pi audio, STT, TTS, and output.
- Log and restart guidance for long-running service operation.
- Optional smoke or checklist coverage for generated service files and expected
  command invocation.
- A dedicated `personal-ai` service account with `/opt/personal-ai`,
  `/etc/personal-ai`, and `/var/lib/personal-ai` ownership boundaries.
- An opt-in live OpenAI smoke proving confirmed durable alarm creation through
  Pi service composition without claiming audio hardware coverage.

Excluded:

- Downloading Raspberry Pi OS images.
- Automated image provisioning.
- Hardware-in-the-loop tests in `npm run check`.

Acceptance criteria:

- A human can install and run the service under `systemd` using documented
  commands and local config.
- Service files do not embed credentials or machine-specific secrets.
- Documentation clearly separates deterministic repository validation from
  opt-in device validation.
- Any generated deployment artifacts are tested without requiring real Pi
  hardware.

## Milestone 8: Operational Alarm Delivery

Status: implemented.

Goal: turn persisted alarm records into alarms that trigger reliably in the
long-running desktop and Raspberry Pi service runtimes.

Included:

- A neutral runtime-owned alarm scheduler behind an application port rather than
  feature or adapter polling logic.
- Injected clock, timer, and shutdown dependencies so due-alarm behavior remains
  deterministic and service shutdown cannot strand waits.
- Startup recovery for future and overdue alarms with an explicit, tested
  missed-alarm policy.
- An alarm-delivery port with desktop and Raspberry Pi audio or spoken delivery
  adapters selected through local runtime config.
- Durable alarm lifecycle state that prevents an acknowledged or completed alarm
  from repeatedly firing after process restart.
- Human-facing acknowledgement, dismissal, and cancellation paths with internal
  diagnostics and graceful delivery-failure responses.
- Deterministic scheduler, full-composition restart, clock-change, shutdown, and
  delivery-failure tests, plus an explicit opt-in Pi composition delivery smoke
  and a separate manual hardware checklist.

Excluded:

- Recurring alarms, snoozing, and arbitrary rescheduling, which belong in
  Milestone 8.1.
- Cloud synchronization or coordination between multiple assistant processes.
- Hardware-in-the-loop checks in the default validation gate.

Acceptance criteria:

- A confirmed persisted alarm fires once at or after its due time while the
  service is running.
- Restarting before an alarm is due preserves delivery, and restarting after its
  due time follows the documented missed-alarm policy without duplicate delivery.
- Desktop and Raspberry Pi service composition use the same neutral scheduling
  semantics and adapter-owned delivery paths.
- Delivery failures preserve useful internal diagnostics without exposing raw
  command, provider, credential, or stack details to the user.
- Shutdown cancels scheduler waits promptly and still runs normal service cleanup.
- The default checked-in config and validation remain deterministic and require
  neither live providers nor audio hardware.
- `npm run check` passes.

### Milestone 8.1: Alarm Usability and Lifecycle Controls

Status: implemented.

Goal: make operational alarms convenient to manage after reliable one-shot
delivery exists.

Included:

- Snooze with an explicit new due time and durable lifecycle transition.
- Recurring alarm schedules with field-by-field validation of persisted rules.
- Reschedule and edit operations that preserve stable alarm identity.
- Human-facing alarm status that distinguishes scheduled, ringing, snoozed,
  completed, dismissed, and missed alarms without exposing internal state names
  unless technical detail is requested.
- Retention and cleanup policy for completed, dismissed, cancelled, or missed
  alarm history.
- Confirmation policy for destructive or surprising lifecycle changes.

Implemented slices:

- Revision-checked snooze, reschedule, and label-edit commands with stable alarm
  identity and confirmation for rescheduling.
- Human-facing list responses for scheduled, snoozed, ringing, completed,
  dismissed, cancelled, and missed alarms.
- Daily and weekly recurrence with explicit IANA timezones, deterministic
  daylight-saving behavior, stable identity, downtime catch-up, and persisted
  restart coverage.
- Runtime-owned 30-day terminal-history cleanup at startup and daily, serialized
  through the selected store with active and cutoff-boundary records retained.
- Independent maintainability review fixes protecting every rewritten lifecycle
  fact, pinning optimistic retries, ignoring ineligible retained history,
  cloning nested recurrence state, decoupling retention from delivery, and
  centralizing strict schema and recurrence transition policy.

Excluded:

- Calendar reminders or a general task scheduler unless a later milestone first
  defines their separate product and port boundaries.
- Cross-device alarm synchronization.

Acceptance criteria:

- Snoozed and recurring alarms survive restart and do not duplicate delivery.
- Editing, rescheduling, dismissal, and cancellation are serialized with
  scheduler observation so stale due work cannot fire afterward.
- Retention cleanup cannot remove active alarms and reports failures through the
  diagnostic-safe runtime boundary.
- Intent fixtures, live-provider prompts, capability metadata, and spoken
  summaries remain aligned with the supported alarm operations.
- `npm run check` passes.

## Spike 12: Local Voice Device Benchmark

Status: implemented with an explicit desktop no-go.

The spike added immutable candidate, policy, personal-recording, TTS-response,
artifact, validated raw-result, and generated-report contracts. The WSL2 benchmark ran
whisper.cpp `base.en` and `small.en`, sherpa-onnx Zipformer 20M int8, Piper Alba
medium, and sherpa-onnx Amy low with one excluded warm-up and three isolated
repetitions per sample.

No candidate passed the measured desktop correctness and performance gates.
Subjective TTS ratings were deferred because both candidates first failed the
hard batch-ready latency/RTF screen. The report explicitly marks network
isolation, installed size, shutdown latency, thermal state, LibriSpeech scoring,
and true streaming first-audio/finalization latency as unavailable rather than
inventing values for them. Raspberry Pi
measurements were explicitly deferred because hardware was unavailable.
Milestones 13 and 14 therefore remain blocked rather than registering an
unfit production adapter. Raw measurements and the reproducible report live
under `benchmarks/voice/results/`.
