# Boundaries and Rules

## Purpose

This document defines the modularity rules for the repository. These rules should eventually be enforced with dependency graph tooling, not just code review.

## Dependency Direction

The intended dependency direction is:

```text
runtimes -> core
runtimes -> adapters
runtimes -> features

core -> ports
core -> core

features -> ports
features -> feature-local code

adapters -> ports
adapters -> adapter-local code
```

## Hard Rules

- `core` must not import from `adapters`.
- `core` must not import from `runtimes`.
- `core` must not import provider SDKs.
- `core` must not import desktop-specific or Raspberry Pi-specific libraries.
- `features` must not import concrete provider adapters.
- `adapters` must not import from `runtimes`.
- `runtimes` are responsible for composition and dependency injection.
- Ports should be defined by the application, not by external provider SDKs.
- No circular dependencies.

## Failure Handling Rule

Low-level modules may raise or throw errors when they cannot complete their responsibility. Features, adapters, config loaders, provider clients, and other implementation details should not hide failures by pretending work succeeded.

Human-facing boundaries must normalize failures into graceful outcomes. CLI, voice, desktop, and Raspberry Pi runtimes should catch unhandled errors at the control-loop boundary, log the real error details, and return or speak a safe assistant response whenever possible.

Voice response is a best-effort invariant: an exception in command handling should not leave the human with silence if the runtime can still produce a fallback response. If text-to-speech or audio output also fails, the runtime should fall back to text/log output and keep enough diagnostics for debugging.

## Allowed Responsibilities

### Core

- Assistant orchestration.
- Conversation/session state.
- Intent routing.
- Command validation.
- Confirmation policy.
- Response shaping.
- Normalizing expected feature failures into assistant responses where practical.

### Ports

- Interfaces and application-owned contracts.
- Shared types needed to express those contracts.

### Features

- Domain-level feature behavior.
- Feature capability definitions.
- Feature command handling.
- Feature result shaping.

### Adapters

- External API calls.
- Hardware or OS-specific behavior.
- Provider SDK usage.
- Mock implementations.
- Local persistence implementations behind application-owned ports.
- Translating external data into application-owned types.

### Runtimes

- Loading configuration.
- Selecting adapters.
- Wiring dependencies.
- Starting and stopping processes.
- Handling environment-specific logging.
- Catching final unhandled errors before they cross the human interaction boundary.
- Running CLI, desktop voice, or Raspberry Pi service loops.

## Tooling

The initial implementation should include architecture enforcement tooling.

Preferred tools:

- `dependency-cruiser` for dependency graph rules.
- `ESLint` for code quality and TypeScript linting.
- `Prettier` for formatting.
- `Vitest` for tests.

Expected scripts:

```json
{
  "scripts": {
    "test": "vitest",
    "lint": "eslint .",
    "architecture:check": "depcruise src --config .dependency-cruiser.cjs",
    "architecture:graph": "depcruise src --config .dependency-cruiser.cjs --output-type dot"
  }
}
```

The exact scripts can change during implementation, but there must be an automated architecture check before real provider adapters are introduced.

## Initial Dependency-Cruiser Rules

The first dependency rules should enforce:

- No imports from `src/adapters/**` into `src/core/**`.
- No imports from `src/runtimes/**` into `src/core/**`.
- No imports from `src/runtimes/**` into `src/adapters/**`.
- No circular dependencies.

Additional rules can be added once the codebase structure exists.
