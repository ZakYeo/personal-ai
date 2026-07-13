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

The assistant core exposes a public response-only path for simple callers and a diagnostic-aware outcome path for runtimes. Runtimes should use the diagnostic-aware path when available, log every preserved application diagnostic category internally, including available causes or stacks, and print or speak only the safe assistant response. This includes feature, conversation, and response-rewriter failures. The diagnostic-aware outcome uses the public assistant diagnostic contract from the ports layer; runtime-owned human-boundary helpers must not import private core error implementation types.

Voice response is a best-effort invariant: an exception in command handling should not leave the human with silence if the runtime can still produce a fallback response. If text-to-speech or audio output also fails, the runtime should fall back to text/log output and keep enough diagnostics for debugging.

Voice runtimes should keep spoken output semantics separate from text fallback output. CLI callers should depend on explicit runtime result metadata when deciding whether stdout already received fallback text.

Voice adapter selection must be explicit at runtime composition boundaries. A voice runtime may use mock adapters, but it should select them through configured adapter IDs for input, wake word, speech-to-text, text-to-speech, and audio output rather than by constructing implicit defaults.
Streaming provider slots must keep provider config types inside their registry
entries. Neutral desktop voice topology resolves an entry and captures its
typed config/constructor; adding a provider must not widen a shared
provider-specific union or add adapter-ID branches to aggregate composition.
Follow-up listening is neutral voice runtime behavior. A voice runtime may
capture a no-wake reply only when the assistant response explicitly sets
`expectsFollowUp: true`, and it should return to normal wake listening once a
response does not request another follow-up or the runtime-owned maximum
follow-up count is reached.

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
Capability summaries and descriptions are part of the declared metadata.
Provider prompts and user-facing capability list/detail answers should use the
generated enabled capability catalog instead of hard-coded feature lists.

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
The selected adapter's resolved config should be typed at the same boundary as
the selected adapter factory. Do not pass `unknown` adapter config through a
generic feature context and recover the real shape with casts inside factories.
Feature registry entries parse their selected raw section once, capture that
typed value for construction and startup preflight, and expose only neutral
resolved operations to later runtime composition. Provider fields must not
accumulate on the common parsed feature type.
Parsed feature config is a discriminated enabled/disabled union: enabled entries
always carry a selected adapter ID and resolved adapter. Runtime construction
also verifies that the adapter-created plugin ID matches the configured feature
key so confirmation and capability policy cannot silently attach to another ID.
Desktop streaming provider entries follow the same boundary: they parse their
selected raw desktop section and capture provider-specific construction and test
dependencies. Common desktop config retains command settings and neutral
resolved factories, not OpenAI fields or transport types.
Resolved voice config encodes streaming capture/transcription and
synthesis/playback adapter IDs as complete pairs; half-configured raw IDs fail
at the voice resolver before adapter selection.
Intent, conversation, and response-rewriter provider entries also parse their
selected raw provider section and capture typed construction at config load
time. Central operation config must not accumulate provider-specific optional
fields or discriminated provider unions; conversation history remains a common
central field. Each operation parser accepts `unknown` and owns its section and
provider validation rather than relying on operation-specific branches in the
aggregate config parser.
Deterministic and disabled providers use explicit configless registry entries,
so their factories receive only construction context and do not emulate config
parsing with `void` values.
If adapter config differs by adapter ID, model that relationship in a resolved
discriminated type or in the registry entry itself. Loaded runtime config should
not retain raw adapter config bags for later hidden reparsing; selected adapter
sections should become typed config before adapter construction.

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
types from `unknown` and produce typed selected adapter/provider sub-config
instead of retaining raw JSON bags. Resolvers should own runtime-required
invariants such as required adapter IDs, command settings, and missing or
unknown selection errors. Avoid proving the same invariant in both the parser
and a resolver unless the duplicate check is deliberately tested and
documented.

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
Clock dependencies should represent a clock, not a construction-time timestamp,
for any runtime or assistant that can live beyond a single deterministic test
call. Prefer injecting `now: () => Date` or a `ClockPort` through composition.
Use a fixed `Date` only inside test helpers that intentionally freeze time.

