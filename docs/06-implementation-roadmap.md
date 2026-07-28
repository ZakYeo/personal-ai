# Implementation Roadmap

## Delivery Process

Work should be delivered in thin, committable TDD slices. Each slice starts with a focused failing test or test update, implements the smallest code and documentation change needed to pass, and is committed as one singular commit before the next slice begins.

## Current Position

The architecture, deterministic core, safety pipeline, harness layers, tooling,
mock voice loop, desktop voice runtime, real provider adapter foundations,
Google Calendar adapter, neutral service runtime, Raspberry Pi service command,
opt-in Raspberry Pi OS QEMU smoke support, and general conversation support
with in-memory chat history are implemented.

The file-backed alarm store establishes local state that survives restarts, and
config-directory-relative paths now flow consistently through text, voice, and
service composition. Raspberry Pi operations now include a tested systemd unit,
stable deployment paths, a dedicated service account, and operator guidance.
Milestone 8 is implemented after its required independent maintainability
review. It adds neutral runtime-owned scheduling, durable delivery claims,
restart recovery, configured voice delivery, and lifecycle controls. Milestone
8.1 is implemented after its required independent maintainability review. It
adds snooze, daily and weekly recurrence, rescheduling, label editing,
human-facing status, and 30-day retention. Spike 9 is complete after its
required independent review. Milestone 10 is implemented after its required
independent maintainability review. It adds
bounded compound plans with whole-plan validation, aggregate exact
confirmation, ordered stop-on-first-failure execution, and deterministic plus
opt-in live smoke coverage.
Milestone 11 is implemented after its required independent maintainability
review. It adds bounded assistant-session calendar references, deterministic
expiry and ambiguity handling, read-only stable event lookup, safe provider
grounding, and text, voice, adapter, and live smoke coverage.
Milestone 12.1 is implemented after its required independent maintainability
review. It adds bounded, provider-neutral read-tool chaining before a fully
validated terminal command or compound plan, initially proving
calendar-result-driven alarm creation.

## Implemented Milestone Archive

Detailed acceptance criteria and outcomes for Milestones 1 through 12.1 are kept
in `docs/09-implemented-milestones.md`. The earlier provider-focused roadmap
after Milestone 12.1 was retired and replaced by capability-focused Milestones
13 through 17, selected from current user needs.

## Spike 9: Future Milestone Discovery

Status: implemented.

Goal: identify, evaluate, prioritize, and create the concrete implementation
milestones that should follow the operational alarm work.

Questions to investigate:

- Which user outcome should come next: real messaging, another intent provider,
  local STT or TTS, calendar follow-ups, or a newly identified capability?
- Which existing ports are sufficient, and which candidate requires a new or
  revised application boundary?
- What safety, confirmation, privacy, credential, offline, latency, cost, and
  device constraints materially affect each option?
- What deterministic adapter contracts, integration tests, live smokes, and
  operator setup would each candidate require?
- Which dependencies or architectural risks should determine implementation
  order?

Deliverables:

- A short evidence-backed comparison of the candidate capabilities and providers.
- A prioritized recommendation with explicit reasons, dependencies, risks, and
  rejected or deferred options.
- New, separately numbered implementation milestones in this roadmap, each with
  a bounded goal, included and excluded scope, thin-slice outline, and measurable
  acceptance criteria.
- Corresponding README, AGENTS, architecture, runtime, feature-model, and product
  documentation updates where the selected future direction changes those
  sources of truth.

Excluded:

- Implementing a production provider, adapter, or end-user capability as part of
  the spike itself.
- Committing credentials, machine-specific configuration, or speculative shared
  abstractions before a selected milestone proves they are needed.

Acceptance criteria:

- The spike ends by replacing broad candidate ideas with an ordered set of
  concrete future implementation milestones.
- Each resulting milestone can be delivered independently through thin TDD
  slices and names its ports, adapters, runtime boundaries, safety policy, and
  validation strategy.
