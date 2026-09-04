# Implemented Milestone Archive

This document preserves the detailed scope, exclusions, acceptance criteria,
and outcomes for completed implementation milestones. The active roadmap and
future ordering remain in `docs/06-implementation-roadmap.md`.

## Milestone 18: Desktop Presence and Command Center

Status: implemented after midpoint and final independent thermonuclear
maintainability reviews.

Goal: give the existing always-listening service a native desktop presence that
makes wake, transcript, processing, exact confirmation, response, speaking,
completion, privacy, and safe-failure state visible.

Included:

- A frozen, bounded runtime-owned presentation state machine with replay-capable
  events, sanitized narrow command-center projections, and serialized live
  projection refresh after terminal interactions and background changes.
- Authenticated loopback WebSocket IPC with strict field-by-field protocol
  parsing, payload and rate bounds, single-client ownership, correlated control
  results, safe reconnect/replay, and cross-window state relay without token
  sharing.
- A Windows-first Tauri 2 shell with hidden-at-start windows, tray,
  single-instance activation, autostart, persistent window state, global
  shortcut, HTTPS-only source opening, and an always-on-top overlay.
- A React and TypeScript MVVM interface whose framework-neutral models and view
  models depend on typed ports, whose passive views use shared components, and
  whose infrastructure adapters alone own browser and native APIs.
- Today, task, alarm, safe interaction, source, explicit profile, integration,
  activity, and settings views. Profile explanation, correction, and deletion
  use typed application-owned controls over the exact composed profile store.
- Atomic continuation ownership across voice and UI confirmation, bounded
  follow-up terminal handling, safe control-result feedback, internal boundary
  diagnostics, and explicit deferral of interruption controls to Milestone 19.
- Desktop-specific dependency-cruiser, ESLint, duplication, Semgrep rule and
  rule-fixture gates; Vitest model, view-model, component, adapter, protocol,
  runtime, and race coverage; Playwright real-IPC, malformed-input, reconnect,
  behavior, responsive-layout, auto-dismiss, and screenshot coverage; and a
  Windows native compile/test/package workflow.

Excluded:

- Feature policy in the UI, raw store or provider access, internal diagnostics,
  credentials or private targets in presentation state, remote IPC, hidden
  microphone capture, and any UI dependency in CLI or Raspberry Pi runtimes.
- Voice interruption and barge-in, which remain Milestone 19 work and are not
  represented by an active desktop control.

Review outcomes:

- The requested midpoint thermonuclear review found publisher ownership,
  boundary parsing, composition, MVVM modularity, UI quality gates, and test
  depth issues. Each finding was remediated in focused tested slices before the
  remaining implementation continued.
- The fresh final review found a voice/UI continuation race, stale projections,
  fire-and-forget controls, misleading interruption UI, absent typed profile
  controls, incomplete follow-up caps, incomplete native proof, swallowed
  boundary failures, insufficient real-path Playwright coverage, and a narrow
  Semgrep ownership matcher. Every actionable finding was remediated before
  completion.

Acceptance outcome:

- The graphical shell observes but does not replace the desktop voice service;
  headless CLI, voice, service, and Pi composition remain independent.
- Exact confirmation resumes the already validated core-owned interaction once,
  even when voice and UI inputs race.
- Real-browser coverage proves authenticated wake-to-overlay state, live
  transcript, confirmation acceptance and safe rejection, correlated controls,
  reconnect/replay, malformed-message fail-closed handling, automatic dismissal,
  responsive layout, and screenshot contracts.
- The full repository validation gate passes after both independent reviews and
  all remediation.

## Milestone 17: Daily Briefings and Scheduled Delivery

Status: implemented after an independent thermonuclear maintainability review.

Goal: combine explicit personal context and enabled read capabilities into a
concise, user-owned on-demand or scheduled briefing.

Included:

- Fixed application-owned aggregation over narrow profile, calendar, weather,
  alarm, task, and optional internet-search readers. Source content cannot add
  tools, sections, permissions, or actions.
- Short, standard, and attention-only modes; stable opaque item identities; and
  bounded comparison with the most recent completed briefing snapshot.
- Explicit section, length, quiet-hour, timezone, weekday, and up-to-three-topic
  preferences, with confirmed schedule changes and deterministic text routing.