Command-based adapters should preserve diagnostics for every final failure
mode. Non-zero exits, spawn failures where available, and timeouts should keep
captured stdout/stderr internally so human-facing boundaries can log useful
operator diagnostics while returning safe fallback text.
Timeout, abort, and cleanup must track process close separately from the public
command result. Aborts use a diagnostic-bearing command error that retains the
abort reason and final stdout/stderr. Termination waits for child exit and escalates from `SIGTERM` to
`SIGKILL` after a bounded grace period so child or process-group resources do
not outlive runtime cleanup; final captured output remains on the diagnostic
error. A cleanup failure is attached to the primary timeout, abort, or stream
failure instead of replacing it. Failed process-group signals fall back to direct-child signals, and the
post-`SIGKILL` close wait is also bounded so cleanup cannot wait forever.
Streaming command input awaits writable callbacks before requesting the next
chunk. Writable errors, including early pipe closure, settle through the same
command lifecycle and retain final stdout/stderr diagnostics. Once the command
lifecycle has classified a timeout, abort, spawn, or exit failure, stream
wrappers preserve that primary error type instead of reclassifying it as input.

Assistant diagnostic emission is an exhaustive policy over the public
`AssistantDiagnosticCategory` contract. Internal feature, conversation,
response-rewriter, and unexpected failures emit diagnostics even when the
thrown JavaScript value does not provide a usable cause; expected validation,
confirmation, and unsupported outcomes do not.

Provider adapters should follow the same boundary discipline. Every real
provider adapter must be opt-in through runtime configuration, receive network
clients and environment credentials through injection, read credentials from
environment variables instead of repository config files, validate provider
responses from `unknown`, and preserve useful status, body, transport, timeout,
and parsing diagnostics internally. Adapter parsers should use the shared
adapter parsing primitives for repeated structural checks such as plain record
detection. Tests for provider adapters should use the
shared `src/test-support/adapter-contract.ts` helpers for credential
environments, non-OK responses, malformed JSON, transport failures, and timeout
behavior instead of live network calls. Live provider smoke tests may exist only
as explicit opt-in E2E commands; they must stay out of the default validation
gate, keep credentials in environment variables, and avoid checking API key
values into code or docs.

Configuration shared by several operations of one provider should have one
provider-local type and one runtime-owned external-data parser. Callers may
supply their config path so validation remains precise without duplicating the
same field checks across intent, conversation, and rewriting concerns.
When those operations use the same provider endpoint and transport policy, one
adapter-local client should own credentials, request setup, timeout, HTTP, and
JSON parsing behavior. It should accept an operation label and concrete error
factory so diagnostics remain operation-specific without copying transport.
OpenAI HTTP and voice adapters also share API-key resolution and endpoint URL
construction even where their request transports differ.
OpenAI structured-output operations share the JSON decoding boundary and inject
operation-specific errors; intent, conversation, and rewriting retain their own
field-by-field schema validation.

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
- Do not wrap already-required loaded config fields in identity-only
  `require*Config` helpers; focused resolvers should exist only when they prove
  an additional invariant or narrow an optional external shape.
- Treat assistant diagnostics as a public boundary contract when runtimes need
  to log them. Runtime-owned human-boundary helpers should not depend on private
  core implementation details when a stable diagnostic outcome type would
  preserve the same behavior.
- Extract canonical selection helpers before adding another copy of provider,
  feature, or adapter lookup logic. Missing config, unknown IDs, and
  unregistered adapter errors should be owned once per policy family.
- Model adapter registries directly instead of encoding feature, provider, or
  adapter identity into strings that later need parsing.
- Keep selected adapter config tied to the selected adapter factory. Avoid
  `unknown` adapter config bags and downstream casts when a typed resolver or
  registry-local config parser can prove the shape once.
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
- Runtime clock injection should remain live across long-running processes.
  Avoid converting an injectable clock into a one-time `Date` snapshot during
  nested runtime or assistant construction.
- Shared user-facing matching semantics, such as wake phrase normalization,
  should live in one helper per adapter family so mock and real runtimes do not
  drift.
- Deterministic interpreters and fixtures should not grow into a central list of
  feature-specific branches. When matching rules grow, prefer data-backed
  deterministic rules or feature-local fixtures keyed by capability name.
  Deterministic matcher functions should stay separate from provider-facing
  capability metadata so provider catalogs expose only stable capability
  descriptions, parameters, and risk.
- Cleanup and best-effort resource release should not silently change runtime
  control-flow semantics. When shared runtimes treat cleanup failure as logged
  diagnostics, environment-specific runtimes should use the same policy unless
  a tested lifecycle requirement says cleanup failure must fail the turn.
- Command-process failure wrappers should preserve available stdout and stderr
  for all final failure modes, including spawn errors, non-zero exits, and
  timeouts. A raw process error is not enough if output was captured.
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
    "test:file": "vitest --run",
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
