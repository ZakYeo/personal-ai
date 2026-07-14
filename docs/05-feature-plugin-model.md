# Feature Plugin Model

## Purpose

Features are the assistant's capabilities. Calendar lookup, message drafting, alarms, reminders, notes, and future integrations should be added as feature plugins rather than as hard-coded branches in the assistant core.

## Feature Contract

The implementation should define a feature contract similar to:

```ts
interface FeaturePlugin {
  id: string;
  displayName: string;
  capabilities: Capability[];
  canHandle?(command: AssistantCommand, context: AssistantContext): boolean;
  execute(
    request: FeatureExecutionRequest,
    context: AssistantContext,
  ): Promise<FeatureResult>;
}
```

The exact TypeScript shape can change, but each feature should declare what it can do and expose execution through a consistent interface. Runtime composition compiles declared capabilities into the canonical routing table and rejects duplicate stable names. `canHandle` is optional and should only be used for contextual checks that cannot be expressed in static capability metadata.

## Capabilities

Capabilities should use stable names.

Examples:

- `calendar.search_events`
- `calendar.get_next_event`
- `calendar.create_event`
- `messaging.read_recent`
- `messaging.draft_reply`
- `messaging.send_reply`
- `alarm.create`
- `alarm.snooze`
- `alarm.reschedule`
- `alarm.edit`
- `alarm.acknowledge`
- `alarm.dismiss`
- `alarm.cancel`
- `alarm.list`

Capability names should be treated as part of the assistant contract. They are useful for intent routing, permission checks, logging, and future configuration.

## Command Flow

Feature execution should follow this flow:

```text
User input
  -> Intent interpretation
  -> Structured assistant command
  -> Feature selection
  -> Command validation and typed argument decoding
  -> Optional confirmation
  -> Feature execution
  -> Feature result
  -> Assistant response
```

The assistant core should work with structured commands. The LLM may propose those commands, but it should not directly execute feature side effects.

## Permission and Confirmation Model

Features should be categorized by risk.

Low-risk examples:

- Search calendar.
- List alarms.
- Draft a message.
- Summarize information.

Higher-risk examples:

- Send a message.
- Create or delete a calendar event.
- Cancel an alarm.
- Modify external state.

Higher-risk actions support confirmation before execution. The assistant retains
one pending command per assistant instance and accepts an explicit yes or no on
the next turn before interpreting another command.
Generated capability summaries describe this policy in feature-neutral language
because any registered capability can be high risk or explicitly require
confirmation.

The confirmation session is intentionally process-local. If a capability
requires confirmation, the assistant stops before feature execution and returns
a yes/no follow-up prompt. A positive response resumes the already decoded
command without asking the intent provider to interpret it again; a negative
response discards it. Restarting the assistant discards any pending command.

High-risk capability safety should fail closed. A capability marked
`risk: "high"` should require confirmation by default unless the feature's
documentation, metadata, and tests explicitly justify a narrower exception.
Configuration may add confirmation requirements for environment-specific cases,
but user-facing defaults should not rely on configuration remembering every
high-risk capability.

## Feature Authoring Conventions

Each feature should make its command contract explicit in `capabilities`.

For each capability:

- Use a stable capability name such as `alarm.create`.
- Set `risk` to `low` or `high`.
- Provide a short user-facing `summary` and fuller `description`. Runtime
  composition uses these fields for provider prompts and the assistant
  capability catalog, so capability-awareness should come from metadata rather
  than hard-coded prompt branches.
- Provide `spokenSummary` when the normal voice-facing capability list needs a
  shorter spoken phrase than the provider-facing summary.
- Set `requiresConfirmation` for high-risk capabilities unless there is an
  explicit documented exception.
- Declare expected command parameters with type metadata and
  required/minimum/positive rules.
- Keep parameter validation generic where possible; domain-specific parsing
  belongs in the feature or adapter.

Feature execution should assume the core has already selected an enabled
feature, matched capability metadata, decoded validated command parameters into
typed feature arguments, and applied confirmation policy. Features should receive
a typed execution request containing the selected capability, the original
command, and decoded arguments. Feature-local handlers should model their
supported capabilities through `defineCapability` and `defineFeature` so
TypeScript derives `request.args` from declared parameter metadata. Feature code
should use decoded `request.args` for command inputs instead of reparsing raw
`AssistantCommand.parameters`. Feature code may still throw if its own
responsibility cannot be completed; runtime-facing boundaries map final failures
into graceful assistant responses while preserving diagnostics internally.

Normal feature modules should be thin dispatch maps backed by small handlers.
Avoid hand-written `execute` switches or capability-name branches in feature
implementations unless a test is intentionally exercising a lower-level or
malformed feature contract.

Runtime composition registers feature adapters through an explicit nested
feature-to-adapter registry. Existing deterministic adapters are selected as
`calendar.mock`, `messaging.mock`, and `alarms.local`; future real integrations
should add entries to the same registry shape and receive narrow adapter
dependencies/config from runtime composition rather than importing provider
selection policy into feature modules.
The runtime also adds a built-in `assistant` feature that lists or describes the
enabled capability catalog. It is runtime-owned rather than user-configured, and
it must stay backed by the same generated feature metadata used by provider
prompts. Composition freezes the compiled routing catalog and supplies that
same immutable artifact through feature execution context, so the built-in
feature does not capture a catalog that is populated later. Its normal list
response should be phrased for speech and avoid
internal capability names unless the user asks for technical detail.
Adapter-specific configuration is parsed as part of selecting the adapter, not
retained in the common loaded feature shape or passed as an untyped generic
bag. Each registry entry owns the parser that proves its exact config type and
captures that typed value for construction and optional startup preflight.
Adding a provider therefore changes its feature-local registry entry rather
than widening `ParsedFeatureConfig`. Avoid `unknown` adapter config plus casts
inside factories; that hides the real feature/provider invariant.
Enabled parsed feature entries always contain their selected adapter ID and
resolved adapter, while disabled entries do not require either. Runtime
composition rejects a registry factory that returns a plugin whose `id` differs
from the configured feature key so metadata and confirmation policy stay bound
to the intended feature.

