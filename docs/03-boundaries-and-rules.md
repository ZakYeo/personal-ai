# Boundaries and Rules

## Purpose

This document defines the modularity rules for the repository. These rules should eventually be enforced with dependency graph tooling, not just code review.

## Development Process

Implementation work should be broken into thin, committable TDD slices. Each slice starts with a focused failing test or test update, implements the smallest change that passes, updates matching documentation, and lands as one singular commit.

## Harness Design Rules

Each architectural layer should have a matching test-support layer, and tests should exercise the narrowest public boundary that proves the behavior.

- Neutral test primitives should live in `src/test-support/primitives.ts`.
  Shared fixed dates, captured writers, temporary JSON config files, and simple
  output-line formatting belong there instead of in runtime-specific helpers.
- Core tests should use core assistant harness helpers.
- Feature tests should use feature contract helpers and decoded `request.args` by default.
- Runtime tests should use runtime harness helpers and assert runtime-level outcomes.
- CLI tests should assert captured stdout, stderr, exit codes, graceful fallback
  text, and diagnostic logging through CLI boundary helpers.
- Voice tests should assert voice-turn results, spoken output metadata, fallback output, and diagnostics.
- Adapter tests should use adapter contract helpers for provider `fetch`
  responses, command-process scripts, voice adapter fixtures, and other
  repeated adapter-boundary setup before real provider or device adapters add
  broad local fixtures.
- Scenario fixtures should stay separate from runtime composition helpers.
- Deterministic runtime fixtures should own reusable clocks, config shapes, voice config, and runtime-failure fixtures.
- Runtime composition helpers should compose configured text runtimes and focused
  config overrides without duplicating production wiring in each test.
- Tests should prefer one-change config variant helpers, such as overriding one
  adapter ID or omitting one required config key, over inline broad object
  spreads when the behavior under test is a single config change.
- Shared setup that crosses ports, adapters, runtimes, or features should move into a focused `src/test-support/` helper before it spreads across multiple tests.
- When a runtime introduces config shape or adapter composition fixtures, create a matching focused `src/test-support/<runtime>.ts` helper before broad CLI or service tests accumulate reusable builders.
- Test-support helpers should compose dependencies and remove setup noise without hiding the behavior under test.
- Do not collapse test support into one global harness; keep helpers layered by core, feature contract, deterministic scenario, CLI, voice runtime, adapter contract, service runtime, and similar responsibilities.
- Production code must not import from `src/test-support/`.
- New feature, adapter, or runtime slices should usually touch one production module, one matching test file, one focused harness file if needed, and the relevant docs.

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

The assistant core exposes a public response-only path for simple callers and a diagnostic-aware outcome path for runtimes. Runtimes should use the diagnostic-aware path when available, log preserved application diagnostics internally, including available causes or stacks, and print or speak only the safe assistant response. The diagnostic-aware outcome uses the public assistant diagnostic contract from the ports layer; runtime-owned human-boundary helpers must not import private core error implementation types.

Voice response is a best-effort invariant: an exception in command handling should not leave the human with silence if the runtime can still produce a fallback response. If text-to-speech or audio output also fails, the runtime should fall back to text/log output and keep enough diagnostics for debugging.

Voice runtimes should keep spoken output semantics separate from text fallback output. CLI callers should depend on explicit runtime result metadata when deciding whether stdout already received fallback text.

Voice adapter selection must be explicit at runtime composition boundaries. A voice runtime may use mock adapters, but it should select them through configured adapter IDs for input, wake word, speech-to-text, text-to-speech, and audio output rather than by constructing implicit defaults.

Desktop voice command settings are runtime configuration, not core behavior.
Machine-specific command names, arguments, and timeouts belong in local config
under the desktop voice settings and should not be hard-coded into the assistant
core or checked-in deterministic default config.

## Safety Defaults

Capability safety should fail closed. A capability marked `risk: "high"` should
require confirmation by default unless the documentation, capability metadata,
and tests all make a narrower exception explicit. Runtime configuration may add
confirmation requirements for lower-risk or environment-specific cases, but it
should not silently downgrade the default safety posture of high-risk
capabilities.

