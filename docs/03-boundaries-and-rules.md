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

Human-facing boundaries must normalize failures into graceful outcomes. CLI, voice, desktop, and Raspberry Pi runtimes should catch unhandled errors at the control-loop boundary, log the real error details, and return or speak a safe assistant response whenever possible. Application errors may preserve diagnostic causes and internal messages, but feature failure responses must not echo provider, adapter, credential, or stack details to the user.

The safe fallback response and diagnostic logging policy should live in a shared runtimes-owned helper so CLI, voice, desktop, and service boundaries do not drift.

The assistant core exposes a public response-only path for simple callers and a diagnostic-aware outcome path for runtimes. Runtimes should use the diagnostic-aware path when available, log preserved application diagnostics internally, including available causes or stacks, and print or speak only the safe assistant response.

Voice response is a best-effort invariant: an exception in command handling should not leave the human with silence if the runtime can still produce a fallback response. If text-to-speech or audio output also fails, the runtime should fall back to text/log output and keep enough diagnostics for debugging.

Voice runtimes should keep spoken output semantics separate from text fallback output. CLI callers should depend on explicit runtime result metadata when deciding whether stdout already received fallback text.

Voice adapter selection must be explicit at runtime composition boundaries. A voice runtime may use mock adapters, but it should select them through configured adapter IDs for input, wake word, speech-to-text, text-to-speech, and audio output rather than by constructing implicit defaults.

## Allowed Responsibilities

### Core

- Assistant orchestration.
- Conversation/session state.
- Intent routing.
- Command validation.
- Confirmation policy.
- Response shaping.
- Normalizing expected feature failures into assistant responses while preserving diagnostics for runtime boundaries.

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
- `ESLint` for code quality, TypeScript safety, test rules, import hygiene, and fast local boundary feedback.
- `Prettier` for formatting.
- `Vitest` for tests.
- `Knip` for unused files, exports, and dependencies.
- `sort-package-json` for deterministic `package.json` ordering.
- `markdownlint-cli2` and `cspell` for documentation hygiene.
- `secretlint` for secret scanning.
- `jscpd` for relaxed duplication detection.
- `commitlint` for readable conventional commit history.

Expected scripts:

```json
{
  "scripts": {
    "architecture:check": "depcruise src --config .dependency-cruiser.cjs",
    "architecture:graph": "depcruise src --config .dependency-cruiser.cjs --output-type dot",
    "check": "npm run lint && npm run format:check && npm run package:sort:check && npm run docs:lint && npm run spellcheck && npm run secrets:check && npm run knip && npm run duplicates && npm run architecture:check && npm run bin:check && npm run test:run && npm run typecheck",
    "docs:lint": "markdownlint-cli2 \"**/*.md\"",
    "duplicates": "jscpd src test",
    "lint": "eslint .",
    "package:sort:check": "sort-package-json --check",
    "secrets:check": "secretlint \"**/*\"",
    "spellcheck": "cspell .",
    "test": "vitest",
    "test:coverage": "vitest --run --coverage",
    "test:run": "vitest --run"
  }
}
```

The exact scripts can change during implementation, but there must be an automated architecture check before real provider adapters are introduced. Dependency-cruiser remains the authority for architecture graph rules; ESLint restricted imports are a faster feedback layer for common mistakes while editing.

Because the repository is currently local-only, the pre-commit hook intentionally runs staged formatting/lint fixes followed by parallel package sorting, secret scanning, Knip, architecture, tests, typecheck, and binary checks. Once a remote exists, pre-push should be treated as the full repository confidence gate through `npm run check`.

## Dependency-Cruiser Rules

The dependency rules enforce:

- No `src/core/**` imports from `src/adapters/**`.
- No `src/core/**` imports from `src/runtimes/**`.
- No `src/features/**` imports from `src/core/**`, `src/adapters/**`, or `src/runtimes/**`.
- No `src/adapters/**` imports from `src/core/**`, `src/features/**`, or `src/runtimes/**`.
- No `src/ports/**` imports from implementation modules.
- No circular dependencies.
