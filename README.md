# Personal AI

Local-first personal assistant built with TypeScript, deterministic adapters, and
a ports-and-adapters architecture.

Personal AI is intended to become a private, voice-activated assistant that runs
on a desktop first and can later be deployed to a Raspberry Pi. The current
implementation keeps behavior deterministic with mock providers and local
adapters so the core, runtimes, features, and dependency boundaries can be tested
without external services.

## Status

Implemented today:

- Deterministic text CLI runtime.
- Mock voice loop for one simulated voice turn.
- Desktop voice runtime for one configured local voice turn.
- Config-driven adapter selection for intent, features, and voice components.
- Mock calendar and messaging features.
- Local alarm feature backed by an adapter-owned store.
- Runtime fallback handling that keeps human-facing responses safe while logging
  diagnostics internally.
- Architecture, linting, formatting, spellcheck, secret scanning, duplication,
  unused-code, typecheck, test, and binary validation scripts.

See the [implementation roadmap](docs/06-implementation-roadmap.md) for
milestones, completed work, and planned provider or Raspberry Pi work.

## Requirements

- Node.js 22 or newer.
- npm 10 or newer.

Desktop voice experiments also need local audio/STT/TTS commands configured in a
local config file. See the [runtime plan](docs/04-runtime-plan.md) for the
desktop voice config shape.

## Quick Start

Install dependencies:

```bash
npm install
```

Configure the repository Git hooks:

```bash
git config core.hooksPath .githooks
```

Run the deterministic CLI:

```bash
npm run cli -- ask "Hey Jarvis, list my alarms"
```

Run one simulated voice turn:

```bash
npm run cli -- voice-once --utterance "Hey Jarvis, list my alarms"
```

Run one configured desktop voice turn:

```bash
npm run cli -- desktop-voice-once --config path/to/desktop-config.json
```

## Scripts

Common development commands:

- `npm test` - run Vitest in watch mode.
- `npm run test:run` - run Vitest once.
- `npm run test:coverage` - run Vitest once with V8 coverage thresholds.
- `npm run lint` - run ESLint.
- `npm run format:check` - check Prettier formatting.
- `npm run typecheck` - run TypeScript without emitting files.
- `npm run build` - compile production JavaScript.
- `npm run architecture:check` - enforce dependency boundaries.
- `npm run check` - run the full validation suite.

Additional hygiene scripts are available in `package.json`, including package
sorting, Markdown linting, spellcheck, secret scanning, unused-code checks,
duplication checks, and CLI binary validation.

## Documentation

The files in `docs/` are the source of truth for implementation decisions:

- [Product Vision](docs/01-product-vision.md) - goals, non-goals, and product
  principles.
- [Architecture](docs/02-architecture.md) - ports-and-adapters structure,
  modules, ports, adapters, and runtime responsibilities.
- [Boundaries and Rules](docs/03-boundaries-and-rules.md) - dependency rules,
  failure handling, safety defaults, test-support rules, and tooling policy.
- [Runtime Plan](docs/04-runtime-plan.md) - CLI, voice, desktop voice,
  configuration, lifecycle, and fallback behavior.
- [Feature Plugin Model](docs/05-feature-plugin-model.md) - feature and
  capability authoring model.
- [Implementation Roadmap](docs/06-implementation-roadmap.md) - milestones,
  acceptance criteria, and current implementation status.

## Development Workflow

This repository has a GitHub remote configured. Push normal completed slices
after the local hooks pass.

Work is delivered in thin, committable TDD slices:

1. Write or update the focused failing test first.
2. Implement the smallest code and documentation change that passes.
3. Run the relevant validation.
4. Commit the singular slice.

Use the personal Git identity from `/home/zak/personal/.gitconfig-personal` for
commits in this repository.

The pre-commit hook runs staged formatting/lint fixes plus lightweight
repository checks. The pre-push hook is the full confidence gate through
`npm run check`.

Keep `README.md`, `AGENTS.md`, and the relevant `docs/` files aligned whenever
behavior, architecture, tooling, or workflow changes.