- Unknowns that still require prototyping are isolated as explicitly bounded
  follow-up spikes rather than hidden inside implementation milestones.
- Documentation passes the repository documentation validation gate.

Outcome:

- The evidence-backed comparison and decision record is in
  `docs/08-spike-9-report.md`.
- The independent maintainability review findings are addressed through explicit
  proposed/validated plan stages, deterministic confirmation facts, partial-step
  outcomes, bounded calendar references, durable messaging send lifecycle,
  complete thin slices, stronger evidence, and the implemented-milestone archive.
- Compound command plans are the next implementation milestone because they
  increase the usefulness of every enabled feature without adding an external
  service dependency.
- Calendar follow-ups follow compound plans and stay read-only.
- Anthropic strict tool use is a credible alternate cloud-intent path, but it is
  deferred because another credential, billed network adapter, and off-device
  data path add no immediate user outcome.
- The unimplemented provider-focused roadmap that originally followed
  Milestone 12.1 was retired on 2026-07-28 and replaced by the active
  capability-focused product plan.

## Milestone 10: Compound Command Plans

Status: implemented. Detailed scope, acceptance criteria, and outcomes are
archived in `docs/09-implemented-milestones.md`.

## Milestone 11: Calendar Result Follow-Ups

Status: implemented. Detailed scope, acceptance criteria, and outcomes are
archived in `docs/09-implemented-milestones.md`.

## Spike 12: Local Voice Device Benchmark

Status: implemented with an explicit desktop no-go. Detailed results are in
`benchmarks/voice/results/desktop-wsl2-report.md` and the completed scope is
archived in `docs/09-implemented-milestones.md`.

Goal: choose local STT and TTS implementations using reproducible measurements
on the supported desktop and Raspberry Pi target.

Included:

- `whisper.cpp` and `sherpa-onnx` STT trials using the same committed audio
  corpus and command scoring.
- Piper and one `sherpa-onnx` TTS trial using the same spoken response corpus.
- Desktop measurements for personal-command accuracy, conservative offline
  completion or batch-ready latency, real-time factor, memory, and CPU. The
  report marks install size, shutdown, thermal state, independent network
  isolation, reference-corpus accuracy, true streaming latency, and Pi evidence
  unavailable where the run could not establish them.
- License, model-source, checksum, packaging, and Pi compatibility review.
- A recorded selection or an explicit no-go threshold.
- A capability-tagged personal corpus with immutable phrase IDs. Guided capture
  defaults to the core tier while an explicit `--all` includes extended phrases,
  so future capabilities add focused recordings without invalidating the
  existing corpus. WSLg
  capture selects its explicit PulseAudio source and sink when `PULSE_SERVER`
  is present; native Linux and Pi capture use configured SoX defaults. Capture
  allows 15-second utterances and retains its two-second stop-detection silence
  for corpus validation. Consent is collected before recording, each accepted
  take is saved immediately, and prompt-level quit or `Ctrl-C` resumes
  from the persisted index on the next run.
- A process-isolated runner with one excluded warm-up and three measured
  repetitions for every candidate and sample. The canonical candidate process
  boundary validates engine-specific telemetry; TTS fixture text is supplied
  through stdin rather than process arguments. Aggregation rejects mixed-device,
  incomplete, duplicate, or wrong-repetition chunks before atomically writing
  results, and the report is generated from that validated result.
- A committed artifact allowlist with exact provenance, revisions, licenses,
  architecture applicability, byte counts, and SHA-256 digests. Repository
  tooling only verifies separately reviewed operator-supplied files offline and
  fails closed; it never downloads, installs, extracts, imports, or executes
  third-party artifacts during verification. The allowlist enforces approved
  official hosts and a minimum 30-day cooling-off period before use. Immutable
  official PyPI wheel URLs are permitted only for exact runtime dependencies;
  installation disables indexes and dependency resolution, and every transitive
  wheel is allowlisted explicitly.

