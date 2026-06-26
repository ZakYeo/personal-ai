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
Create a deterministic alarm record and return confirmation.
```

## Feature Registration

Features should be registered through runtime composition or a feature registry. The core should not import individual concrete feature implementations unless those implementations are part of the core feature layer.

Configuration should determine which features are enabled.
