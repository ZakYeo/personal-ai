# Repository Notes

- This repository is currently local-only. There is no remote configured and nothing should be pushed anywhere yet.
- Commit using the personal Git identity from `/home/zak/personal/.gitconfig-personal`.
- Do not use work Git credentials for commits in this repository.
- Treat the files in `docs/` as the implementation source of truth:
  - `docs/01-product-vision.md`
  - `docs/02-architecture.md`
  - `docs/03-boundaries-and-rules.md`
  - `docs/04-runtime-plan.md`
  - `docs/05-feature-plugin-model.md`
  - `docs/06-implementation-roadmap.md`
- Keep implementation changes aligned with the ports-and-adapters architecture and dependency boundaries documented there.

## Development Scripts

- `npm test` - run Vitest.
- `npm run lint` - run ESLint.
- `npm run format:check` - check Prettier formatting.
- `npm run knip` - check for unused files, exports, and dependencies.
- `npm run architecture:check` - enforce dependency boundaries.
- `npm run typecheck` - run TypeScript without emitting files.
- `npm run check` - run the full validation suite.