Excluded:

- Production adapter registration.
- Committed model weights or a new checked-in default provider.

Acceptance criteria:

- The benchmark commands, corpus, device information, raw results, and scoring
  method are reproducible.
- Selected candidates meet documented desktop and Pi thresholds, or the report
  records why local voice is deferred.
- The report records whether later production work can begin or must be
  deferred.

## Milestone 12.1: Bounded Tool-Chain Workflows

Status: implemented. Detailed scope, acceptance criteria, review outcomes, and
final behavior are archived in `docs/09-implemented-milestones.md`.

Goal: allow an intent provider to execute a small sequence of explicitly
authorized read capabilities before proposing one fully resolved command or
the existing bounded compound plan.

Included:

- A provider-neutral intent session that may request at most two sequential
  read calls before returning a terminal interpretation.
- Explicit capability metadata that opts read-only capabilities into planning;
  risk metadata alone never grants intermediate execution.
- Core-owned validation, sequential execution, safe tool observations, internal
  diagnostics, one optional clarification, and existing aggregate confirmation.
- OpenAI Responses function calling with one call per response, no parallel
  calls, and process-local continuation wiring.
- Calendar-result-driven alarms such as “remind me ten minutes before the
  second event,” using opaque references and an exact event instant.
- Snapshot semantics: confirmation freezes the selected event facts and alarm
  time; later calendar edits or deletion do not alter the local alarm.
- Explicit local-time clarification for all-day events, interpreted in a
  required canonical assistant IANA timezone.

Excluded:

- Arbitrary provider-directed loops, parallel calls, more than two intermediate
  reads, or more than one clarification.
- Intermediate state-changing calls, hidden retries, rollback claims, or a
  general output-path expression language.
- Durable workflow state, calendar-linked alarm synchronization, or storing
  calendar provider identifiers with alarms.
- Remote MCP servers or exposing credentials, raw provider payloads, private
  result-reference targets, or diagnostics to an intent provider.

Thin slices:

1. Add canonical assistant timezone policy and reusable deterministic local-time
   resolution.
2. Preserve exact timed calendar instants through adapters, protected facts,
   and safe opaque references.
3. Add fail-closed read-tool eligibility and provider-neutral intent-session
   contracts.
4. Implement bounded core orchestration, safe observations, diagnostics, and
   serialized clarification state.
5. Implement OpenAI function-call request, parsing, and continuation contracts.
6. Add confirmed timed and all-day calendar reminder creation with snapshot
   semantics.
7. Prove text, voice, service, and opt-in live-provider paths and complete the
   required independent maintainability review. All review findings are
   addressed in tested follow-up commits.

Post-implementation hardening moved bounded orchestration into a dedicated
`IntentWorkflow`, stopped rewriting intermediate reads, preserved completed
read traces across provider continuation failures, and required a non-empty
OpenAI response ID for every intent response.

Acceptance criteria:

- Only capabilities explicitly declared as tool-chain reads can execute before
  terminal plan validation, and no write occurs before confirmation.
- At most two read calls and one clarification occur in one serialized
  assistant workflow; failures stop without provider-directed retry.
- Opaque references and safe displayed facts reach the provider, while private
  provider IDs and internal diagnostics do not.
- A timed calendar result can produce an exact protected alarm confirmation and
  persist the same frozen instant after explicit approval.
- An all-day result asks once for a local time, resumes without another wake
  word, applies deterministic timezone/DST policy, and then confirms normally.
- Existing single commands, compound plans, conversation, follow-ups, and
  runtime failure boundaries remain compatible, and `npm run check` passes.

## Milestone 13: Explicit Personal Profile and Preferences

Status: planned.

Goal: give the assistant durable, user-controlled personal context so enabled
features can produce relevant answers without retaining conversation transcripts
or silently inferring sensitive facts.

