# Spike 9: Future Milestone Discovery Report

Date: 2026-07-14

## Outcome

The next implementation milestone should be compound command plans. A single
utterance should be able to propose a small ordered plan such as checking
upcoming calendar events and creating an alarm for ten minutes later. This adds
more day-to-day value to every existing feature than another provider adapter
would, and the current capability catalog, validation, confirmation, and
diagnostic-aware outcome boundaries provide most of the required foundations.

Calendar result follow-ups should come next. Local STT and TTS should follow a
device benchmark rather than a speculative adapter choice. Real messaging and a
local intent provider remain worthwhile, but each needs a bounded proof before
production implementation.

## Candidate Comparison

| Candidate                  | User value                                  | Architectural fit                                                             | Main uncertainty                                                       | Decision                    |
| -------------------------- | ------------------------------------------- | ----------------------------------------------------------------------------- | ---------------------------------------------------------------------- | --------------------------- |
| Compound command plans     | High across every feature                   | Extends interpretation and core orchestration while reusing feature contracts | Safe confirmation and partial-failure semantics                        | Implement next              |
| Calendar result follow-ups | High for the existing real calendar adapter | Adds session-owned opaque result references; calendar remains read-only       | Reference expiry and ambiguity                                         | Implement after plans       |
| Local STT                  | High privacy and offline value              | Existing batch and streaming ports are suitable                               | Pi latency, accuracy, memory, and model packaging                      | Benchmark, then implement   |
| Local TTS                  | High privacy and offline value              | Existing synthesis and output ports are suitable                              | Voice quality, first-audio latency, packaging, and license obligations | Benchmark, then implement   |
| Real messaging             | Potentially high                            | Existing feature shape is useful but provider semantics vary substantially    | Which account and service should be integrated; end-to-end encryption  | Prove one target first      |
| Anthropic cloud intent     | Moderate resilience and choice              | Existing intent registry can add an adapter for strict schema tool calls      | A second cloud credential and cost without a new user outcome          | Defer                       |
| Local intent provider      | High offline value after local voice        | Existing intent port is suitable                                              | Structured-command accuracy on target hardware                         | Benchmark after local voice |

## Recommendation 1: Compound Command Plans

The first version should interpret either one command or an ordered plan of at
most three independently resolvable commands. The example utterance becomes:

1. `calendar.list_upcoming` with its complete arguments.
2. `alarms.create` with `minutesFromNow: 10` and a complete label.

The plan is not an autonomous agent loop. The provider returns one untrusted
raw command or `ProposedAssistantPlan` once. Core resolves routes, decodes and
validates arguments, evaluates confirmation policy, and creates an immutable
`ValidatedAssistantPlan` without asking the provider what to do next. Only the
validated type can become pending or execute.

Safety rules:

- Validate the entire plan before executing any step.
- Aggregate all confirmation-required steps into one concise prompt rendered by
  capability-owned deterministic confirmation declarations. Protect and state
  every material decoded fact, including recipients, destinations, message
  bodies, labels, dates, and times; a provider-authored generic action name is
  insufficient.
- Keep one process-local pending plan per assistant instance. An explicit yes
  resumes that exact frozen plan, an explicit no discards all of it, and other
  input keeps the prompt active.
- Execute sequentially in utterance order and stop on the first failure.
- Classify every step outcome as `succeeded`, `failed`, or `skipped`, while
  preserving response facts, metadata, and internal diagnostics. After partial
  success, the safe response must identify what completed, what failed, and what
  was not attempted so retrying cannot silently duplicate completed work.
- Do not support output binding in the first version. Each step must be complete
  from the original utterance, so “set an alarm when the first event starts” is
  deferred while “check my events and set an alarm for ten minutes” is valid.
- Serialize a whole plan with conversation history and confirmation state so
  concurrent callers cannot interleave its steps.

The validated plan retains each stable route, decoded arguments, confirmation
decision, and deterministic protected confirmation facts. The two plan types
and plan outcome metadata remain neutral application-owned contracts. They do
not add batch execution to individual feature plugins or make one feature
import another.

## Recommendation 2: Calendar Result Follow-Ups

