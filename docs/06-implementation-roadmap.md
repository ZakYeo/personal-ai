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
required independent review. Its evidence-backed report prioritizes compound
command plans, calendar result follow-ups, measured local voice, target-specific
messaging, and finally a local structured intent provider. Milestone 10 is
implemented after its required independent maintainability review. It adds
bounded compound plans with whole-plan validation, aggregate exact
confirmation, ordered stop-on-first-failure execution, and deterministic plus
opt-in live smoke coverage.
Milestone 11 is implemented after its required independent maintainability
review. It adds bounded assistant-session calendar references, deterministic
expiry and ambiguity handling, read-only stable event lookup, safe provider
grounding, and text, voice, adapter, and live smoke coverage.
Milestone 12.1 implementation is complete and awaiting its required independent
maintainability review. It adds bounded,
provider-neutral read-tool chaining before a fully validated terminal command
or compound plan, initially proving calendar-result-driven alarm creation.

## Implemented Milestone Archive

Detailed acceptance criteria and outcomes for Milestones 1 through 11 are kept
in `docs/09-implemented-milestones.md`. This roadmap retains the current
position, completed discovery decision, and active/future work.

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
- Local voice and local intent choices are gated by target-device benchmarks.
- Anthropic strict tool use is a credible alternate cloud-intent path, but it is
  deferred because another credential, billed network adapter, and off-device
  data path add no immediate user outcome.
- Messaging is gated by a target and encryption proof because Matrix user
  clients, Telegram bots, and WhatsApp business messaging do not expose the
  same product semantics.

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
- Milestones 13 and 14 are updated with exact selected implementations before
  their code begins.

## Milestone 12.1: Bounded Tool-Chain Workflows

Status: implementation complete; independent maintainability review pending.

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
   required independent maintainability review.

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

## Milestone 13: First-Class Local STT

Status: planned; blocked because Spike 12 selected no passing STT candidate.

Goal: provide an offline STT adapter selected explicitly through the existing
batch or cohesive streaming voice configuration.

Included:

- The benchmark-selected local STT adapter behind existing voice ports.
- Adapter-owned typed config, model preflight, timeouts, abort, cleanup, and
  diagnostic-safe command or native transport handling.
- Reproducible operator setup with model URL, checksum, license, and supported
  hardware guidance.
- Deterministic adapter contracts plus opt-in desktop and Pi live smokes.

Excluded:

- Bundled model weights, silent downloads, or making local STT the deterministic
  repository default.
- Local TTS or local intent interpretation.

Thin slices:

1. Add focused local-STT config fixtures, parse the selected adapter's typed
   config, and fail preflight cleanly when its model is unavailable.
2. Implement batch transcription against shared adapter contracts with timeout,
   abort, malformed-output, and cleanup tests.
3. Add the cohesive streaming capture/transcription path only if Spike 12
   selected and benchmarked streaming.
4. Register the adapter through the provider-neutral desktop/Pi voice registry
   and prove one-change selection and invalid-config cases.
5. Add opt-in desktop and Pi smokes plus model checksum, license, setup, and
   operator documentation.

Acceptance criteria:

- Config selects the adapter without provider-specific types leaking into
  neutral voice config.
- Capture shutdown and transcription timeouts settle promptly and clean up all
  resources.
- Normal validation requires no model or audio hardware; opt-in smokes reproduce
  the benchmarked path.
- `npm run check` passes.

## Milestone 14: First-Class Local TTS

Status: planned; blocked because Spike 12 selected no passing TTS candidate.

Goal: provide offline synthesis and playback through the benchmark-selected
local TTS implementation.

Included:

- The selected local TTS adapter behind the existing synthesis/output ports.
- Typed adapter config, model and voice preflight, bounded streaming or file
  cleanup, abort, and safe diagnostics.
- Explicit license and model-distribution guidance.
- Output-coordinator coverage proving alarm delivery and ordinary speech remain
  serialized.
- Deterministic contracts plus opt-in desktop and Pi smokes.

Excluded:

