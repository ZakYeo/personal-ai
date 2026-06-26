# Personal AI

Personal AI is planned as a voice-activated assistant that runs on a desktop first and can later be deployed to a Raspberry Pi. The project will use a ports-and-adapters architecture so providers, voice components, feature integrations, and runtimes can be swapped without rewriting the assistant core.

The first implementation should be deterministic: mock AI, mock voice, and mock feature adapters before any external API integrations are introduced.

Failure handling follows a human-facing boundary rule: low-level modules may throw, but runtimes should catch final unhandled errors, log diagnostic detail, and return or speak a graceful response whenever possible. Feature failures preserve diagnostic causes through the assistant's diagnostic-aware outcome path while returning safe public text. Voice interactions should prefer a safe fallback response over silence.
CLI and voice runtimes share the same runtime-boundary helper for fallback
responses and internal diagnostic logging.

## Documentation

The docs in `docs/` are the source of truth for implementation decisions:

- [Product Vision](docs/01-product-vision.md)
- [Architecture](docs/02-architecture.md)
- [Boundaries and Rules](docs/03-boundaries-and-rules.md)
- [Runtime Plan](docs/04-runtime-plan.md)
- [Feature Plugin Model](docs/05-feature-plugin-model.md)
- [Implementation Roadmap](docs/06-implementation-roadmap.md)

Keep `README.md`, `AGENTS.md`, and every document in `docs/` updated with the codebase. Any change to behavior, architecture, tooling, or workflow should include the matching documentation change in the same thin slice.

## Current Status

This repository has the deterministic assistant foundation and mock voice loop:
TypeScript tooling, architecture checks, a text CLI runtime, config-driven
deterministic intent and feature adapter composition, mock calendar and
messaging features, local in-memory alarm storage behind an adapter-owned port
implementation, voice ports, mock voice adapters, and a simulated one-turn voice
CLI.

Voice runtime composition is config-driven: `voice-once` requires configured
voice adapter IDs for input, wake word, speech-to-text, text-to-speech, and
audio output. The default config uses the mock adapters for each slot.
Simulated speech is kept separate from CLI fallback text output; the CLI prints
text from explicit voice runtime result metadata instead of audio adapter write
side effects.

Feature plugins are authored with `defineFeature` and `defineCapability` so handler `request.args` types are derived from declared capability parameter metadata.

## Development

Work should be broken into thin, committable slices using TDD. For each slice,
write or update the focused failing test first, implement the smallest code and
documentation change that makes it pass, then commit that singular slice before
starting the next one.

Install dependencies:

```bash
npm install
```

The repository uses native Git hooks from `.githooks/`. Configure them with:

```bash
git config core.hooksPath .githooks
```

The repository is local-only for now, so the pre-commit hook intentionally runs
more than a typical staged-file check: staged formatting/lint fixes first, then
parallel package sorting, secret scanning, Knip, architecture, tests, typecheck,
and binary checks. Once there is a remote to push to, pre-push is the full
repository confidence gate through `npm run check`.

Useful scripts:

- `npm run architecture:check` - enforce dependency boundaries.
- `npm run bin:check` - compile and verify the published CLI bin points at runnable output.
- `npm test` - run Vitest.
- `npm run test:run` - run Vitest once without watch mode.
- `npm run test:coverage` - run Vitest once with V8 coverage thresholds.
- `npm run build` - compile the production JavaScript output.
- `npm run cli -- ask "..."` - run the deterministic text CLI in development.
- `npm run cli -- voice-once --utterance "..."` - run one simulated mock voice turn.
- `npm run lint` - run ESLint.
- `npm run format:check` - check Prettier formatting.
- `npm run package:sort:check` - check deterministic `package.json` ordering.
- `npm run docs:lint` - lint Markdown documentation.
- `npm run spellcheck` - run CSpell over the repository.
- `npm run secrets:check` - scan tracked content for likely secrets.
- `npm run knip` - check for unused files, exports, and dependencies.
- `npm run duplicates` - check for copy/paste duplication in `src` and `test`.
- `npm run typecheck` - run TypeScript without emitting files.
- `npm run check` - run the full validation suite.

Coverage is available through `npm run test:coverage`, but it is not part of
`npm run check` yet. Keep thresholds modest until the baseline has had time to
settle.

## Test Support

Shared test utilities live in `src/test-support/` and are layered by responsibility:

- `core-assistant.ts` - assistant config, clock, command, interpreter, and decoded-args feature builders for core pipeline tests.
- `feature-contract.ts` - feature command/context builders plus helpers for capability metadata, handling, execution, and rejection expectations.
- `deterministic-scenarios.ts` - named deterministic command, config, response, and runtime-failure fixtures.
- `cli.ts` - runtime-boundary helpers for captured stdout/stderr, temporary config files, and deterministic `ask` invocations.

Each production layer should have a matching test-support layer, and tests
should exercise the narrowest public boundary that proves the behavior. Prefer
these helpers for new tests when they remove setup duplication, but keep
behavior-specific assertions visible in the test that owns them. Add focused
harness helpers before repeated setup spreads across tests, especially for
cross-layer runtime, voice, service, adapter, or feature composition. Keep
scenario data separate from runtime composition helpers whenever possible.

Feature fixtures should exercise decoded `request.args` by default; use raw
plugin fixtures only for tests that intentionally cover malformed or lower-level
feature contracts. Production code must not import from `src/test-support/`, and
test support should stay layered instead of becoming one global harness.