The Google Calendar API supports stable event identifiers and bounded event
queries. The assistant can therefore retain a small, process-local set of opaque
references to the last displayed results and resolve phrases such as “the second
one”, “where is that?”, or “what comes after it?” without exposing provider IDs
to the conversation provider.

The reference store should belong to the assistant session and retain only the
latest displayed result set, capped at ten event references. A new calendar
result replaces the prior set. References expire after three subsequent
completed assistant turns or at conversation compaction, whichever comes first,
and contain only the fields needed for supported follow-ups. Calendar adapters
remain read-only. Ambiguous, expired, or missing references should produce a
clarification rather than guessing.

## Recommendation 3: Benchmark Local Voice Before Selecting It

The existing command and streaming voice ports are already appropriate. The
remaining question is operational, not architectural.

For STT, benchmark `whisper.cpp` and `sherpa-onnx` on the supported desktop and
Raspberry Pi target. `whisper.cpp` offers a small native runtime, quantized
models, and a real-time microphone example. `sherpa-onnx` offers explicit
streaming ASR, VAD, ARM64/Raspberry Pi support, and Node.js examples. Select the
winner from measured command accuracy, end-of-speech-to-final latency, peak
memory, CPU load, installation reproducibility, and license/model obligations.

For TTS, benchmark the current Open Home Foundation Piper implementation and a
`sherpa-onnx` voice on first-audio latency, real-time factor, intelligibility,
voice quality, memory, and clean shutdown. Piper is fast and local, but its
current implementation is GPL-3.0, so distribution obligations must be reviewed
before bundling it. Operator-installed command adapters can remain an immediate
experimental path without making a provider a repository default.

Model files should not be committed to the repository. Downloads, hashes,
licenses, hardware expectations, and offline startup preflight must be explicit.

## Recommendation 4: Prove Messaging Semantics Before Building

“Read my recent messages” means different things across providers:

- Matrix exposes a client-server API for authenticated user accounts, including
  incremental room synchronization and message sending. It is the strongest
  fit for a real personal inbox, but encrypted-room support adds substantial key
  and session lifecycle work.
- Telegram's Bot API receives updates visible to a bot and can send as that bot;
  it is not a general mirror of an ordinary user's complete inbox. It is a good
  option only if bot-mediated chats satisfy the intended product outcome.
- WhatsApp Cloud API is centred on business phone numbers, webhooks, and
  business messaging. It should not be treated as an API for an arbitrary
  personal WhatsApp inbox.

The next messaging work should therefore be a target-selection and authentication
proof, not a generic “real messaging” adapter. Matrix is the default
recommendation if the user is willing to use Matrix. Read and draft should ship
before send. Sending remains high risk and requires confirmation by default. A
durable pre-send lifecycle must persist `prepared` before transport, transition
to `sending/unknown` before the request can be accepted, and reach `confirmed`
only from a structurally validated provider result. A `sending/unknown` record
is never retried automatically. Provider idempotency keys are additionally
required wherever the selected API supports them; an after-send record alone is
not duplicate protection.

## Recommendation 5: Defer Another Intent Provider

Anthropic is a credible additional cloud provider: its current API accepts
JSON-schema client tools and offers strict schema-conforming tool inputs. It
fits the existing registry, but it requires another cloud credential, billed
network calls, provider-specific transport and parser maintenance, and sending
utterance/capability data off device while adding provider choice more than a
new user outcome. It should follow compound commands, calendar follow-ups, and
local voice unless provider resilience becomes an explicit priority.

A local provider is more strategically useful because it completes an offline
path. Ollama currently supports JSON-schema structured outputs and tool
definitions, which makes it a plausible adapter candidate. A bounded benchmark
must first measure exact capability selection, argument accuracy, rejection of
unsupported requests, compound-plan accuracy, latency, and memory on the target
hardware. Provider output remains untrusted `unknown` data and must pass the
same application validation as every other intent adapter.

## Ordered Roadmap

1. Milestone 10: Compound Command Plans.
2. Milestone 11: Calendar Result Follow-Ups.
3. Spike 12: Local Voice Device Benchmark.
4. Milestone 13: First-Class Local STT.
5. Milestone 14: First-Class Local TTS.
6. Spike 15: Messaging Target and Encryption Proof.
7. Milestone 16: Real Messaging Read and Draft.
8. Milestone 17: Confirmed Messaging Send.
9. Spike 18: Local Intent Accuracy Benchmark.
10. Milestone 19: Local Structured Intent Provider.

