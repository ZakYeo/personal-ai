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
Milestone 13 is implemented after its required independent maintainability
review. It adds durable explicit personal profiles, narrow personalization,
and generic ask-save-resume resolution for missing personal details.
Milestone 14 is implemented after its required independent maintainability
review. It adds bounded source-grounded internet search, deterministic and
opt-in OpenAI web-search adapters, bounded citation projection, clickable
source-title metadata, URL-free speech, process-local snapshot follow-ups,
terminal-only trust isolation, request cancellation, and shared text, voice,
and service composition.

## Implemented Milestone Archive

Detailed acceptance criteria and outcomes for Milestones 1 through 18
are kept in `docs/09-implemented-milestones.md`. The earlier provider-focused
roadmap after Milestone 12.1 was retired. Capability-focused Milestones 13
through 18 are implemented. The September 7, 2026 evaluation adds planned
Milestone 18.1 and refines Milestones 19 through 25 below; these additions do not
claim new implementation or reopen the historical completion records.

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
OpenAI response ID for every intent response. Later clarification hardening
distinguished open rephrase prompts from resumable questions, allowed a
changed-topic reply to start one fresh workflow, made semantic validation
turn-aware, and replaced clarification-limit jargon with a safe rephrase. The
core now owns transition legality, passes typed safe clarification context,
restarts transport when semantic validation interrupts a pending tool call, and
uses the selected stable capability to detect changed workflows even when a
provider omits the replacement marker.

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
- Open rephrases retain no pending workflow, changed-topic replies replace a
  clarification through a fresh bounded workflow, provider-session request
  topology is asserted by live smoke coverage, and confirmations retain their
  strict existing behavior.

## Milestone 13: Explicit Personal Profile and Preferences

Status: implemented after the required independent maintainability review.
Detailed review outcomes and completion evidence are archived in
`docs/09-implemented-milestones.md`.

Goal: give the assistant durable, user-controlled personal context so enabled
features can produce relevant answers without retaining conversation transcripts
or silently inferring sensitive facts.

Included:

- Typed profile facts for exactly preferred name, birth date, pronouns, home
  timezone, home location, interests, and response style. Age is derived from
  birth date at read time.
- Explicit set, show, update, and forget capabilities with provenance and
  created/updated timestamps, available through ordinary text and voice
  commands.
- Intent-provider interpretation of phrases such as “set my name to Zak” into a
  proposed structured profile command. Core validation and the application-owned
  profile feature—not model memory—remain the only path that can persist it.
- One local versioned profile store with deterministic in-memory and durable
  file adapters, atomic persistence, restrictive permissions, and migration
  validation from `unknown`.
- A narrow read-only personal-context port through which later feature adapters
  request only the fields they need.
- A frozen per-turn assistant personalization projection containing only
  preferred name and response style for intent, conversation, compaction, and
  final response-rewriter system contexts.
- Human-facing explanations of what is stored, why it is known, and how to
  correct or delete it, including a concise spoken answer to “what do you know
  about me?”

Excluded:

- Automatic extraction from normal conversation, inferred sensitive traits,
  conversation transcript retention, embeddings, cloud synchronization, or a
  general long-term-memory system.
- Unbounded custom schemas or injecting the entire profile into every provider
  request.
- Hardcoded user details, setup-time profile requirements, or allowing a
  provider to persist facts without a decoded and validated profile command.

Thin slices:

1. Define the typed fact categories, including preferred name, provenance,
   timestamps, validation, and feature contract with deterministic fixtures.
2. Add an in-memory store and profile show/set/update/forget behavior, including
   ambiguity, confirmation policy, and concise whole-profile rendering.
3. Add the versioned file adapter with atomic replacement, restrictive modes,
   config-directory-relative paths, and malformed-state coverage.
4. Add the narrow personal-context reader and prove that consumers receive only
   explicitly requested fields.
5. Compose the profile through text and voice runtimes, add privacy-focused
   integration tests, update operator documentation, and complete the required
   independent maintainability review.

Acceptance criteria:

- “Hey Jarvis, set my name to Zak” is interpreted as a structured profile
  command, persists `Zak` only after application validation, and “what's my
  name?” returns the stored value.
- “Hey Jarvis, what do you know about me?” reads a concise human-facing summary
  from the current durable profile through both text and voice runtimes.