- Versioned in-memory and atomic JSON-file state with restrictive permissions,
  strict external-state validation, revision checks, and bounded retention.
- Claim-before-read delivery slots, restart-safe at-most-once source work,
  same-day quiet-hour deferral, isolated source failures, and subject-timezone
  delivery through the shared notification and voice output path.
- Deterministic text, service, desktop/Pi voice, failure, daylight-saving,
  restart, persistence, and opt-in live OpenAI intent coverage.

Excluded:

- Autonomous actions based on briefing content, provider-selected sources or
  sections, open-ended planning, advertising, continuous surveillance, or
  treating one optional source failure as failure of the whole briefing.

Review outcomes:

- The fresh thermonuclear review found scheduler ordering, delivery identity,
  deterministic routing, source bounds/citation association, boundary width,
  notification timezone, comparison stability, weather-policy drift,
  per-topic isolation, persistence validation, response completeness, coverage,
  and documentation gaps. Every actionable finding was addressed in focused,
  tested commits before milestone completion.
- Provider reads now occur only after a durable claim; post-claim failures remain
  an unknown claimed outcome and are never automatically retried.
- Internet answers and citations are projected together into the spoken mode's
  exact retained items, and weather uses the same validated exact-location and
  qualitative condition policy as the normal weather capability.

Acceptance criteria:

- On-demand and scheduled briefings combine only enabled user-selected sections
  and identify unavailable sections without exposing internal diagnostics.
- Scheduled delivery occurs at most once per local slot across restart and
  respects selected weekdays, timezone, daylight-saving changes, and quiet
  hours.
- Durable state rejects contradictory slots, duplicate bounded identities, and
  malformed preferences or snapshots, while exact source facts remain in safe
  structured data.
- The full deterministic `npm run check` validation gate passes; live OpenAI
  aggregation remains explicit opt-in through
  `npm run test:e2e:openai:briefing`.

## Milestone 13: Explicit Personal Profile and Preferences

Status: implemented.

Goal: give the assistant durable, user-controlled personal context so enabled
features can produce relevant answers without retaining conversation transcripts
or silently inferring personal facts.

Included:

- Typed profile facts for exactly preferred name, birth date, pronouns, home
  timezone, home location, interests, and response style. Age is derived from
  birth date at read time.
- Explicit set, show, explain, correct, forget, and confirmed complete-clear
  capabilities with user-authored provenance and created/updated timestamps.
- Versioned in-memory and atomic JSON-file stores with restrictive permissions,
  config-directory-relative paths, and external-state validation from `unknown`.
- A frozen per-turn personalization projection containing only preferred name
  and response style for model system contexts, plus narrow field readers for
  consumers that explicitly need another detail.
- A target-neutral `profile.lookup` read tool for any selected capability. When
  a needed fact is absent, the application discloses that the reply will be
  saved, validates it through `profile.set`, saves before execution, and resumes
  the exact selected capability in the same bounded intent workflow.
- Deterministic text and voice restart coverage, a mocked configured OpenAI
  smoke spanning durable profile state and weather-at-home resolution, and an
  explicit opt-in live OpenAI profile-routing smoke.

Excluded:

- Automatic extraction from normal conversation, inferred traits, transcript
  retention, embeddings, cloud synchronization, or general long-term memory.
- Unbounded custom schemas, whole-profile provider injection, hardcoded user
  details, or setup-time profile requirements.
- Provider-owned persistence, target-specific missing-detail prompt cases, or
  writes after a clarification reply that changes topic.

Outcomes:

- Normal text and voice requests produce decoded, validated profile commands;
  neither conversation nor provider memory can directly persist a fact.
- Preferred name and response style are automatically available to intent,
  conversation, compaction, and response-rewriter providers when present. Other
  facts remain behind narrow requested-field reads.
- The same generic read/clarify/save/resume mechanism supports requests such as
  weather at home and internet search about the user without encoding either
  target as a special prompt case.
- Application-owned clarification declarations cross the tool-chain boundary as
  one typed result. The application synthesizes the exact profile write,
  canonicalizes it before the resumed action, and rejects duplicate or
  conflicting provider-proposed saves before execution.