Development or test fixtures may exercise an unconfirmed high-risk path only
when the fixture name and test expectation make that override obvious. Production
or user-facing default configuration should not depend on remembering to list
every high-risk capability in `confirmationRequiredCapabilities`.

## Shared Runtime Ownership

When two runtimes share a control-loop behavior, result shape, fallback policy,
or diagnostic contract, that behavior belongs in a neutral runtime-owned module.
Do not make one runtime import shared orchestration from another runtime's
environment-specific module, such as desktop voice importing the generic voice
turn loop from a mock voice runtime module.

Runtime-specific files should primarily compose dependencies, load or validate
environment-specific configuration, and expose the runtime entry point. Shared
loop semantics should have names that describe the shared concept, not the first
runtime that happened to need them.

## Canonical Selection Policy

Configuration-driven selection logic should have one canonical implementation
per policy. Adapter ID lookup, missing-config errors, and unregistered-adapter
errors are runtime composition policy, not incidental helper code to duplicate
inside every registry. When a new adapter family repeats the same selection
shape, extract the selector before adding more branches.

Selection registries should represent their domain shape directly. Prefer
explicit nested registries, such as provider-to-adapter or feature-to-adapter
maps, over encoded string keys that must be filtered, sliced, or parsed before
selection. If the selection relationship is data, model it as data instead of
recovering it from naming conventions.
Feature adapter registries should be explicit per-feature maps. Runtime
composition should pass adapter factories narrow dependency/context objects
instead of broad loaded runtime config so real feature integrations can add
credentials or adapter-specific settings without spreading selection policy.

The same rule applies to safety policy, fallback policy, and config resolution:
centralize the policy where drift would create inconsistent user-facing or
operator-facing behavior.

## Resolved Runtime Configuration

Broad application config may represent optional sections because different
runtimes need different settings. Runtime composition should narrow that broad
config into a resolved runtime-specific type before constructing adapters or
starting loops.

For example, a text runtime may ignore missing voice config, but a voice runtime
should resolve and validate a config shape where input, wake word,
speech-to-text, text-to-speech, and audio output adapter IDs are present. A
desktop voice runtime should similarly resolve command settings for the selected
command-based adapters. Avoid carrying deeply optional config through code that
requires those values; make the runtime boundary prove the invariant once.

Raw config parsing and runtime-specific config resolution should have separate
ownership. Parsing should validate external JSON shape and primitive field
types from `unknown`. Resolvers should own runtime-required invariants such as
selected provider options, required adapter IDs, command settings, and missing
or unknown selection errors. Avoid proving the same invariant in both the parser
and a resolver unless the duplicate check is deliberately tested and documented.

## Implementation Conventions

Code that touches the outside world should keep that outside world at the
boundary. Runtime composition may read process state, clocks, IO streams, and
network clients, but core, feature, and adapter logic should usually receive
those dependencies through ports, options, or narrow request objects. Avoid
direct `process.env`, `globalThis.fetch`, `new Date()`, stdout, or stderr access
outside approved runtime or composition seams.

External data should be parsed from `unknown` and validated before it becomes an
application type. Config files, provider responses, command output, and other
untrusted shapes should use field-by-field checks instead of broad type
assertions such as casting parsed JSON directly to a runtime config or assistant
command.

Runtime-specific invariants should be resolved once through named helpers before
construction proceeds. When a runtime requires a complete voice config,
provider config, command config, or adapter ID set, expose a focused resolver
that proves the shape instead of spreading optional checks through loops,
registries, or adapters.

Runtime factories that compose other runtimes or assistant factories must carry
injected dependencies through the whole composition chain. If a top-level
boundary accepts an environment map, clock, IO streams, process state, network
client, or shutdown hook, nested runtime creation should receive those same
dependencies instead of falling back to `process.env`, `globalThis.fetch`,
`new Date()`, or process streams.

Command-based adapters should preserve diagnostics for every final failure
mode. Non-zero exits, spawn failures where available, and timeouts should keep
captured stdout/stderr internally so human-facing boundaries can log useful
operator diagnostics while returning safe fallback text.

