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
  canHandle(command: AssistantCommand, context: AssistantContext): boolean;
  execute(
    command: AssistantCommand,
    context: AssistantContext,
  ): Promise<FeatureResult>;
}
```

The exact TypeScript shape can change, but each feature should declare what it can do and expose execution through a consistent interface.

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
  -> Command validation
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

Higher-risk actions should support confirmation before execution. The exact confirmation model can be implemented later, but the feature contract should leave room for it.

Milestone 1.5 intentionally uses a thin confirmation policy. If a capability requires confirmation, the assistant stops before feature execution and returns a yes/no confirmation prompt. It does not yet persist pending commands or resume them in a later turn.

## Feature Authoring Conventions

Each feature should make its command contract explicit in `capabilities`.

For each capability:

- Use a stable capability name such as `alarm.create`.
- Set `risk` to `low` or `high`.
- Set `requiresConfirmation` only when the feature itself should always stop before execution.
- Declare expected command parameters with type metadata and required/minimum/positive rules.
- Keep parameter validation generic where possible; domain-specific parsing belongs in the feature or adapter.

Feature execution should assume the core has already selected an enabled feature, matched capability metadata, validated structured command parameters, and applied confirmation policy. Feature code may still throw if its own responsibility cannot be completed; runtime-facing boundaries map final failures into graceful assistant responses.

Tests for a new feature should cover:

- The feature capability metadata.
- Valid command execution.
- Feature-local failure cases.
- Assistant-level validation for malformed structured commands when the feature introduces new parameter shapes.
- Confirmation behavior when the capability is risky or configured to require confirmation.

## Initial Features

The initial deterministic features should be:

### Calendar

Mock capability for searching known fixture events.

Example command:

```text
Hey Jarvis, can you check my calendar for the date of the upcoming wedding please?
```

Expected behavior:

```text
Search mock calendar events and return the matching date.
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

Local or in-memory capability for creating and listing alarms.

Example command:

```text
Hey Jarvis, set an alarm to ping me in 10 minutes.
```

Expected behavior:

```text
Create a deterministic alarm record only after confirmation policy allows execution.
```

## Feature Registration

Features should be registered through runtime composition or a feature registry. The core should not import individual concrete feature implementations unless those implementations are part of the core feature layer.

Configuration should determine which features are enabled.