- The fresh thermonuclear maintainability review produced four actionable
  findings, all addressed: save-before-resume order can no longer be bypassed;
  target clarification metadata is preserved without a bogus profile parameter;
  mutable cross-module clarification state was replaced by a discriminated
  result; and profile wiring, operations, responses, and deterministic matching
  now live in focused modules.

Acceptance criteria:

- Feature and runtime tests prove set/show/explain/correct/forget/clear behavior,
  derived age, confirmation, user-authored provenance, narrow projection, and
  durable restart behavior with malformed-state rejection.
- Generic workflow tests prove missing details are disclosed, saved, and used in
  order; exact provider saves are canonicalized; duplicates and conflicts fail
  closed; and changed-topic replies perform no profile write.
- OpenAI request tests prove application clarification context does not invent a
  target parameter, while terminal model output cannot invoke the internal-only
  profile lookup directly.
- Deterministic and mocked-provider smoke tests pass. The live OpenAI profile
  smoke remains explicit opt-in and is not part of the default validation gate.
- The final full `npm run check` passed with 1,394 tests passing and 34 opt-in
  tests skipped.

## Milestone 16: Personal Lists, Tasks, and Reminders

Status: implemented.

Goal: add durable everyday organization with lists, completable tasks, and
scheduled reminder delivery that remains distinct from alarm lifecycle state.

Included:

- Named lists with create, show, rename, and confirmed clear operations, plus
  tasks with labels, optional notes, due dates, completion state, and one
  optional reminder instant.
- Task add, remind, complete, reopen, edit, and confirmed remove capabilities
  authored through the shared typed feature-definition helpers.
- Versioned in-memory and atomic JSON-file stores with canonical external-data
  validation, revision-checked updates, restrictive file modes, migration
  coverage, and config-directory-relative state paths.
- Process-local opaque task references for ordinal follow-ups, with both the
  selected task revision and containing list revision pinned in private targets.
- A feature-owned neutral background task using the exact composed task store,
  injected clock, timer, shutdown, and notification dependencies, durable
  claim-before-delivery, restart recovery, and shared voice output coordination.
- Deterministic and OpenAI intent routing, bounded compound plans, text, voice,
  service, restart-deduplication, and explicit opt-in live OpenAI smoke coverage.

Excluded:

- Shared or collaborative lists, attachments, project-management workflows,
  automatic prioritization, recurring tasks, location-triggered reminders, or
  external task-provider synchronization.
- Treating reminder delivery as task completion, reusing alarm records as task
  state, or exposing private store IDs or diagnostics to intent providers.

Outcomes:

- Lists and tasks survive restart. Mutations validate expected revisions, while
  opaque result references fail closed if either the task or its containing list
  changes after display or confirmation.
- Reminder creation persists one exact instant before reporting success.
  Runtime delivery claims the reminder before output, recovers interrupted
  claims deterministically, does not silently complete the task, and does not
  redeliver a terminal reminder after restart.
- Delivered, acknowledged, and cancelled reminder history is retained for 30
  days through the live injected clock; active scheduled or claimed reminders
  and records exactly at the cutoff are preserved.
- Bulk list clearing and individual removal require deterministic protected
  confirmation. A confirmation resumes the already validated target without
  provider reinterpretation.
- OpenAI follow-up instructions require exact opaque task references from the
  current result catalog and forbid invented references. End-to-end mocked
  provider coverage proves normal ordinal follow-ups and stale confirmed-target
  rejection without exposing private store targets.
- The fresh thermonuclear maintainability review produced four actionable
  findings, all addressed: persisted state now rejects non-canonical text and
  impossible reminder chronology; task references pin containing-list
  revisions; terminal reminder history is bounded; and provider instructions
  plus end-to-end coverage enforce exact opaque task follow-ups.

Acceptance criteria:

- Durable file-store and runtime tests prove lists and tasks survive restart,
  malformed state fails safely, and revision-checked operations cannot silently
  overwrite newer state.
- Mocked OpenAI routing proves “remind me tomorrow at 9 to submit the form”
  creates one task with one protected reminder instant. Configured service tests
  prove delivery leaves that task incomplete.
- Feature and runtime tests prove follow-ups select only eligible items, stale
  references fail closed, and destructive list clearing confirms the exact
  affected list.
- Reminder-store, scheduler, and configured-service restart tests prove durable
  claim-before-output, failure diagnostics, bounded recovery, terminal
  retention, and deduplicated delivery.