Included:

- Typed profile facts for an initial bounded set of preferences such as home
  location, preferred units, working hours, interests, important people,
  dietary preferences, and response style.
- Explicit remember, show, update, and forget capabilities with provenance and
  created/updated timestamps.
- One local versioned profile store with deterministic in-memory and durable
  file adapters, atomic persistence, restrictive permissions, and migration
  validation from `unknown`.
- A narrow read-only personal-context port through which later feature adapters
  request only the fields they need.
- Human-facing explanations of what is stored, why it is known, and how to
  correct or delete it.

Excluded:

- Automatic extraction from normal conversation, inferred sensitive traits,
  conversation transcript retention, embeddings, cloud synchronization, or a
  general long-term-memory system.
- Unbounded custom schemas or injecting the entire profile into every provider
  request.

Thin slices:

1. Define the typed fact categories, provenance, timestamps, validation, and
   feature contract with deterministic fixtures.
2. Add an in-memory store and profile show/remember/update/forget behavior,
   including ambiguity and confirmation policy.
3. Add the versioned file adapter with atomic replacement, restrictive modes,
   config-directory-relative paths, and malformed-state coverage.
4. Add the narrow personal-context reader and prove that consumers receive only
   explicitly requested fields.
5. Compose the profile through text and voice runtimes, add privacy-focused
   integration tests, update operator documentation, and complete the required
   independent maintainability review.

Acceptance criteria:

- “Remember that I work from home on Fridays” persists an explicit typed fact
  and “why do you know that?” reports its user-authored provenance.
- The user can list, correct, forget, or clear stored facts; clearing the whole
  profile requires confirmation and resumes the exact validated deletion.
- Restart preserves validated profile state, while malformed or unsupported
  versions fail safely without exposing raw persisted data.
- No profile fact reaches an unrelated provider or feature dependency, and
  normal conversation does not create memory implicitly.
- `npm run check` passes.

## Milestone 14: Internet Search with Source-Grounded Answers

Status: planned; depends on Milestone 13 only for personalized defaults, not for
basic search.

Goal: answer questions about current public information through bounded,
read-only internet search with verifiable sources.

Included:

- A provider-neutral search port and explicit adapter selection with one
  deterministic adapter and one opt-in real provider.
- Bounded queries and results containing validated titles, source URLs,
  extracts, publication times when available, and opaque result references.
- Concise answers whose citations resolve only to sources returned for the
  current search.
- Read-only follow-ups against the latest bounded result set and opt-in use of
  relevant profile preferences such as home location or interests.
- Timeout, cancellation, rate-limit, malformed-response, and diagnostic-safe
  runtime behavior.
- A strict untrusted-content boundary: search text can supply facts but can
  never supply commands, permissions, confirmation decisions, or instructions
  to the assistant.

Excluded:

- Arbitrary web crawling, authenticated browsing, form submission, file
  downloads, purchases, bypassing paywalls, or executing page content.
- Treating provider-generated summaries, ranking, publication dates, or source
  claims as trusted application instructions.

Thin slices:

1. Define validated search result, citation, and provider contracts plus
   deterministic search scenarios.
2. Add the search feature, bounded result references, exact citation integrity,
   and concise text/voice rendering.
3. Add the selected real adapter with typed config, credential preflight,
   transport limits, response parsing from `unknown`, and adapter contracts.
4. Add follow-ups, optional narrow profile context, prompt-injection fixtures,
   and source-expiry behavior.
5. Prove CLI, desktop voice, and Pi service composition with an opt-in live
   smoke, operator documentation, and the required independent maintainability
   review.

Acceptance criteria:

- A current-information question produces a bounded answer with citations that
  identify the exact returned sources; fabricated or mismatched citations fail
  safely.
- Search results and page-like content cannot request another capability or
  change confirmation policy.
- Follow-ups resolve only against the current assistant instance's unexpired
  result set and never expose provider-private identifiers.