## Evidence

All sources below were accessed on 2026-07-14. Provider features and commercial
terms are mutable; implementation spikes must pin the selected API/model version
and recheck current pricing and data-handling terms before code begins.

| Candidate                  | Material constraints recorded for this decision                                                                                                                                               | Primary evidence                                                                                                                                                                                  | Decision impact                                                         |
| -------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------- |
| OpenAI compound intent     | Existing API key and billed network path; utterance and capability catalog leave the device; schema/tool calls are available, but application validation and measured latency remain required | [Function calling](https://developers.openai.com/api/docs/guides/function-calling) and [Realtime](https://developers.openai.com/api/docs/guides/realtime)                                         | Extend the existing opt-in provider after deterministic plan contracts  |
| Anthropic cloud intent     | Additional API key, billed network calls, off-device request data, and a new transport/parser; strict JSON-schema tool inputs are available                                                   | [Anthropic tool use](https://platform.claude.com/docs/en/agents-and-tools/tool-use/overview) and [strict tool use](https://platform.claude.com/docs/en/agents-and-tools/tool-use/strict-tool-use) | Technically viable, but defer because it adds no immediate user outcome |
| Google Calendar follow-ups | Existing OAuth credential; read-only network lookup; no new per-feature provider choice; follow-up latency remains one bounded calendar request when cached fields are insufficient           | [Events list](https://developers.google.com/workspace/calendar/api/v3/reference/events/list)                                                                                                      | Implement session references without widening calendar permissions      |
| Matrix messaging           | User access token, synchronization state, network service, and potentially substantial encrypted-room key/session handling                                                                    | [Client-Server API](https://spec.matrix.org/latest/client-server-api/)                                                                                                                            | Preferred personal-inbox semantics, gated by encryption proof           |
| Telegram messaging         | Bot token; only bot-visible updates/chats; network service and bot identity rather than a general personal inbox                                                                              | [Bot API](https://core.telegram.org/bots/api)                                                                                                                                                     | Use only if bot-mediated product semantics are explicitly selected      |
| WhatsApp messaging         | Meta business account/phone-number and webhook setup; network service and business messaging semantics                                                                                        | [Cloud API overview](https://developers.facebook.com/docs/whatsapp/cloud-api/overview)                                                                                                            | Do not promise arbitrary personal-inbox access                          |
| `whisper.cpp` STT          | Offline after model installation with no per-request provider fee; local CPU, memory, model license/source, accuracy, and Pi finalization latency must be measured                            | [`whisper.cpp`](https://github.com/ggml-org/whisper.cpp)                                                                                                                                          | Benchmark against explicit device thresholds before selection           |
| `sherpa-onnx` voice        | Offline after model installation with no per-request provider fee; local CPU, memory, model licenses, accuracy/quality, and streaming latency must be measured                                | [`sherpa-onnx`](https://github.com/k2-fsa/sherpa-onnx)                                                                                                                                            | Benchmark as the streaming STT and alternate TTS candidate              |
| Piper TTS                  | Offline after model installation with no per-request provider fee; GPL-3.0 implementation, voice-model obligations, local memory, and first-audio latency                                     | [Piper](https://github.com/OHF-Voice/piper1-gpl)                                                                                                                                                  | Benchmark and review distribution obligations before bundling           |
| Ollama local intent        | No cloud credential or per-request provider fee for local models; model storage, memory, cold start, structured-command accuracy, and Pi latency must be measured                             | [Structured outputs](https://docs.ollama.com/capabilities/structured-outputs) and [tool calling](https://docs.ollama.com/capabilities/tool-calling)                                               | Evaluate only after local voice establishes the offline device path     |

The local benchmark pass/fail thresholds are deliberately assigned to Spike 12
and Spike 18 because no target-device measurements exist yet. Those spikes must
record numeric latency, memory, accuracy, and real-time-factor thresholds before
selecting an implementation; absence of measurements is not evidence of
fitness.

## Decision Boundaries

This spike changes documentation and roadmap ordering only. It does not select
or install a production provider, add a new application dependency, commit a
model, send a message, or widen any runtime's credential access.