- The final full `npm run check` passed with 1,082 tests passing and 16 opt-in
  tests skipped. The live OpenAI task-routing smoke remains explicit opt-in and
  was not used as completion evidence because external execution approval was
  not granted.

## Milestone 15: Weather, Forecasts, and Weather Watches

Status: implemented.

Goal: provide location-aware current weather and forecasts, then proactively
notify the user when explicitly requested forecast conditions are detected.

Included:

- Provider-neutral current, hourly, and daily forecast ports with deterministic
  and opt-in Open-Meteo adapters selected through the per-feature registry.
- Key-free Open-Meteo geocoding and non-commercial forecast composition with
  endpoint, timeout, response-size, attribution, and external-data validation.
- Provider-neutral ranked geocoding candidates with country-qualified matching:
  low-risk reads choose the best exact result while persistent watches require
  one unique result.
- Explicit locations plus one narrow optional reader for an explicitly stored
  profile home location. Successful weather reads retain one opaque recent
  weather-location reference for three subsequent completed turns; omitted
  locations use that reference before stored home, while explicit places and
  explicit home remain authoritative.
- Generalized weather clothing advice uses one semantic capability with a
  required item-assessment or outfit-recommendation goal, optional resolved
  location, and optional exact instant or inclusive period. Item assessment
  accepts arbitrary bounded names; open outfit requests do not require an item.
  The legacy `weather.coat` name remains a compatibility route.
- A separately configured provider-neutral clothing adviser receives only
  bounded selected conditions, explicit metric units, and the narrow goal. The
  mock and OpenAI Responses adapters return validated structured decisions;
  application code retains weather facts, attribution, condition summaries,
  and final wording while limiting outfits to four distinct spoken-safe items.
- Provider clarifications carry a partial command and requested parameter.
  Semantic validation executes an otherwise complete command when the requested
  value is optional and clarifies only genuinely absent required values.
- Protected observation and forecast facts covering timestamps, timezone,
  units, temperature, precipitation, wind, forecast period, attribution, and
  freshness.
- Concise request-aware weather speech keeps exact precipitation, wind, and
  fetch telemetry that was not requested in structured facts while describing notable
  conditions and observation freshness naturally with tense-correct current and
  forecast wording.
- Versioned in-memory and atomic JSON-file weather-watch stores with
  revision-checked lifecycle transitions, restrictive file modes, canonical
  validation, a maximum of 1,000 retained records, and a maximum of 24 active
  watches.
- A neutral feature-owned background task using the exact composed store and
  provider, with durable claim-before-delivery, restart-safe deduplication,
  shutdown-aware polling through the canonical runtime background-task timer,
  shared output coordination, and at most four concurrent forecast request
  groups.

Excluded:

- Emergency-warning guarantees, inferred precise location, continuous device
  tracking, climate analysis, autonomous schedule changes, or silent watch
  creation from ordinary forecast questions.
- Commercial Open-Meteo use, paid customer endpoints, weather credentials, or
  an API-key configuration path.
- Provider-specific resources in neutral runtime orchestration or treating
  notification delivery as permission for another capability.

Outcomes:

- Current, hourly, and daily answers preserve exact canonical provider facts
  and required Open-Meteo attribution while keeping human output concise.
  Provider output with mismatched request facts, invalid units, stale or
  unordered forecast points, out-of-period dates, or non-finite measurements
  fails safely.
- Cross-feature spoken-response hardening now asks configured models for natural
  local time and source phrasing, classifies opaque temporal facts for grammar,
  and applies a deterministic final policy across assistant, tool-read, CLI,
  notification, and TTS boundaries. Weather source URLs are retained as
  validated citations but only the provider title is spoken.
- Streaming speech timeout accounting now bounds connection and next-chunk
  inactivity without treating long, regularly progressing audio or consumer
  processing delays as a provider timeout; reader cancellation is also bounded
  so cleanup cannot hide the primary timeout or abort outcome.
- The fresh thermonuclear review hardened URL-first sanitization, broadened
  supported ISO/RFC and validated IANA detection, centralized temporal rendering,
  made weather timezone context explicit, unified retained search metadata with
  speech, and moved mandatory notification enforcement into neutral service
  composition.