Provider adapters should follow the same boundary discipline. Every real
provider adapter must be opt-in through runtime configuration, receive network
clients and environment credentials through injection, read credentials from
environment variables instead of repository config files, validate provider
responses from `unknown`, and preserve useful status, body, transport, timeout,
and parsing diagnostics internally. Tests for provider adapters should use the
shared `src/test-support/adapter-contract.ts` helpers for credential
environments, non-OK responses, malformed JSON, transport failures, and timeout
behavior instead of live network calls. Live provider smoke tests may exist only
as explicit opt-in E2E commands; they must stay out of the default validation
gate, keep credentials in environment variables, and avoid checking API key
values into code or docs.

Tests should prefer focused harness and one-change fixture helpers over broad
inline object spreads. When a test changes one adapter ID, provider ID, missing
config key, clock, or IO behavior, use or add a helper that makes that single
change obvious.

Selection policy should stay canonical. Before adding another branch or registry
for provider, feature, adapter, missing-config, or unknown-ID handling, search
for the existing selector or extract one shared helper that owns the policy.

## Maintainability Review Themes

The architecture checks catch dependency direction, but future code reviews
should also guard against subtler boundary and abstraction drift.

- Keep broad loaded configuration at runtime composition boundaries. Core,
  features, and adapters should receive the narrowest validated shape they need,
  not the full application config object when only a small policy subset is
  relevant.
- Treat assistant diagnostics as a public boundary contract when runtimes need
  to log them. Runtime-owned human-boundary helpers should not depend on private
  core implementation details when a stable diagnostic outcome type would
  preserve the same behavior.
- Extract canonical selection helpers before adding another copy of provider,
  feature, or adapter lookup logic. Missing config, unknown IDs, and
  unregistered adapter errors should be owned once per policy family.
- Model adapter registries directly instead of encoding feature, provider, or
  adapter identity into strings that later need parsing.
- Keep provider adapters from becoming catch-all modules. HTTP transport,
  request construction, provider response extraction, provider-output parsing,
  and application type validation should split once a real adapter starts to
  mix those responsibilities.
- When two runtimes differ only by adapter construction, prefer a neutral
  runtime factory over copy-pasted runtime shells. Runtime-specific files should
  stay mostly declarative composition.
- Nested runtime factories should preserve dependency injection all the way down
  the composition stack, especially for provider environment and network
  dependencies.
- Shared user-facing matching semantics, such as wake phrase normalization,
  should live in one helper per adapter family so mock and real runtimes do not
  drift.
- Deterministic interpreters and fixtures should not grow into a central list of
  feature-specific branches. When matching rules grow, prefer data-backed
  deterministic rules or feature-local fixtures that keep routing tied to
  declared capability metadata.
- Treat duplication reports as design prompts. A small clone may be acceptable,
  but repeated control-flow or policy duplication should trigger a search for
  the canonical owner before more branches are added.

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

The pre-commit hook runs staged formatting/lint fixes followed by lightweight
repository checks: package sorting, Markdown linting, and secret scanning. The
pre-push hook is the full repository confidence gate through `npm run check`,
including linting, formatting, package sorting, Markdown linting, spellcheck,
secret scanning, Knip, duplication checks, architecture checks, binary checks,
tests, and typecheck.

## Dependency-Cruiser Rules

The dependency rules enforce:

- No `src/core/**` imports from `src/adapters/**`.
- No `src/core/**` imports from `src/runtimes/**`.
- No `src/features/**` imports from `src/core/**`, `src/adapters/**`, or `src/runtimes/**`.
- No `src/adapters/**` imports from `src/core/**`, `src/features/**`, or `src/runtimes/**`.
- No `src/ports/**` imports from implementation modules.
- No circular dependencies.

## Documentation Maintenance

Keep `README.md`, `AGENTS.md`, and every file in `docs/` consistent with the codebase. Changes to boundaries, failure handling, tooling, hooks, or workflow should update these documents in the same thin TDD slice as the implementation.