Deterministic intent matching should follow the same capability-driven shape as
real provider routing. A small deterministic adapter may use simple rules for
early fixtures, but it should not become a central feature-specific branch list.
When deterministic matching grows, express rules as data tied to declared
capability names, or keep feature-specific deterministic fixtures near the
feature contract tests, so adding a feature does not require editing unrelated
shared interpreter control flow.
The deterministic rule helper derives its allowed keys from the decorated
feature's execution contract, so an undeclared capability is a compile error.
The review bar for deterministic routing is the same as the production routing
bar: adding a capability should primarily add capability-owned metadata or
rules, not another condition in a shared interpreter. Central deterministic
matching may orchestrate registered rules, but it should not own feature
knowledge beyond the declared capability contract.

Feature authors should keep the declared parameter object literal stable with `as const satisfies FeatureCapabilityParameters` when it is shared outside the builder. This preserves literal metadata such as `required: true`, allowing `defineCapability` to make required arguments non-optional and optional arguments optional in the handler.

The central `defineFeature` dispatcher should route execution by the selected capability name only. Requests for undeclared capability names must fail before any declared handler runs, preserving the structural tie between capability metadata and handler arguments.

Shared feature test helpers should teach the same contract: normal feature fixtures should be authored through `defineCapability` and `defineFeature`, and handlers should assert behavior through decoded `request.args`. Raw `FeaturePlugin` fixtures are reserved for tests that intentionally exercise lower-level or malformed feature contracts.

Tests for a new feature should cover:

- The feature capability metadata.
- Valid command execution.
- Feature-local failure cases.
- Assistant-level validation for malformed structured commands when the feature introduces new parameter shapes.
- Confirmation behavior when the capability is risky or configured to require confirmation.
- Any explicit no-confirmation exception for a high-risk capability.

## Initial Features

The initial deterministic features should be:

### Calendar

Mock capability for searching known fixture events.

Example command:

```text
Hey Jarvis, can you check my calendar for the date of the upcoming wedding please?
Hey Jarvis, can you check my calendar please? What upcoming events do I have?
```

Expected behavior:

```text
Search mock calendar events by optional query and optional date range, or list upcoming events when no query is provided. Generic upcoming event lists default to the configured 92-day lookahead window. Deterministic calendar responses preserve exact provider date/time facts; displayed values become protected response facts, and core restores nearby dates after optional rewriting with UTC phrases such as `this Friday the 17th` or `next Monday the 20th` and natural event-local times such as `11am`. Date-only events are spoken as `all day`.
```

### Messaging

Mock capability for drafting or simulating a response to a recent message.

Example command:

```text
Hey Jarvis, can you respond to that WhatsApp message for me?
```

Expected behavior:

```text
Create a deterministic draft response. Do not send anything in the first milestone.
```

### Alarms

Local/in-memory or file-backed capability for creating, listing, snoozing,
rescheduling, renaming, acknowledging, dismissing, and cancelling alarms.
Alarm identity belongs to the selected `AlarmStore`; feature logic provides the
alarm details and reports the stored record returned by the port. The adapter
contributes a neutral runtime task that closes over that same store; configured
voice services run it with notification delivery while generic feature and
service composition remain unaware of alarm-specific resources. The scheduler
durably claims due attempts before speaking through the selected voice output.
Acknowledgement and dismissal stop a ringing alarm. Snooze persists a new due
time and resets its bounded delivery attempts. Rescheduling and label editing
preserve stable alarm identity. Cancellation and rescheduling are high-risk
lifecycle changes and require confirmation by default. List responses describe
each alarm's status in human-facing language.
Creation optionally accepts a daily or weekly recurrence plus a required IANA
timezone. Recurring completion advances through the adapter-owned lifecycle
state machine, preserving local wall-clock time and stable identity rather than
creating a replacement alarm record.
The alarms adapter also contributes a neutral retention task alongside delivery.
It closes over the same store and removes only terminal records older than 30
days, keeping retention serialized with lifecycle commands without exposing an
alarm-specific resource to generic service composition.

Example command:

```text
Hey Jarvis, set an alarm to ping me in 10 minutes.
```

Expected behavior:

```text
Create a durable alarm record only after confirmation policy allows execution.
The long-running voice service delivers it at or after its due time, repeats it
once when it is not acknowledged, and preserves lifecycle state across restart.
```

## Feature Registration

Features should be registered through runtime composition or a feature registry. The core should not import individual concrete feature implementations unless those implementations are part of the core feature layer.

Configuration should determine which features are enabled.

## Documentation Maintenance

Keep this feature plugin model aligned with implemented feature contracts, capability metadata, registration, typed argument decoding, and test helper expectations. Feature model changes should update `README.md`, `AGENTS.md`, and the relevant `docs/` files in the same thin TDD slice.