- Local timestamps are accepted only when they round-trip to exactly one instant
  in the returned IANA timezone. Nonexistent daylight-saving times and ambiguous
  repeated local times are rejected instead of silently normalized.
- Watches support bounded rain, temperature, and wind conditions, explicit
  confirmation policy, listing and cancellation, durable lifecycle state, and
  at-most-once notification for one qualifying forecast window. Human responses
  state that watches are convenience notifications rather than guaranteed
  emergency alerts.
- Compatible active watches share one forecast request. Independent request
  groups run with bounded concurrency; provider, persistence, and delivery
  failures are isolated, queued work stops on shutdown, and failures preserve
  internal diagnostics without exposing adapter details.
- The fresh thermonuclear maintainability review produced five actionable
  findings, all addressed: persisted record limits and duplicate-ID rejection
  were made canonical; ambiguous Open-Meteo timestamps fail closed; weather
  semantic validation was centralized and strengthened; watch-condition policy
  was centralized; and evaluation gained an active-watch bound, request
  grouping, concurrency control, shutdown handling, and per-group/per-watch
  failure isolation.
- A fresh review of generalized weather dialogue was also fully remediated.
  Provider clarification metadata is now a typed invariant and cannot bypass
  missing required arguments; application-declared profile lookups remain an
  explicit narrow exception. Result references are isolated by kind, and
  weather location selection disables ordinal parsing so phrases such as
  “the second half of the day” cannot select a location accidentally.
- Clothing periods are bounded by inclusive local calendar dates in the
  resolved weather timezone, matching the Open-Meteo request boundary across
  offset changes. Current, forecast, stale, and clothing results share one
  canonical weather-fact envelope, while clothing condition selection and
  response construction are separate from capability orchestration. Failure
  responses therefore retain the same exact location, units, query period,
  freshness, and attribution facts as successful weather responses.
- The category classifier and fixed recommendation matrix were retired. Intent
  metadata and provider instructions now distinguish a named item from a fresh
  broad outfit request, and deterministic dialogue coverage reproduces the
  weather, hoodie, then “What would you recommend I wear?” sequence without a
  generic detail prompt. Adviser failures retain weather citations and facts in
  a safe response plus an internal feature diagnostic, and skip response
  rewriting.
- The fresh provider-backed clothing-advice thermonuclear review was fully
  remediated. Clothing-adviser config now resolves once through the canonical
  runtime-provider abstraction; failed feature results are discriminated from
  successful continuation results; and goal-correlated response contexts use
  noun-phrase-neutral item verdicts with regression coverage for bare nouns,
  plurals, and phrases containing determiners. A final wording regression found
  during closure review was fixed and covered before approval.

Acceptance criteria:

- Personal non-commercial Open-Meteo composition starts without a weather key
  or credential variable, and the opt-in live Open-Meteo smoke completed
  successfully against the configured free endpoints.
- Home-relative questions use only the narrow explicit-home read port, report
  period and freshness, and preserve exact provider facts internally.
- Watches survive restart, evaluate from injected runtime dependencies, and
  notify at most once for a qualifying forecast window.
- Stale, unavailable, malformed, semantically inconsistent, or timezone-
  ambiguous forecasts fail through diagnostic-aware safe outcomes.
- Required attribution and the convenience-not-emergency limitation are
  present in human-facing behavior.
- Arbitrary clothing items and open outfit requests are provider-backed without
  category enumeration; the explicit opt-in OpenAI weather smoke covers both
  paths and the contextual three-turn regression.
- The final full `npm run check` passed with 1,458 tests passing and 36 opt-in
  tests skipped. Live OpenAI and Open-Meteo weather smokes remain explicit
  opt-in checks and were not used as completion evidence for the generalized
  dialogue slice.

## Milestone 14: Internet Search with Source-Grounded Answers

Status: implemented.

Goal: answer questions about current public information through bounded,
read-only internet search with verifiable sources.

Included:

- A provider-neutral search port with deterministic and opt-in OpenAI Responses
  `web_search` adapters selected through the normal per-feature registry.
- One bounded synthesized answer separated from its validated URL-citation set
  and source metadata. Every annotation is validated; excess valid sources are
  projected by first citation into the configured limit with rebuilt offsets,
  and claims supported only by excluded citations are discarded.
