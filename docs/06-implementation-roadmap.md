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
in `docs/09-implemented-milestones.md`. The earlier proposed roadmap after
Milestone 12.1 has been retired so the next product direction can be selected
from current user needs rather than inherited provider work.

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
  Milestone 12.1 was retired on 2026-07-28 pending a new capability-focused
  product plan.

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

## Roadmap Rule

Do not introduce external API dependencies before the deterministic core, mock adapters, feature model, and dependency boundary checks exist.

Keep this roadmap aligned with the codebase as milestones are completed, split, deferred, or changed. Updates to implementation status, tooling, workflow, or milestone scope should be reflected in `README.md`, `AGENTS.md`, and the relevant `docs/` files in the same thin TDD slice.