- Search timeouts and provider failures return a graceful response with internal
  diagnostics, and default validation makes no network call.
- `npm run check` passes.

## Milestone 15: Weather, Forecasts, and Weather Watches

Status: planned; depends on Milestone 13.

Goal: provide location-aware current weather and forecasts, then proactively
notify the user when explicitly requested forecast conditions are detected.

Included:

- Provider-neutral current, hourly, and daily forecast ports with one
  deterministic adapter and one opt-in real provider.
- Explicit locations plus a home-location default read narrowly from the
  personal profile; questions clarify when no usable location exists.
- Exact observation/forecast timestamps, timezone, units, temperatures,
  precipitation, wind, and provider freshness metadata in protected result data.
- Durable, user-created watches for bounded conditions such as forecast rain,
  temperature, or wind within a specified period.
- A feature-owned neutral background task that evaluates watches through the
  same store and provider instance used by the weather feature and delivers
  notifications through the shared runtime output path.

Excluded:

- Claiming to be an emergency-warning service, inferring precise location,
  continuous device tracking, climate analysis, or autonomous schedule changes.
- Silent creation of watches from ordinary weather questions.

Thin slices:

1. Define typed locations, units, forecast periods, freshness, and deterministic
   weather contracts.
2. Implement current and forecast capabilities with explicit-location
   clarification and narrow profile-default resolution.
3. Add the selected real adapter with config parsing, transport contracts,
   malformed-data rejection, and opt-in live read smoke.
4. Add versioned weather-watch persistence, validation, list/cancel behavior,
   and exact confirmation where a configured policy requires it.
5. Add deterministic background evaluation, deduplicated delivery, restart and
   shutdown coverage, text/voice integration, operator documentation, and the
   required independent maintainability review.

Acceptance criteria:

- “Will I need a coat at home tomorrow morning?” uses only an explicitly stored
  home location, reports the forecast period and freshness, and preserves exact
  provider facts internally.
- An explicit weather watch survives restart, evaluates on an injected clock,
  and notifies at most once for the same qualifying forecast window.
- Stale, unavailable, malformed, or ambiguous forecasts are identified rather
  than presented as current facts.
- The assistant states that watches are convenience notifications rather than
  guaranteed emergency alerts.
- `npm run check` passes.

## Milestone 16: Personal Lists, Tasks, and Reminders

Status: planned; depends on Milestone 13 for personalized defaults only.

Goal: add durable everyday organization with lists, completable tasks, and
scheduled reminder delivery that remains distinct from alarm lifecycle state.

Included:

- Named lists such as shopping and to-do, with add, show, rename, complete,
  reopen, edit, and remove operations.
- Tasks with labels, optional notes, due dates, completion state, and one
  optional reminder instant.
- Versioned local persistence parsed from `unknown`, deterministic migration,
  revision-checked updates, atomic file replacement, and restrictive modes.
- Bounded opaque references for follow-ups such as “complete the second one.”
- A runtime-owned reminder task using the exact composed task store, injected
  clock/timer/shutdown dependencies, durable delivery claims, restart recovery,
  and shared voice output coordination.

Excluded:

- Shared or collaborative lists, attachments, project-management workflows,
  automatic prioritization, recurring tasks, location-triggered reminders, or
  external task-provider synchronization.
- Treating reminder delivery as task completion or reusing alarm records as task
  state.

Thin slices:

1. Define canonical list/task/reminder state, revision rules, capabilities, and
   layered test-support fixtures.
2. Implement in-memory list and task operations with decoded arguments,
   confirmation policy, ambiguity handling, and result references.
3. Add the versioned file store with migration, cloning, serialization, atomic
   durability, and relative-path composition coverage.
4. Add reminder claiming, delivery, recovery, acknowledgement, and cleanup
   through a neutral background task.
5. Prove compound plans, text/voice/service behavior, safe partial failures,
   documentation, and the required independent maintainability review.