- Human responses use natural source titles without raw URLs, Markdown links,
  citation brackets, or duplicated source lists. Exact HTTPS URLs remain
  structured metadata for result follow-ups and hidden clickable title targets.
  One feature-owned policy sanitizes answers, titles, and extracts before speech
  or result-reference retention, and terminal links render once with
  deterministic non-overlap precedence.
- Process-local, snapshot-only source follow-ups capped by the shared ten-item,
  three-subsequent-turn result-reference session.
- Terminal-only execution: retrieved content never becomes a tool observation,
  and later intent interpretation sees only opaque source ordinals and
  references.
- Explicit limits for query, answer, title, URL, extract, source count, total
  projection, and provider response-body bytes.
- Timeout and caller-cancellation coverage across request and streamed body
  consumption, including reader cancellation during service shutdown.
- Deterministic feature, parser, adapter, core-session, text, voice, and service
  tests plus an explicit opt-in live OpenAI smoke outside the default gate.

Excluded:

- Arbitrary crawling, authenticated browsing, forms, downloads, purchases,
  paywall bypass, or interpreting retrieved content as instructions.
- Provider-directed follow-on capabilities, tool-chain use of search results,
  durable browsing history, or fabricated provider result targets.
- Treating synthesized answers, extracts, titles, dates, ranking, or source
  claims as trusted application data.

Outcomes:

- Current-information requests return one concise answer with natural source
  titles and bounded validated HTTPS citation metadata. Duplicate citations
  reuse the same source reference; excess valid sources and their unsupported
  claims are projected out, while unmatched, malformed, overlapping, or unsafe
  citation sets fail safely.
- A no-result search clears older source references immediately. Follow-ups use
  only the latest immutable displayed source facts and never perform a hidden
  provider lookup.
- Retrieved prompt-like text, URLs, publication times, titles, extracts, and
  answer content are withheld from subsequent intent-provider input. Search
  capabilities are not eligible as intermediate bounded workflow reads, and
  both initial answers and source follow-ups bypass response rewriting.
- The OpenAI transport cancels both fetch and response-body reading for runtime
  shutdown, distinguishes cancellation from timeout diagnostics, and stops
  reading as soon as the configured byte limit is exceeded.
- The fresh thermonuclear maintainability review produced six actionable
  findings, all addressed: answer/source attribution was separated; search was
  made terminal-only; external and aggregate content bounds were added; empty
  results clear stale references; request/body cancellation was wired through;
  and result retention now uses typed descriptors with snapshot-only internet
  references instead of fabricated provider IDs.

Acceptance criteria:

- Every retained citation resolves to the current bounded source set; fabricated,
  mismatched, unsafe, or out-of-range citations fail through the diagnostic-safe
  assistant outcome.
- Retrieved content cannot request another capability, influence confirmation
  policy, or enter later intent sessions as source facts.
- Follow-ups resolve only against the current assistant instance's unexpired
  snapshots and expose neither provider IDs nor internal diagnostics.
- Provider timeout, cancellation, malformed output, HTTP failure, and excessive
  body size preserve internal diagnostics while human boundaries remain safe.
- The checked-in gate performs no live search. The final full `npm run check`
  passed with 829 tests passing and 13 opt-in tests skipped.

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
- Open rephrase prompts that retain no provider workflow, plus explicit
  changed-topic replacement that starts one fresh workflow from the exact
  trusted reply while confirmation remains strict.
- Core-owned clarification transitions with typed safe context containing the
  original request, prompt, origin, and selected capability. Semantic
  clarifications that interrupt a tool call restart provider transport, while
  capability-mismatched terminal continuations become fresh replacement
  workflows even when the provider omits the marker.
- OpenAI Responses continuation through `previous_response_id`, strict read
  tools, and disabled parallel calls, with provider-managed response-state
  privacy documented for operators. Every intent response requires a non-empty
  response ID before its interpretation is accepted.
- Provider intent output receives a final semantic guard: required string
  parameters that only echo the normalized request and narrow action questions
  misclassified as capability-list commands become one canonical clarification
  instead of executing a guessed command.
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
- Clarification continuation semantics are turn-aware: scope checks and final
  execution use the latest trusted reply, original-request restatement guards
  remain intact, and a second unresolved clarification ends with a safe open
  rephrase instead of tool-chain jargon.