- Bundled voice models, voice cloning, or automatic model downloads.
- Changing assistant response text or response-rewriter ownership.

Thin slices:

1. Add focused local-TTS config fixtures, typed parsing, voice/model preflight,
   and invalid-config tests.
2. Implement synthesis through stdin or a native boundary with timeout, abort,
   malformed-output, and cleanup contracts.
3. Add cohesive streaming synthesis/playback only if Spike 12 selected and
   benchmarked it.
4. Register the adapter in desktop/Pi composition and prove output-coordinator
   serialization for normal speech and alarm delivery.
5. Add text fallback tests, opt-in device smokes, and model/license/operator
   documentation.

Acceptance criteria:

- Local TTS can deliver both assistant responses and alarms through configured
  desktop and Pi composition.
- Private text reaches subprocess implementations through stdin, never process
  arguments.
- Failure and cleanup paths preserve diagnostics and provide text fallback when
  possible.
- `npm run check` passes.

## Spike 15: Messaging Target and Encryption Proof

Status: planned.

Goal: select one messaging product boundary and prove that its official API can
support the intended read, draft, and send semantics safely.

Included:

- An explicit user choice between a Matrix user client, Telegram bot-mediated
  chats, WhatsApp business messaging, or deferral.
- Minimal authentication and read-only retrieval against a disposable test
  account or room.
- Matrix encrypted-room feasibility when Matrix is selected.
- Credential lifecycle, pagination/synchronization, deduplication, privacy,
  rate-limit, and idempotency findings.
- Exact port revisions and deterministic contract fixtures for Milestones 16
  and 17.

Excluded:

- Production message access, message sending, broad inbox synchronization, or
  credentials in repository files.

Acceptance criteria:

- The chosen API demonstrably exposes the user outcome being promised; bot or
  business semantics are not presented as a personal inbox.
- Encryption support is proven or encrypted conversations are explicitly
  excluded from the first implementation.
- A no-go result defers Milestones 16 and 17 without speculative abstractions.

## Milestone 16: Real Messaging Read and Draft

Status: planned; blocked on Spike 15 selection.

Goal: read bounded recent messages and draft replies for the selected messaging
target without sending them.

Included:

- A target-specific adapter behind narrow read and draft application ports.
- Bounded incremental retrieval, stable opaque message references, and explicit
  supported conversation types.
- Safe user-facing summaries and provider-output validation from `unknown`.
- Credential preflight, deterministic contracts, and an opt-in live read smoke.

Excluded:

- Sending, background full-history synchronization, cross-provider aggregation,
  and unsupported encrypted conversations.

Thin slices:

1. Freeze the Spike 15 target semantics in narrow read/draft ports and add
   target-specific config and credential fixtures.
2. Implement authenticated bounded retrieval, structural response parsing, and
   pagination or synchronization-token contracts.
3. Add stable opaque references, deduplication, restart, and unsupported-chat or
   encryption tests.
4. Compose read-only retrieval through the feature registry and protect every
   displayed sender, destination, time, and message fact.
5. Add provider-independent drafting, runtime-boundary failures, an opt-in live
   read smoke, and operator documentation.

Acceptance criteria:

- Reads are bounded, resumable without silent duplication, and limited to the
  documented account/room/chat semantics.
- Drafting cannot cause a provider-side message action.
- Provider payloads and credentials remain out of user-facing text and normal
  diagnostics.
- `npm run check` passes.

## Milestone 17: Confirmed Messaging Send

Status: planned; blocked on Milestone 16.

Goal: send an explicitly reviewed draft through the selected messaging target
with fail-closed confirmation and duplicate protection.

Included:

- High-risk send capability metadata and aggregate-plan confirmation support.
- Exact recipient, destination, and message fact protection.
- A durable pre-send lifecycle that persists `prepared`, transitions to
  `sending/unknown` before transport, and records `confirmed` only after a
  structurally validated provider result.
- Provider idempotency keys wherever the selected API supports them; durable
  state does not substitute for provider idempotency.
