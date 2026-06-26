# Personal AI

Personal AI is planned as a voice-activated assistant that runs on a desktop first and can later be deployed to a Raspberry Pi. The project will use a ports-and-adapters architecture so providers, voice components, feature integrations, and runtimes can be swapped without rewriting the assistant core.

The first implementation should be deterministic: mock AI, mock voice, and mock feature adapters before any external API integrations are introduced.

Failure handling follows a human-facing boundary rule: low-level modules may throw, but runtimes should catch final unhandled errors, log diagnostic detail, and return or speak a graceful response whenever possible. Voice interactions should prefer a safe fallback response over silence.

## Documentation

The docs in `docs/` are the source of truth for implementation decisions:

- [Product Vision](docs/01-product-vision.md)
- [Architecture](docs/02-architecture.md)
- [Boundaries and Rules](docs/03-boundaries-and-rules.md)
- [Runtime Plan](docs/04-runtime-plan.md)
- [Feature Plugin Model](docs/05-feature-plugin-model.md)
- [Implementation Roadmap](docs/06-implementation-roadmap.md)

## Current Status

This repository has the deterministic Milestone 1 assistant foundation: TypeScript tooling, architecture checks, a text CLI runtime, deterministic intent interpretation, mock calendar and messaging features, and local in-memory alarm storage behind an adapter-owned port implementation.

## Development

Install dependencies:

```bash
npm install
```

The repository uses native Git hooks from `.githooks/`. Configure them with:

```bash
git config core.hooksPath .githooks
```

Useful scripts:

- `npm test` - run Vitest.
- `npm run build` - compile the production JavaScript output.
- `npm run cli -- ask "..."` - run the deterministic text CLI in development.
- `npm run lint` - run ESLint.
- `npm run format:check` - check Prettier formatting.
- `npm run knip` - check for unused files, exports, and dependencies.
- `npm run architecture:check` - enforce dependency boundaries.
- `npm run typecheck` - run TypeScript without emitting files.
- `npm run check` - run the full validation suite.

## Test Support

Shared test utilities live in `src/test-support/` and are layered by responsibility:

- `core-assistant.ts` - assistant config, clock, command, interpreter, and feature builders for core pipeline tests.
- `feature-contract.ts` - feature command/context builders plus helpers for capability metadata, handling, execution, and rejection expectations.
- `deterministic-scenarios.ts` - named deterministic command, config, response, and runtime-failure fixtures.
- `cli.ts` - runtime-boundary helpers for captured stdout/stderr, temporary config files, and deterministic `ask` invocations.

Prefer these helpers for new tests when they remove setup duplication, but keep behavior-specific assertions visible in the test that owns them.