- “Why do you know my name?” reports its user-authored provenance without
  retaining the original utterance.
- Any selected capability may request one needed profile field through the same
  narrow read workflow. When absent, the assistant discloses the save, validates
  the explicit clarification reply as `profile.set`, and resumes the original
  capability; weather-at-home and internet-search-about-me tests exercise the
  same target-neutral mechanism.
- The user can list, correct, forget, or clear stored facts; clearing the whole
  profile requires confirmation and resumes the exact validated deletion.
- Restart preserves validated profile state, while malformed or unsupported
  versions fail safely without exposing raw persisted data.
- No profile fact other than preferred name and response style reaches global
  provider context; weather receives only home location through its narrow
  reader, and normal conversation does not create memory implicitly.
- `npm run check` passes.

## Milestone 14: Internet Search with Source-Grounded Answers

Status: implemented after the required independent maintainability review.
Detailed scope, review outcomes, and acceptance evidence are archived in
`docs/09-implemented-milestones.md`. Milestone 13 is an optional dependency
for personalized defaults, not for basic search.

Goal: answer questions about current public information through bounded,
read-only internet search with verifiable sources.

Included:

- A provider-neutral search port and explicit adapter selection with one
  deterministic adapter and one opt-in real provider.
- Bounded queries and results containing validated titles, source URLs,
  extracts, publication times when available, and opaque result references.
- Concise answers whose citations resolve only to sources returned for the
  current search, with natural source titles in speech and validated URLs kept
  as separate link metadata.
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

Status: implemented after the required independent maintainability review.
Detailed scope, acceptance criteria, review outcomes, and validation evidence
are archived in `docs/09-implemented-milestones.md`. Milestone 13 is an
optional runtime dependency for explicit stored-home defaults.

Goal: provide location-aware current weather and forecasts, then proactively
notify the user when explicitly requested forecast conditions are detected.

Included:

- Provider-neutral current, hourly, and daily forecast ports with one
  deterministic adapter and an opt-in Open-Meteo adapter using its free
  non-commercial API without an API key.
- Open-Meteo geocoding for explicit place names, validated forecast parsing,
  and required Open-Meteo/data-source attribution under the free API terms.
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
- Commercial Open-Meteo use, the paid customer endpoint, or adding a weather
  credential until a later explicit product decision changes the selected
  service terms.

Thin slices:

1. Define typed locations, units, forecast periods, freshness, and deterministic
   weather contracts.
2. Implement current and forecast capabilities with explicit, recent-result,
   and narrow profile-default location resolution.
3. Add the Open-Meteo forecast and geocoding adapter with endpoint/timeout
   config, no credential config, transport contracts, attribution,
   malformed-data rejection, and an opt-in live read smoke.
4. Add versioned weather-watch persistence, validation, list/cancel behavior,
   and exact confirmation where a configured policy requires it.
5. Add deterministic background evaluation, deduplicated delivery, restart and
   shutdown coverage, text/voice integration, operator documentation, and the
   required independent maintainability review.
6. Generalize clothing advice around a validated current instant, future
   instant, or inclusive period; arbitrary named-item and open-outfit goals; a
   separately selected narrow adviser provider; and retained weather-location
   context. Keep `weather.coat` as a compatibility route rather than a
   phrase-specific contract.

Acceptance criteria:

- Personal non-commercial Open-Meteo composition starts and serves forecasts
  without any weather API key or weather credential environment variable.
- A weather follow-up such as “Could I wear a coat if I left now?” reuses the
  immediately retained weather location without reopening the microphone or
  rereading home, while an explicit new place or explicit home overrides it.
- Clothing advice accepts current conditions, arbitrary validated future
  instants such as “in ten minutes”, and bounded inclusive periods without
  enumerating those phrases in the capability contract. It preserves the
  requested/query periods, selected measurements, location, units, timezone,
  freshness, and attribution in structured result data.
- Open outfit requests omit the optional item and return one bounded outfit;
  arbitrary item names require no category classification. Adviser output is
  structurally validated, final weather wording stays application owned, and
  adviser failure is diagnostic-aware and safe for the user.
- An explicit weather watch survives restart, evaluates on an injected clock,
  and notifies at most once for the same qualifying forecast window.
