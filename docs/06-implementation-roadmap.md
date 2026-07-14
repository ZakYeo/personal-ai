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
messaging, and finally a local structured intent provider.

## Implemented Milestone Archive

Detailed acceptance criteria and outcomes for Milestones 1 through 8.1 are kept
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
- Compound command plans are the next implementation milestone because they
  increase the usefulness of every enabled feature without adding an external
  service dependency.
- Calendar follow-ups follow compound plans and stay read-only.
- Local voice and local intent choices are gated by target-device benchmarks.
- Messaging is gated by a target and encryption proof because Matrix user
  clients, Telegram bots, and WhatsApp business messaging do not expose the
  same product semantics.

## Milestone 10: Compound Command Plans

Status: planned.

Goal: allow one utterance to request a small, safe, ordered set of existing
capabilities, including “check my upcoming events and set an alarm for ten
minutes”.

Included:

- An application-owned `ProposedAssistantPlan` containing one to three raw,
  untrusted provider commands and parameters.
- A separate immutable `ValidatedAssistantPlan` whose steps retain resolved
  routes, decoded arguments, confirmation decisions, and deterministic
  protected confirmation facts.
- Intent provider schemas and deterministic fixtures that return either one
  command or one bounded plan.
- Whole-plan validation against the immutable capability routing index before
  any execution.
- One aggregate confirmation for every confirmation-required step, with the
  exact validated plan retained process-locally.
- Sequential execution in utterance order, stopping on the first failure.
- Per-step diagnostic-aware outcomes, protected facts, response metadata, and
  one concise combined human response.
- Text, simulated voice, desktop voice, and Pi service integration coverage.

Excluded:

- Provider-directed loops or dynamically generated follow-on commands.
- Passing one command's output into another command's arguments.
- Parallel execution, rollback, or claims of transactional side effects.
- More than three commands in one utterance.

Thin slices:

1. Add separate proposed and validated plan contracts plus deterministic
   interpretation fixtures.
2. Decode, validate, and route a whole proposed plan into an immutable validated
   plan without executing invalid steps.
3. Aggregate confirmation and resume the exact frozen plan.
4. Execute sequentially with stop-on-first-failure outcomes.
5. Compose safe combined responses through text and voice boundaries.
6. Add the opt-in live OpenAI compound-command smoke.

Acceptance criteria:

- The example calendar-and-alarm utterance produces a two-step plan and, after
  one aggregate confirmation, executes both steps in order.
- No step executes when any plan command is invalid or cannot be routed.
- An explicit yes resumes the already validated plan without reinterpretation;
  no discards it; unrelated input preserves the prompt.
- A failed step prevents later steps from executing and preserves internal
  diagnostics without exposing them to the user.
- Concurrent calls cannot interleave plan execution, pending confirmation, or
  conversation-history commits.
- Existing single-command behavior remains compatible and `npm run check`
  passes.

## Milestone 11: Calendar Result Follow-Ups

Status: planned.

Goal: answer read-only follow-ups about calendar events displayed earlier in the
same assistant session.

Included:

- Process-local, bounded, opaque references to the last displayed calendar
  results.
- Follow-up intents such as “the second one”, “where is that?”, and “what comes
  after it?”.
- Stable provider-event lookup behind the existing calendar boundary or a
  narrowly revised read-only calendar port.
- Explicit expiry, ambiguity, and missing-result behavior.
- Protected event facts and no-wake voice follow-up coverage.

Excluded:

- Calendar creation, editing, deletion, or attendance changes.
- Persistent long-term memory or provider identifiers exposed to an LLM.
- Compound output binding such as scheduling an alarm from an event result.

Thin slices:

1. Retain bounded opaque result references in assistant session state.
2. Resolve ordinal references deterministically.
3. Fetch or answer supported event details through the calendar port.
4. Add ambiguity, expiry, compaction, concurrency, and voice follow-up tests.

Acceptance criteria:

- Follow-ups resolve only against unexpired results from the same assistant
  instance.
- Ambiguous, missing, or expired references ask for clarification and never
  guess an event.
- Provider IDs and raw event payloads do not enter user-facing responses or
  unrestricted conversation history.
- The Google Calendar adapter remains read-only and `npm run check` passes.

## Spike 12: Local Voice Device Benchmark

Status: planned.

Goal: choose local STT and TTS implementations using reproducible measurements
on the supported desktop and Raspberry Pi target.

Included:

- `whisper.cpp` and `sherpa-onnx` STT trials using the same committed audio
  corpus and command scoring.
- Piper and one `sherpa-onnx` TTS trial using the same spoken response corpus.
- Measurements for accuracy or intelligibility, end-of-speech/final and
  first-audio latency, real-time factor, memory, CPU, install size, startup,
  shutdown, and offline operation.
- License, model-source, checksum, packaging, and Pi compatibility review.
- A recorded selection or an explicit no-go threshold.

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

## Milestone 13: First-Class Local STT

Status: planned; blocked on Spike 12 selection.

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

Acceptance criteria:

- Config selects the adapter without provider-specific types leaking into
  neutral voice config.
- Capture shutdown and transcription timeouts settle promptly and clean up all
  resources.
- Normal validation requires no model or audio hardware; opt-in smokes reproduce
  the benchmarked path.
- `npm run check` passes.

## Milestone 14: First-Class Local TTS

Status: planned; blocked on Spike 12 selection.

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
- Provider idempotency or an application-owned durable send-attempt record.
- Safe retry classification, delivery receipt metadata where available, and an
  opt-in live send smoke against a disposable destination.

Excluded:

- Autonomous replies, bulk sends, scheduled sends, or silent retries where the
  provider cannot prove duplicate safety.

Acceptance criteria:

- Send always requires confirmation by default and resumes the exact validated
  recipient and body without reinterpretation.
- Ambiguous recipients and unsupported destinations fail closed.
- A timeout or uncertain provider result is never reported as success and is not
  retried when duplicate safety is unknown.
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

Acceptance criteria:

- The local provider passes the same capability catalog, duplicate-name,
  validation, confirmation, and compound-plan contracts as cloud intent.
- Malformed, incomplete, or out-of-catalog output cannot execute a feature.
- Default validation remains deterministic and offline-provider-independent.
- `npm run check` passes.

## Roadmap Rule

Do not introduce external API dependencies before the deterministic core, mock adapters, feature model, and dependency boundary checks exist.

Keep this roadmap aligned with the codebase as milestones are completed, split, deferred, or changed. Updates to implementation status, tooling, workflow, or milestone scope should be reflected in `README.md`, `AGENTS.md`, and the relevant `docs/` files in the same thin TDD slice.
