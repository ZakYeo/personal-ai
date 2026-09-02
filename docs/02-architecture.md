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
  -> Intent Session
  -> 0..2 Core-Validated Reads
  -> 0..1 User Clarification
  -> Terminal Interpretation
  -> Feature Selection
  -> Feature Execution
  -> Assistant Response
```

The text-first flow is the preferred first milestone because it is deterministic and easy to test. Voice support should wrap the same core instead of creating a separate path.

## Main Modules

```text
src/
  application/
    capability-catalog
    feature
    human-text
    temporal-policy
    feature-domain policies
  core/
    assistant/
  ports/
    assistant
    conversation
    intent
    response-rewriter
    feature
    capability-catalog
    alarm-store
    task-store
    calendar
    process-control
    voice
  features/
    assistant/
    alarms/
    calendar/
    internet-search/
    messaging/
    tasks/
    weather/
  adapters/
    desktop/
    google-calendar/
    local/
    mock/
    open-meteo/
    openai/
  runtimes/
    cli/
    config/
    feature-adapters/
    pi/
    service/
    tasks/
    voice/
```

This structure is illustrative. The implementation can adjust names and file layout, but the dependency direction must stay intact.

## Core

The core coordinates assistant behavior:

- Receives normalized user input.
- Tracks conversation/session context.
- Calls the configured intent interpreter.
- Applies one core-owned, provider-neutral semantic guard to every command
  proposed through an intent session:
  required string values cannot merely echo the whole request, narrow action
  questions cannot become broad capability-list commands, and clarification
  status is canonicalized before core stores the pending interaction.
- Owns bounded intent-session orchestration: at most two declared reads, one
  clarification, no parallel calls, and no provider-directed retry after a
  validation or feature failure.
- Routes general conversation turns to the configured conversation responder.
- Chooses or invokes feature plugins.
- Applies validation and confirmation rules.
- Retains at most one process-local validated command while awaiting an explicit
  yes or no, and serializes turns that inspect or change that pending state.
- Retains one process-local pending interaction, either confirmation or
  clarification. A clarification answer resumes the exact provider session; a
  changed-topic reply may discard it and start one fresh workflow from the
  trusted reply; a resulting confirmation replaces it without reinterpretation.
  Confirmed execution stays inside the originating intent-workflow closure, so
  a later feature clarification still resumes the same provider session. Core
  owns transition legality and carries only the safe original request, prompt,
  origin, selected capability, and requested parameter into a continuation. A terminal result
  for a different capability is treated as replacement even if the provider
  omitted that transition marker.
- Treats an open rephrase prompt as a follow-up signal without pending workflow
  state. Semantic validation that replaces an outstanding provider tool call
  with a clarification restarts provider transport with safe context rather
  than sending a user reply where a tool result is required. Directly resolved
  clarification replies are validated against the latest trusted user turn.
- Produces structured assistant responses.

The core must not know whether input came from a microphone, CLI, test fixture, HTTP request, or Raspberry Pi device.

## Application

The application layer owns provider-neutral executable policy shared across
core, features, adapters, and runtimes. It includes feature and capability
builders, immutable catalog compilation, human-text and temporal safety, and
domain rules shared by multiple implementations. Application modules may
depend on ports and other application modules, but not on core, feature,
adapter, or runtime implementations.

## Ports

Ports contain only interfaces, application-owned contracts, and the shared
boundary types needed to express them. They describe what the application
needs without naming any specific provider or device. Executable policy and
builders belong in `src/application`, not `src/ports`.
Provider credentials, transport settings, and device command execution config
belong with their adapters even when runtime config parsing consumes those
types.
Provider configuration types belong with their adapters and runtime config
parsers, not in application port modules.

Implemented application ports include:

- Assistant response and diagnostic-aware outcome contracts.
- Intent-session, safe tool-observation, and deterministic feature-rule
  contracts.
- Conversation response and compaction contracts.
- Command response rewriting contracts.
- Feature, capability metadata, execution context, and capability-catalog
  contracts.
- `AlarmStore` for storing alarms, assigning storage-owned alarm IDs, and
  revision-checking durable lifecycle transitions.
- `AlarmDeliveryPort` for runtime-owned delivery without coupling scheduling to
  a particular voice or device adapter.
- `TaskStore` for versioned named lists, revision-checked task mutations, and
  durable reminder lifecycle transitions that remain separate from alarms.
- `NotificationDeliveryPort` for neutral runtime-task output; alarm tasks adapt
  their delivery records into human-facing notifications before voice output.
- Provider-neutral internet-search, weather, and weather-watch store contracts.
- Calendar search and upcoming-event contracts.
- Process shutdown and command-execution control contracts.
- Batch and streaming voice input, wake activation, transcription, synthesis,
  and output contracts.

## Adapters

Adapters implement ports.

Deterministic and local adapters include:

- Deterministic intent interpreter.
- Mock speech-to-text adapter.
- Mock text-to-speech adapter.
- Command-based desktop speech-to-text adapter.
- Command-based desktop text-to-speech adapter.
- SoX-compatible desktop audio input and output adapters.
- Mock calendar adapter.
- Mock messaging adapter.
- Mock internet-search and weather adapters.
- Local/in-memory and versioned JSON-file alarm storage adapters implementing
  the alarm store port. Their shared lifecycle state machine advances daily and
  weekly schedules atomically with explicit timezone and daylight-saving
  semantics.
- Local/in-memory and versioned JSON-file task storage adapters implementing
  the task store port with cloned records, deterministic schema migration,
  revision checks, and atomic durable replacement.
- Local/in-memory and versioned JSON-file profile storage adapters containing
  only validated user-authored facts with provenance and timestamps.
- A voice alarm-delivery adapter that composes the configured synthesis and
  audio-output path for each delivery attempt. A runtime-owned output
  coordinator serializes that path with ordinary response speech without
  coupling or blocking wake/input capture.

Implemented real-provider adapters include:

- OpenAI intent interpreter adapter using the Responses API with one strict
  root-object schema containing a nested tagged union for mutually exclusive
  terminal interpretations.
- OpenAI conversation responder and compactor adapters using the Responses API.
- OpenAI response rewriting, realtime transcription, and streaming speech
  adapters.
- OpenAI hosted web-search adapter with bounded citation validation.
- Key-free Open-Meteo geocoding and forecast adapter for non-commercial use;
  provider-neutral candidates retain ranking and safe place metadata separately
  from the selected forecast location.
- Read-only Google Calendar search with access-token and refresh-token OAuth.
- Command-based desktop voice adapters and a Python openWakeWord sidecar behind
  TypeScript-owned adapter and runtime boundaries.

Future providers such as Anthropic, local models, local STT/TTS, or real
messaging integrations should be added behind the same application-owned ports.

## Capability Expansion

Milestones 13 through 17 extend the application through new ports and feature
adapters without making features import or invoke one another:

- A profile store port owns explicit user-authored facts and a separate narrow
  read-only personal-context port exposes only requested fields to composed
  consumers. Intent providers may propose profile commands from text or voice,
  but only decoded application commands can mutate the store.
  Runtime composition projects only preferred name and response style into each
  assistant turn's provider context. Feature-specific consumers use separate
  typed projections; weather receives only the stored home location.
  A `profile.lookup` capability is an eligible bounded read tool for exactly one
  named profile field. When its safe observation reports a missing fact, the
  read contributes an application-authored clarification declaration. Core
  asks that question, converts the explicit answer into a validated
  `profile.set` step, and then resumes the provider-selected terminal command or
  plan. The mechanism is target-feature-neutral and changed-topic replies are
  handled before any save step is constructed.
- Implemented internet search uses a read-only provider port with deterministic
  and OpenAI Responses web-search adapters. Core retains at most ten safe opaque
  source snapshots for three subsequent completed turns without inventing or
  retaining provider result IDs. The adapter validates every returned
  annotation and projects excess valid sources into the configured result
  limit without retaining claims supported only by excluded citations. One
  application-owned human-text policy sanitizes answers, titles, and extracts before
  speech or result-reference retention. The feature exposes those natural
  source titles plus separate validated link metadata; retrieved text remains
  untrusted external data.
- Weather uses provider-neutral current and forecast ports with Open-Meteo as
  the selected key-free non-commercial adapter. Durable weather watches are
  owned by the weather adapter, which contributes a neutral background task
  closing over the same watch store and provider instance.
- Core applies one application-owned human-text policy after model rewriting
  and at tool-observation and runtime-output boundaries. OpenAI prompts request
  natural spoken dates, times, timezones, and source titles first; the shared
  deterministic policy then removes visible link targets and renders ISO/RFC
  instants in an explicitly declared subject timezone or the configured assistant
  timezone. Feature results declare subject-local rendering context rather than
  relying on fact-name inference; protected calendar dates retain their explicit
  UTC-day rendering mode. Neutral service composition applies the same policy to
  every notification delivery before a configured or injected adapter receives it.
  Exact values stay in feature data, protected facts, citations, and diagnostics.
- Lists and tasks use their own revision-checked store. Reminder delivery closes
  over that exact store and remains separate from alarm state even when both use
  the neutral notification and output-coordination boundaries.
- Daily briefings use an application-owned aggregator over fixed narrow read
  ports for configured sources. The aggregator does not call feature plugins or
  delegate source selection to an intent provider.

Profile, search-result, weather-result, task-result, and briefing contracts
remain application-owned. Provider credentials, transport, persistence paths,
and selected adapter configuration remain adapter/runtime concerns. Smart-home
control, a personal knowledge library, and adaptive memory are intentionally
uncommitted until later discovery defines their boundaries.

## Compound Command Boundary

Compound commands use two explicit application-owned stages. Intent providers return
either one raw proposed command or a `ProposedAssistantPlan` of at most three
raw proposed commands. Parameters are still untrusted provider output at this
boundary. Core resolves each capability route, decodes and validates every
argument, evaluates confirmation policy, and deterministically renders the
confirmation facts before constructing an immutable `ValidatedAssistantPlan`.
Only that validated type may become pending or execute.

The validated plan retains the stable capability and feature route, decoded
arguments, confirmation decision and protected summary facts for every step.
Core, not the provider or a feature, aggregates confirmation, retains the exact
pending plan, executes its steps in order, stops on the first failure, and
combines diagnostic-aware outcomes.

Plans compose existing capabilities through the immutable routing index.
Feature plugins will continue to execute one validated command at a time and
will not import or call one another. The first plan boundary will not bind one
step's output into another step's arguments or run a provider-directed tool
loop. Implemented calendar and weather result references remain opaque and
assistant-session-owned. Calendar retains one latest set capped at ten events;
weather retains the selected location from a successful weather read. A new
result of the same kind replaces the prior set, and references clear after
three subsequent completed assistant turns or a later conversation compaction.
A result set created by the compacting turn is preserved. Intent providers
receive only opaque references and safe displayed facts; feature execution
resolves private event IDs and full weather coordinates through the
assistant-owned session. This deterministic context bridge, rather than broad
chat-history access, lets an omitted weather location mean the unambiguous
location used by the preceding weather answer.

Bounded intent orchestration lives in a core-owned `IntentWorkflow`
transaction. It accumulates diagnostic-safe read metadata across provider
continuations, clarification, confirmation, and terminal execution. Successful
intermediate reads use the feature's human-safe result directly and bypass the
optional final-response rewriter; only terminal human responses are rewritten.
Post-start intent-session failures become safe `unexpected` outcomes without
discarding completed-read metadata.

## Runtimes

Runtimes wire the application together for a specific environment.
Runtime config loading retains the absolute directory of the selected config as
composition context. Stateful feature registries use that context to resolve
relative local paths before constructing adapters, so application ports and
feature logic never receive file-system path policy.
The alarms adapter contributes a neutral runtime background task that closes
over the exact `AlarmStore` used by its feature commands. Generic feature
selection collects tasks without importing feature-specific resources, and the
service runtime only owns task startup, shutdown, diagnostics, and fatal
outcomes. This keeps restart recovery and delivery claims on one serialized
state boundary without turning the generic registry into an optional resource
bag.
A second neutral alarm task removes terminal history older than 30 days at
service startup and daily. It shares the selected store, whose serialization
keeps cleanup ordered with feature mutations and scheduler claims.
The tasks adapter contributes the equivalent neutral reminder-delivery and
retention tasks around its exact `TaskStore`. Reminder claims persist before
notification output, successful delivery does not complete the task, and
startup reports rather than automatically replays an interrupted claim. The
retention task removes old terminal reminder details without removing the
underlying task.
Shared alarm lifecycle policy owns status predicates, canonical recurrence and
timestamp validation, strict persisted-version parsing, and explicit recurring
completion. Store adapters clone nested recurrence values at their boundaries.

Expected runtimes:

- CLI runtime for deterministic text commands.
- Desktop voice runtime for local microphone and speaker development.
- Neutral service runtime boundary for long-running startup, loop failure,
  signal, and shutdown behavior.
- Raspberry Pi service runtime for deployment as a long-running device process
  using explicit local command-based voice configuration.
- Raspberry Pi systemd composition outside the TypeScript runtime: root-owned
  application files in `/opt/personal-ai`, operator config and credentials in
  `/etc/personal-ai`, and service-owned durable state in `/var/lib/personal-ai`.

The assistant core should not contain desktop-specific or Raspberry Pi-specific imports.

## LLM Role

The LLM should help with:

- Natural-language interpretation.
- Structured command proposal.
- Feature/tool selection.
- Summarization.
- Drafting responses.
- Asking clarification questions.
- General Q&A and casual conversation.
- Recording every completed safe user/assistant exchange, supplying a frozen
  untrusted-context snapshot to intent and conversation providers, and
  compacting older history into a safe summary.

The LLM should not directly perform irreversible actions. The core must validate structured commands and route side effects through feature plugins.

## TypeScript and Python

The main application should be TypeScript unless a future decision changes this explicitly.

TypeScript is preferred for:

- Strong interfaces for ports and adapters.
- Dependency graph enforcement.
- API-heavy integration work.
- Testable orchestration logic.
- Possible future web/admin tooling.

Python is used for the local openWakeWord sidecar and may be used for other
specialized speech or ML adapters when justified. It remains behind a TypeScript
port as a child process, local service, or isolated adapter boundary.

## Documentation Maintenance

Keep this architecture document aligned with the implemented module layout, ports, adapters, runtimes, and dependency direction. Any architecture-affecting code change should update `README.md`, `AGENTS.md`, and the relevant `docs/` files in the same thin TDD slice.