- Feature clarification is a discriminated execution result carrying the
  requested parameter. Confirmed commands retain their originating workflow
  session, deterministic routing can bind concise clarification replies, and
  compound plans or intermediate reads fail closed on follow-up requests.
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
- The fresh clarification-flexibility thermonuclear review was fully
  remediated: adapter/core continuation state was consolidated under the core
  workflow, application and feature clarification prompts gained safe typed
  continuation context, semantic tool-call clarification gained deterministic
  restart coverage, and live OpenAI smokes now assert exact fresh-versus-resumed
  request topology.

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
- The process-local bounded conversation window records every completed safe
  exchange and provides one frozen untrusted-context snapshot to intent and
  conversation providers across wake-word turns.
- Deterministic configured-runtime coverage and focused opt-in live OpenAI
  smokes prove open rephrasing and changed-topic clarification replacement,
  including the exact absence or presence of `previous_response_id` at each
  transition.

## Milestone 11: Calendar Result Follow-Ups

Status: implemented.

Goal: answer read-only follow-ups about calendar events displayed earlier in the
same assistant session.

Included:

- One process-local latest result set capped at ten opaque event references.
- Replacement on each new calendar result and expiry after three subsequent
  completed assistant turns or a later conversation compaction; references
  first displayed by the compacting turn survive.
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
- Protected feature facts and process-local follow-ups after a later wake word;
  ordinary calendar results do not keep the microphone open.
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
  generation-aware clearing during conversation compaction.
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
- Provider structured output represents command, plan, conversation,
  clarification, rephrase, replacement, unknown, and unsupported terminal
  interpretations as one nested tagged union, preventing inactive branches from
  being populated together.
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
  one nested tagged-union JSON interpretation, validates only the active
  command, plan, clarification, conversation, or fallback shape, and preserves
  provider failures as diagnostics.
- Intent, conversation, and rewriting use one labeled Responses transport
  client while retaining operation-specific error classes and diagnostics.
- Tests mock HTTP and environment dependencies; the checked-in default config
  remains deterministic.
- `npm run test:e2e:openai` provides opt-in live Responses API routing coverage
  for currently enabled feature capabilities using `OPENAI_API_KEY` from `.env`
  and `gpt-5.6-luna`; it is excluded from normal deterministic validation.

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
- Ordinary capability questions use concise feature-level spoken summaries;
  explicitly complete or detailed questions expand capability-level metadata.

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
- Feature adapter entries capture their narrow provider, local-state,
  notification, personal-context, and test dependencies when the registry is
  built. Factories receive the selected typed adapter config plus only the
  universal live clock, and startup preflight reuses the same immutable
  feature-local captures.
- Injected parsed configs perform one explicit registry rebind when callers
  supply feature runtime overrides such as a config directory, provider
  transport, environment, or notification output. Service notification
  delivery keeps the config-first factory contract and is connected through a
  one-time internal forwarding port before feature construction.
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
- Generic upcoming requests use a 14-day default unless intent supplies an
  explicit or context-derived range. Event titles are emoji-free, and a
  separately configured narrow provider groups only clearly connected same-day
  entries into two to four important chronological milestones. Unrelated
  entries remain separate; grouping failure preserves the complete ungrouped
  answer, all original result references, and an internal diagnostic.
- Google timed starts preserve their event-local wall-clock time behind the
  calendar port; spoken responses protect and render that time naturally, while
  date-only events are explicitly identified as all day.
- A fresh thermonuclear review of the calendar presentation update was completed
  and all five findings were remediated: Unicode subdivision-tag emoji are
  removed, bounded periods require both applicable intent bounds, grouping uses
  one typed adapter-validated index contract over duplicate-date candidates,
  generic test config writers no longer mutate their inputs, and configured
  Google-to-OpenAI grouping plus diagnostic fallback has cross-layer coverage.
- The final full `npm run check` passed with 1,528 tests passing and 38 opt-in
  tests skipped; no live provider calls were used as completion evidence.

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
measurements were explicitly deferred because hardware was unavailable. The
result prevented registration of an unfit production adapter; the proposed
follow-on milestones were later retired with the rest of the unimplemented
provider-focused roadmap after Milestone 12.1 and replaced by capability-focused
work. Raw measurements and the reproducible report live under
`benchmarks/voice/results/`.