- Safe retry classification, delivery receipt metadata where available, and an
  opt-in live send smoke against a disposable destination.

Excluded:

- Autonomous replies, bulk sends, scheduled sends, or silent retries where the
  provider cannot prove duplicate safety.

Thin slices:

1. Add the high-risk send capability and its typed deterministic confirmation
   renderer for exact recipient, destination, and body facts.
2. Define and test the durable prepared, sending/unknown, and confirmed send
   lifecycle before adding provider transport.
3. Implement target transport with provider idempotency keys where available,
   structural response parsing, and safe failure classification.
4. Integrate single-command and compound-plan confirmation without
   reinterpretation and add crash-window/restart tests.
5. Add an opt-in disposable-destination live smoke and explicit retry/operator
   guidance.

Acceptance criteria:

- Send always requires confirmation by default and resumes the exact validated
  recipient and body without reinterpretation.
- Ambiguous recipients and unsupported destinations fail closed.
- A timeout or uncertain provider result is never reported as success and is not
  retried automatically when its durable state is `sending/unknown`.
- Deterministic crash-window tests cover restart before transport, during an
  unknown provider outcome, and after provider confirmation; none can duplicate
  a send.
- `npm run check` passes.

## Spike 18: Local Intent Accuracy Benchmark

Status: planned; blocked on Milestone 14.

Goal: determine whether a local structured-output model can safely replace the
cloud intent path on supported hardware.

Included:

- At least one locally hosted JSON-schema/tool-capable provider, initially
  Ollama, evaluated against the deterministic single-command and compound-plan
  corpus.
- Capability selection, argument accuracy, unsupported-request rejection,
  confirmation classification, latency, memory, and cold-start measurements.
- Adversarial malformed-output and duplicate-name cases.
- A documented model/version selection or no-go threshold.

Excluded:

- Production registration, model weights in Git, or treating schema-constrained
  generation as trusted validation.

Acceptance criteria:

- Results are reproducible on the supported desktop and Pi target.
- The chosen model meets documented safety and accuracy thresholds, including
  compound plans, or Milestone 19 is deferred.
- Exact model identity, quantization, runtime, prompt, and schema are recorded.

## Milestone 19: Local Structured Intent Provider

Status: planned; blocked on Spike 18 selection.

Goal: add the selected local structured intent provider as an explicit opt-in
adapter behind the existing intent port.

Included:

- Adapter-owned typed config and registry entry.
- Single-command and compound-plan structured output parsing from `unknown`.
- Startup preflight, timeout, abort, transport, and diagnostic-safe failure
  behavior.
- Deterministic adapter contracts and opt-in desktop/Pi live smokes.

Excluded:

- Bundled model weights, implicit downloads, provider-specific types in ports,
  or bypassing core validation and confirmation.

Thin slices:

1. Add focused local-intent config fixtures, adapter-owned parsing, model
   preflight, and registry selection tests.
2. Build single-command and proposed-plan requests from the shared immutable
   capability catalog.
3. Parse raw structured output from `unknown`, rejecting malformed, duplicate,
   incomplete, and out-of-catalog proposals before core validation.
4. Add timeout, abort, transport, and diagnostic-safe runtime composition tests
   for desktop and Pi selections.
5. Add opt-in benchmark-corpus smokes plus exact model, quantization, setup, and
   operator documentation.

Acceptance criteria:

- The local provider passes the same capability catalog, duplicate-name,
  validation, confirmation, and compound-plan contracts as cloud intent.
- Malformed, incomplete, or out-of-catalog output cannot execute a feature.
- Default validation remains deterministic and offline-provider-independent.
- `npm run check` passes.

## Roadmap Rule

Do not introduce external API dependencies before the deterministic core, mock adapters, feature model, and dependency boundary checks exist.

Keep this roadmap aligned with the codebase as milestones are completed, split, deferred, or changed. Updates to implementation status, tooling, workflow, or milestone scope should be reflected in `README.md`, `AGENTS.md`, and the relevant `docs/` files in the same thin TDD slice.