Acceptance criteria:

- Lists and tasks survive restart and revision-checked operations cannot
  silently overwrite newer state.
- “Remind me tomorrow at 9 to submit the form” creates one task and one exact
  reminder instant; delivery does not silently mark the task complete.
- Follow-ups resolve only eligible items, and destructive bulk clearing requires
  confirmation with the exact affected list.
- Reminder persistence completes before success, delivery is deduplicated across
  restart windows, and failures preserve diagnostics without losing the task.
- `npm run check` passes.

## Milestone 17: Daily Briefings and Scheduled Delivery

Status: planned; depends on Milestones 13 through 16.

Goal: combine the user's personal context and enabled read capabilities into a
concise on-demand or scheduled daily briefing.

Included:

- An on-demand “what does my day look like?” capability covering configured
  sections from profile preferences, calendar, weather, alarms, and tasks.
- Optional bounded internet-search topics selected explicitly by the user, such
  as a small news or interest section.
- An application-owned briefing aggregator that calls fixed narrow read ports;
  it does not invoke feature plugins, ask an intent provider to choose tools, or
  widen the two-read provider workflow.
- Configurable morning schedule, timezone, sections, spoken length, and
  quiet-hours behavior.
- Durable per-schedule delivery slots, restart-safe deduplication, isolated
  source failures, and delivery through the shared output coordinator.

Excluded:

- Autonomous actions based on briefing content, provider-selected arbitrary
  sources, open-ended agent planning, advertising, continuous surveillance, or
  guaranteed emergency notification.
- Treating a failed optional section as failure of every other briefing section.

Thin slices:

1. Define typed briefing sections, safe source projections, ordering, length,
   and deterministic aggregation contracts.
2. Implement on-demand briefings from fixed mock/profile/calendar/weather/task
   sources with exact protected facts and partial-failure metadata.
3. Add user-owned schedule and section preferences with quiet-hours and
   timezone validation.
4. Add durable scheduled-delivery slots, restart deduplication, shutdown, and
   shared voice-output coverage.
5. Add optional bounded search topics, text/voice/Pi integration, operator
   documentation, and the required independent maintainability review.

Acceptance criteria:

- An on-demand briefing concisely combines only enabled, user-selected sections
  and identifies unavailable sections without exposing diagnostics.
- Scheduled delivery occurs at most once per local briefing slot across restart
  and respects the configured timezone and quiet hours.
- Briefing aggregation is fixed and application-owned; source content cannot
  add tools, actions, or new sections.
- Exact calendar, weather, alarm, and task facts remain protected through final
  response rewriting.
- `npm run check` passes.

## Future Considerations

These ideas are intentionally unnumbered and are not committed milestones.
Promoting one into the active roadmap requires fresh product scope, dependency
and provider evidence, safety policy, thin slices, and measurable acceptance
criteria.

- **Home Assistant smart-home control:** read allowlisted device state first,
  then add confirmed controls with device-class-specific risk policy. Locks,
  doors, security systems, and safety-critical climate controls must fail
  closed.
- **Personal knowledge library:** explicitly import selected local documents,
  notes, manuals, and bookmarks for source-cited retrieval without automatically
  crawling the filesystem or exposing raw private content to unrelated
  providers.
- **Opt-in adaptive memory:** suggest preferences from repeated interactions but
  retain nothing inferred until the user approves it. Any future design must
  distinguish temporary context from durable facts and support provenance,
  explanation, correction, export, expiry, and deletion.

## Roadmap Rule

Do not introduce external API dependencies before the deterministic core, mock adapters, feature model, and dependency boundary checks exist.

Keep this roadmap aligned with the codebase as milestones are completed, split, deferred, or changed. Updates to implementation status, tooling, workflow, or milestone scope should be reflected in `README.md`, `AGENTS.md`, and the relevant `docs/` files in the same thin TDD slice.