- Stale, unavailable, malformed, or ambiguous forecasts are identified rather
  than presented as current facts.
- The assistant states that watches are convenience notifications rather than
  guaranteed emergency alerts.
- Human-facing weather output includes the attribution required by the
  [Open-Meteo free API terms](https://open-meteo.com/en/terms), and tests pin the
  selected non-commercial endpoint and usage policy.
- Weather speech uses contextual local observation, forecast, freshness, and
  watch-window times. It speaks the provider title while retaining the exact URL
  only as validated citation metadata for hidden hyperlinks.
- `npm run check` passes.

## Milestone 16: Personal Lists, Tasks, and Reminders

Status: implemented after the required independent maintainability review.
Detailed outcomes, acceptance evidence, and review remediation are archived in
`docs/09-implemented-milestones.md`. Milestone 13 is required only for later
personalized defaults.

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

## Product North Star

Jarvis starts quietly with the computer and remains available without occupying
the user's attention. At the configured time it offers a concise briefing. If
weather, calendar, task, or runtime state needs attention, it gives one timely,
explainable notification instead of a stream of noise. When the user says “Hey
Jarvis” from any application, a small desktop overlay appears immediately,
shows the live transcript and current assistant state, presents exact
confirmation when an action needs approval, speaks the result, and disappears.

The target experience is an ambient personal copilot rather than a collection
of disconnected commands. It should feel present through fast feedback,
contextually useful through explicit bounded access, proactive through
user-owned rules, and trustworthy because every durable memory, external
action, source, and sensitive observation remains visible and controllable.

The active post-Milestone-17 plan is Milestones 18 through 25. Each milestone
must still pass its own evidence review, TDD slices, full validation gate, and
fresh thermonuclear maintainability review before implementation is complete.

## Delivery Priorities and Daily-Use Evidence

The September 7, 2026 evaluation prioritizes reliability, responsiveness,
continuity, and useful initiative over expanding the integration catalog.
Keep existing milestone numbers stable, with this delivery order:

1. Milestone 18.1 addresses observed reliability and presentation gaps.
2. Milestone 19 delivers measurable interruption and bounded conversational
   corrections; Milestone 20 adds a morning routine and durable attention inbox.
3. Deliver a narrow, separately reviewed Milestone 24 pilot for explicitly
   enrolled project notes and meeting preparation before broad computer control
   or real communications. The pilot does not complete the full library.
4. Continue Milestones 21 through 25 with the remaining library scope. If an
   existing user-owned Home Assistant installation is available, a small
   Milestone 22 lights/scenes pilot may precede broad desktop control after
   Milestones 19 and 20 and its own action-policy proof. Do not assume a new
   service purchase or enrollment.

Run a 30-day daily-use trial around ten user-selected recurring jobs, including
morning planning, interruption, correction, and reminder recovery. Before the
trial, record the jobs, host/audio setup, success criteria, and measurement
method. Track completion without repair, corrections per job, phase latency,
unwanted interruptions, and explicitly rated notification usefulness. Keep
content-free local counters by default; recordings and transcripts require
separate consent and bounded retention. Review failures weekly and turn repeated
friction into tested slices. Missing device evidence remains explicitly missing;
passing deterministic tests alone does not prove daily-use acceptance.

The next product release targets completed Milestones 18.1, 19, and 20 plus a
reviewed trial report. Broader integrations should follow the demonstrated jobs
and remaining friction. Every implemented milestone still requires the full
validation gate and a fresh independent thermonuclear review; roadmap editing
does not constitute implementation or satisfy those reviews.

## Milestone 18: Desktop Presence and Command Center

Status: implemented after midpoint and final independent thermonuclear
maintainability reviews; every actionable finding was remediated and the full
validation gate passed.

Goal: give the existing always-listening service a native desktop presence that
appears immediately on wake and makes listening, reasoning, confirmation,
acting, speaking, privacy, and failure states visible.

Included:

- A provider-neutral, runtime-owned `AssistantRuntimeEvent` contract for wake,
  transcript, processing, confirmation, response, speaking, completion, and
  safe-failure state.
- A bounded authenticated local IPC transport and restorable snapshot so a
  presentation process can observe the service without parsing progress logs.
- A compact wake overlay with live transcript, safe progress, confirmation,
  microphone state, result details, and automatic dismissal. Voice interruption
  remains explicitly deferred to Milestone 19.
- An expanded command center for today, tasks, alarms, recent safe interactions,
  sources, profile controls, integration health, and activity history through
  narrow presentation projections.
- A native desktop shell with system tray, autostart, global keyboard shortcut,
  single-instance behavior, and an always-on-top overlay; Windows is the first
  supported host while the current voice service may remain behind local IPC.
  Tauri is the preferred initial candidate because its official desktop APIs
  cover [window state](https://v2.tauri.app/reference/javascript/api/namespacewindow/),
  [global shortcuts](https://v2.tauri.app/plugin/global-shortcut/), and
  [autostart](https://v2.tauri.app/plugin/autostart/), but the first slice must
  record the final dependency and packaging decision.

Excluded:

- Moving feature policy into the UI, exposing diagnostics or raw store/provider
  data, a remotely reachable general assistant API, hidden microphone capture,
  or making the graphical interface mandatory for CLI and Pi runtimes.

Thin slices:

1. Record the native-shell dependency decision, then define the frozen sanitized
   runtime-event state machine and deterministic replay/reconnect behavior.
2. Adapt voice progress, confirmations, results, cancellation, and failures into
   events without changing core feature behavior.
3. Add authenticated loopback IPC and a development web presentation.
4. Add the compact native overlay, tray, shortcut, autostart, and privacy states.
5. Add narrow command-center projections, packaging/smoke coverage,
   documentation, and the required independent review.

Acceptance criteria:

- Saying “Hey Jarvis” while another application is active shows listening state
  and a live transcript without requiring the user to open a terminal.
- Confirmation uses the exact already-validated action and UI approval cannot
  bypass the core-owned pending interaction.
- Disconnects, restarts, duplicate clients, and malformed IPC data fail safely;
  the CLI, voice, service, and Pi paths remain usable without the UI.
- The UI receives only bounded human-safe state and validated hidden link
  metadata, never credentials, private targets, or internal diagnostics.
- `npm run check` passes.

## Milestone 18.1: Daily-Use Reliability

Status: implemented after a fresh independent thermonuclear review, tested
remediation, and the full validation gate. See the implemented milestone archive
for outcomes. Physical-device and thirty-day daily-use evidence remain separate.
Follows implemented Milestone 18 and precedes Milestone 19.

Goal: preserve completed work and present honest state before expanding the
ambient experience through bounded reliability and setup behavior.

Included and thin slices, each with a failing regression test first:

1. Preserve completed safe exchanges on compaction failure through an explicitly
   bounded fallback history policy. Test repeated provider failure, invalid
   summaries, recovery, concurrency, and result-reference aging. Retain core
   transaction ownership; any later background compaction needs revision-checked
   installation and must not overwrite newer turns. This deliberately revises
   the former policy of retaining only the previous valid state.
2. Enforce read-only briefing generation: intermediate reads cannot save the
   last-presented baseline. Separate generation from recording presentation or
   delivery through an application-owned contract; terminal-only exposure is an
   acceptable initial containment. Test failed continuations, undisplayed reads,
   successful terminal presentation, and failed speech delivery. Define which
   text/voice delivery boundary advances the baseline without claiming the user
   heard it.
3. Filter Today by the configured local day before rendering, including date
   boundaries, overdue tasks, and future alarms. Give undated and future work
   explicit separate presentation. Replace enabled-implies-ready health with
   bounded configured, connected, degraded, disabled, and unchecked states plus
   last-check metadata; test missing and failed sources without exposing details.
4. Add the main application confidence gate to CI alongside Windows native
   checks, with required host dependencies and loopback access. Document required
   status-check setup and decide whether coverage is a gate or advisory report;
   live provider and hardware tests remain opt-in.
5. Add guided microphone selection, input-level feedback, explicit test capture
   and playback, integration verification, and safe recovery instructions. Show
   selected local/remote data paths and state locations; never reveal credentials
   or initiate capture without an explicit user action.
6. Record the ownership decision before simultaneous desktop/Pi/phone clients:
   existing file stores remain single-process-owned. Future clients must use an
   authenticated service owner for state and pending interactions rather than
   independently opening shared files. Remote transport implementation is outside
   this milestone. Complete documentation and the required independent review.

Acceptance criteria:

- Every completed safe exchange survives a compactor failure within documented
  turn/character bounds, and later recovery preserves serialization.
- An undisplayed intermediate briefing cannot replace the comparison baseline.
- Today and integration health describe actual scope and verified freshness;
  unknown health is never labeled connected merely because config enables it.
- Main application CI checks and Windows native checks pass; onboarding can
  diagnose a disconnected microphone or unavailable integration safely.
- `npm run check` passes, followed by a fresh independent review and remediation.

## Milestone 19: Voice Interruption and Responsiveness

Status: in progress; initial monotonic software event instrumentation is
implemented. Cancellation, interruption, corrections, and independent review
remain. Depends on implemented Milestones 18 and 18.1.

Goal: reduce real and perceived response latency and let the user interrupt the
assistant naturally without corrupting workflow or durable state.

Included:

- Immediate local wake feedback, first-transcript and first-audio measurements,
  and explicit latency budgets for every voice phase.
- Prompt cancellation during capture, provider work, synthesis, and playback,
  with bounded cleanup and accurate safe runtime state.
- “Jarvis, stop” during speech and bounded barge-in for a replacement request,
  coordinated with notification output and one-microphone ownership.
- Streaming-first response presentation where protected facts and confirmation
  policy allow it, while durable feature success still waits for required
  persistence.
- Bounded conversational corrections through one core-owned typed draft with
  explicit missing fields, lifetime, turn limit, and cancellation transitions.
  Support representative corrections such as “the other one” and “keep the time,
  change the label” using validated references. Replacing the current one-resumable-
  clarification limit requires a documented contract change and regression tests;
  do not widen provider-directed read or plan limits implicitly.
- Core-owned confirmation expiry using an injected clock. Stale approval must
  not execute; reconfirm exact facts or explain that the action must be prepared
  again. Refreshing stale context never silently changes the approved action.

Excluded:

- Unbounded full-duplex model sessions, pretending canceled external side
  effects were rolled back, weakening confirmation to save time, or accepting
  benchmark claims without measured host-device evidence.

Thin slices:

1. Establish committed phase metrics, device fixtures, and responsiveness gates.
2. Add one turn-wide cancellation contract and propagate it through every voice
   and provider boundary.
3. Implement speech-stop behavior and serialized output interruption.
4. Add bounded barge-in, replacement semantics, echo/false-wake protection, and
   deterministic concurrency tests.
5. Add bounded draft corrections and confirmation expiry across text, voice,
   and UI, including racing replies, stale references, and changed topics.
6. Remove optional rewriting and compaction from the simple-command critical
   path where measured benefit justifies it; retain safe deterministic responses,
   bounded history, and durable completion guarantees. Update operator guidance
   and complete the required independent review.

Acceptance criteria:

- Wake produces immediate local visual or audible feedback and every measured
  phase reports deterministic timing metadata.
- Initial device targets are under 150 ms from detected wake to local feedback,
  under 300 ms from recognized stop to silence, and under 1.5 seconds at p95 from
  utterance end to first useful audio for simple local commands. These are proposed
  acceptance targets, not current measurements. Report acoustic stop-to-silence
  separately so recognition delay is visible. Record sample counts, host/audio
  setup, background-noise and back-to-back scenarios, and first-transcript timing.
  Long external work receives truthful local progress within a documented bound;
  filler does not count as useful answer audio. Any target revision needs measured
  evidence and an explicit roadmap decision before claiming acceptance.
- Stop and barge-in settle within documented bounds, perform best-effort cleanup,
  and cannot duplicate an action, confirmation, alarm, or notification.
- Failures retain diagnostics internally and return the service to a valid
  listening, pending-interaction, or stopped state.
- Corrections cannot mutate an executing/completed action, expired confirmations
  cannot execute, and replacing a draft preserves one pending interaction.
- `npm run check` passes.

## Milestone 20: Proactive Attention Engine

Status: planned; depends on Milestones 17 through 19.

Goal: surface a small number of timely, explainable signals derived from existing
trusted state without turning the assistant into an autonomous agent.

Included:

- User-enabled deterministic rules for upcoming calendar events, material
  weather during a relevant period, due tasks, conflicting commitments, and
  assistant delivery/runtime problems.
- Typed rule inputs over fixed narrow read ports, durable evaluation slots,
  cooling-off periods, deduplication, priorities, quiet hours, and a configurable
  daily notification budget.
- Explain, snooze, disable, and “do not tell me about this again” controls with
  user-authored provenance for every enabled rule.
- Presentation through the shared notification/output coordinator and desktop
  attention surface.
- A durable attention inbox with bounded retention, provenance, deduplication,
  acknowledge/snooze/dismiss/explain controls, and safe resolution of uncertain
  reminder delivery and integration failures. Distinguish output completion from
  user acknowledgement; never replay an uncertain action automatically.
- One user-enabled morning routine over the existing narrow calendar, task,
  weather, briefing, and profile readers, followed by bounded day-planning help.
  Add explicit named routine declarations only for fixed application-owned
  workflows with declared inputs, actions, permissions, and confirmation facts.
  Models may explain options but cannot invent steps or persistent monitors.

Excluded:

- Model-invented monitors, continuous location or screen surveillance,
  emergency guarantees, hidden rule creation, autonomous corrective actions, or
  allowing source text to create another rule or capability call.

Thin slices:

1. Define rule types, eligibility, explanation, priority, cooling-off, and budget
   policy with deterministic clocks.
2. Implement durable rule preferences and evaluation/deduplication state.
3. Add calendar, weather, task, and runtime-health rule adapters over narrow
   reads with isolated partial failures.
4. Add lifecycle commands, desktop/voice notification delivery, restart and
   shutdown coverage.
5. Add the durable attention inbox and uncertain-delivery resolution without
   duplicating scheduler state or silently completing tasks.
6. Deliver the morning routine and bounded planning continuation; measure useful
   notifications and unwanted interruptions in the daily-use trial, then complete
   the required independent review.

Acceptance criteria:

- No proactive notification exists without an explicit enabled rule and every
  notification can explain which rule and safe facts caused it.
- Quiet hours, cooling-off periods, budgets, deduplication, and restart behavior
  are deterministic and cannot suppress higher-priority delivery silently.
- One source or delivery failure does not corrupt other rules or expose internal
  diagnostics.
- Inbox items survive restart, reflect canonical delivery state, expire under a
  documented retention policy, and support acknowledgement without replay.
- The morning routine handles missing sources explicitly, presents current facts,
  and can continue into planning without adding unapproved actions or rules.
- `npm run check` passes.

## Milestone 21: Computer Context and Allowlisted Control

Status: planned; depends on the desktop presence and cancellation milestones.

Goal: let explicitly invoked requests use the user's immediate computer context
and perform a small catalog of typed desktop actions.

Included:

- Explicit, ephemeral reads for selected text, clipboard text, active-window
  metadata, and a user-requested screenshot or region capture.
- Visible capture state, bounded payloads, spoken-safe projection, source
  provenance, immediate discard by default, and per-source permissions.
- An application-owned desktop action catalog for opening approved applications
  or files, media/volume controls, focus mode, and named developer workflows.
- Typed arguments, allowlisted targets, capability-specific risk and confirmation
  declarations, cancellation, and safe action results.

Excluded:

- Continuous screenshots, keystroke logging, automatic clipboard history,
  arbitrary provider-authored shell commands, unrestricted filesystem access, hidden
  background control, or claiming rollback after an uncertain external action.

Thin slices:

1. Define context-source and action contracts, scopes, size bounds, retention,
   and confirmation policy.
2. Implement selected-text/clipboard and active-window reads with visible UI
   state and deterministic adapters.
3. Add explicit screenshot capture with bounded local preprocessing and privacy
   controls.
4. Add a small typed desktop-action registry and one named developer-workflow
   adapter without exposing a general shell.
5. Add native-host integration, failure/cancellation coverage, documentation,
   and the required independent review.

Acceptance criteria:

- “Summarize what I selected” and “explain this error” use only the context the
  user explicitly invoked and do not make it durable by default.
- Every action resolves through a configured allowlist and high-risk or unclear
  targets fail closed with exact deterministic confirmation.
- The UI always indicates capture/control activity and exposes revocation and
  recent safe audit information.
- `npm run check` passes.

## Milestone 22: Home Assistant Smart-Home Integration

Status: planned; depends on the proactive attention and action-policy work.

Goal: extend Jarvis into the physical environment through one configured Home
Assistant instance while preserving device-class-specific safety.

Included:

- Read-only state and bounded live updates for explicitly allowlisted entities,
  areas, and scenes through narrow provider-neutral ports.
- Natural queries about lights, media, temperature, air quality, and door/window
  sensors, followed by confirmed control for approved low-risk devices.
- Typed service actions, entity-class risk policy, exact protected confirmation
  facts, timeouts, cancellation, and safe partial results for compound plans.
- Local credential configuration, deterministic adapter contracts, opt-in live
  smoke coverage, integration health in the command center, and proactive rules
  that consume only allowlisted read state.
- Home Assistant's official
  [REST API](https://developers.home-assistant.io/docs/api/rest/) and
  [WebSocket API](https://developers.home-assistant.io/docs/api/websocket/) are
  the initial transport evidence; implementation must revalidate their current
  authentication and action semantics before selecting an adapter.

Excluded:

- Direct device-protocol support in the first milestone, automatic discovery
  enrollment, remote public exposure, or ordinary control of locks, doors,
  security systems, ovens, and safety-critical climate devices. Those classes
  fail closed until separately scoped and proven.

Thin slices:

1. Select and pin Home Assistant REST/WebSocket semantics and define entity,
   state, event, and action contracts.
2. Implement allowlisted read-only state with external-data validation and
   reconnect behavior.
3. Add low-risk typed controls with deterministic confirmation and unknown-outcome
   handling.
4. Add live state projection, attention rules, text/voice/UI integration, and an
   opt-in authenticated smoke.
5. Complete operational documentation and the required independent review.

Acceptance criteria:

- Read access and control access are independently configurable and only named
  entities/actions are exposed to intent or execution.
- Safety-critical classes fail closed; an ambiguous entity or unknown action
  outcome is never guessed, retried automatically, or described as successful.
- Live disconnect/reconnect, malformed messages, shutdown, and credential
  failures remain bounded and diagnostic-safe.
- `npm run check` passes.

## Milestone 23: Real Communications

Status: planned; depends on desktop confirmation presentation and an explicit
provider-selection decision. Deliver after the responsiveness, continuity,
attention, and narrow meeting-preparation pilot evidence gates.

Goal: replace the mock-only messaging experience with one real, bounded personal
communication integration that supports reading, drafting, and safe sending.

Included:

- A short provider/authentication proof that selects one service based on the
  user's real account semantics, supported API, privacy, idempotency, and test
  environment rather than assuming personal WhatsApp access exists.
- Bounded recent/unread message reads, conversation references, summaries, and
  drafts in the user's explicit response style.
- Exact recipient, destination, and body confirmation for every send.
- Durable `prepared`, `sending/unknown`, and `confirmed` send lifecycle state,
  provider idempotency where available, restart recovery, and no automatic retry
  from an unknown outcome.

Excluded:

- Scraping unsupported consumer clients, bulk or autonomous outreach, hidden
  sending, provider-generic semantics invented before one adapter proves them,
  retaining complete inbox history, or claiming end-to-end encryption the
  selected integration does not provide.

Thin slices:

1. Run the target-selection/authentication proof and record current primary
   provider evidence, permissions, data handling, and test constraints.
2. Implement provider-neutral bounded read and draft contracts plus deterministic
   adapters.
3. Add the selected read-only adapter and opaque conversation references.
4. Add the durable send state machine, confirmation, idempotency, crash-window
   tests, and opt-in live smoke.
5. Add compound plan, voice/UI, documentation, and required review coverage.

Acceptance criteria:

- The selected service demonstrably represents the intended personal messaging
  workflow; unsupported account semantics are documented rather than simulated.
- Reads expose only bounded safe fields and send confirmation preserves exact
  recipient, destination, and body facts.
- Restart and crash-window tests prove that an unknown send is surfaced for
  reconciliation and never automatically duplicated.
- `npm run check` passes.

## Milestone 24: Personal Knowledge Library

Status: planned; depends on desktop source presentation and privacy controls.
The initial pilot follows Milestone 20 and precedes broad Milestones 21 and 23;
the remaining library scope retains its milestone number and completion gate.

Goal: answer questions from explicitly imported personal documents, notes,
manuals, repositories, and bookmarks with reviewable citations.

Included:

- User-created collections with explicit file/folder/bookmark import, supported
  type and size limits, indexing status, provenance, refresh, export, and delete.
- Local parsing and indexing behind provider-neutral retrieval ports, with
  configurable local or opt-in remote answer generation.
- Bounded cited retrieval, source-title links in capable UIs, URL-free speech,
  and narrow collection scopes per request.
- Filesystem watching only for explicitly enrolled collections, with safe
  symlink/path handling and visible indexing failures.
- An early project-context and meeting preparation pilot: explicitly enroll
  selected text/Markdown notes, associate only user-selected calendar context and
  tasks, and return a short cited preparation brief through application-owned
  narrow reads. Working context is ephemeral unless explicitly saved through
  canonical collection/profile commands; it is not inferred adaptive memory.

Excluded:

- Automatic home-directory crawling, unrelated-provider access to raw private
  content, executing document instructions, unrestricted code execution,
  personal-knowledge answers without citations, or treating retrieved text as
  permissions.

Thin slices:

1. Define collection, document, chunk, citation, lifecycle, and privacy contracts.
2. Implement explicit import/delete/export and one bounded local text/Markdown
   parser with deterministic retrieval.
3. Deliver and independently review the narrow project/meeting pilot with explicit
   scopes, provenance, deletion, and cited preparation. Do not mark the full
   milestone complete. Then add incremental indexing, additional formats, and
   opt-in watching as later slices.
4. Add cited answering and follow-ups through existing untrusted-source and
   human-text policy.
5. Add UI management, backup/recovery guidance, provider smokes where selected,
   and the required independent review.

Acceptance criteria:

- Nothing is indexed until the user explicitly enrolls it, and deleting a
  collection removes its retrievable index and retained source metadata.
- Every factual library answer resolves its citations to the current bounded
  result set; instructions inside a document cannot create actions or
  permissions.
- Local and remote processing choices are explicit and the UI shows collection,
  source, freshness, and indexing health.
- Meeting preparation uses only the selected event, enrolled notes, and scoped
  tasks; missing evidence is stated and unrelated collections remain inaccessible.
- `npm run check` passes.

## Milestone 25: Approval-Based Adaptive Memory

Status: planned; depends on the explicit profile, knowledge, attention, and
desktop control surfaces from earlier milestones.

Goal: let Jarvis suggest useful durable preferences from repeated interactions
without silently converting conversation or provider inference into memory.

Included:

- Bounded process-local candidate detection for a small typed set of preference
  fields, with evidence counts and expiry before approval.
- An explicit suggestion such as “You often ask for the short briefing; should I
  remember that?”, followed by the ordinary validated profile/preference command.
- User-authored approval provenance, explanation, correction, export, expiry,
  deletion, and a UI page separating approved facts from pending suggestions.
- Per-category enable/disable, suggestion cooling-off periods, and a global
  memory-off control that prevents candidate creation.

Excluded:

- Silent learning, durable embeddings of conversation history, inferred
  sensitive traits, provider-owned memory, hidden behavioral scoring, or using a
  suggestion before explicit approval.

Thin slices:

1. Define eligible typed preferences, evidence minimization, candidate lifetime,
   sensitivity exclusions, and approval transitions.
2. Implement ephemeral deterministic candidate detection without durable writes.
3. Add explainable suggestions and save-through-existing-command ordering.
4. Add user controls, export/delete, cooling-off periods, restart, and
   changed-topic tests.
5. Add end-to-end voice/UI coverage, privacy documentation, and the required
   independent review.

Acceptance criteria:

- No inferred value becomes durable or affects behavior before an explicit
  approval executes the canonical validated write.
- Candidates contain only the bounded evidence required to explain the
  suggestion and expire without creating profile or knowledge state.
- Memory-off, correction, deletion, export, and provenance behavior is complete
  and independently testable without a model provider.
- `npm run check` passes.

## Roadmap Rule

Do not introduce external API dependencies before the deterministic core, mock adapters, feature model, and dependency boundary checks exist.

Keep this roadmap aligned with the codebase as milestones are completed, split, deferred, or changed. Updates to implementation status, tooling, workflow, or milestone scope should be reflected in `README.md`, `AGENTS.md`, and the relevant `docs/` files in the same thin TDD slice.
