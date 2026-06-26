# Personal AI

Personal AI is planned as a voice-activated assistant that runs on a desktop first and can later be deployed to a Raspberry Pi. The project will use a ports-and-adapters architecture so providers, voice components, feature integrations, and runtimes can be swapped without rewriting the assistant core.

The first implementation should be deterministic: mock AI, mock voice, and mock feature adapters before any external API integrations are introduced.

## Documentation

The docs in `docs/` are the source of truth for implementation decisions:

- [Product Vision](docs/01-product-vision.md)
- [Architecture](docs/02-architecture.md)
- [Boundaries and Rules](docs/03-boundaries-and-rules.md)
- [Runtime Plan](docs/04-runtime-plan.md)
- [Feature Plugin Model](docs/05-feature-plugin-model.md)
- [Implementation Roadmap](docs/06-implementation-roadmap.md)

## Current Status

This repository has TypeScript project boilerplate and architecture/tooling checks.
No assistant product behavior has been implemented yet.

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
- `npm run lint` - run ESLint.
- `npm run format:check` - check Prettier formatting.
- `npm run knip` - check for unused files, exports, and dependencies.
- `npm run architecture:check` - enforce dependency boundaries.
- `npm run typecheck` - run TypeScript without emitting files.
- `npm run check` - run the full validation suite.
