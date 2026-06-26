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
- Follow the failure-handling rule documented in `docs/03-boundaries-and-rules.md` and `docs/04-runtime-plan.md`: low-level code may throw, but human-facing runtime boundaries must catch final failures, log useful diagnostics, and produce a graceful CLI/voice/service response whenever possible. Feature failure responses must preserve diagnostics internally without echoing raw provider, adapter, credential, or stack details to the user.

## Testing Expectations

- Always add or update tests for implementation changes.
- Add integration tests when a change spans multiple parts of the system, such as multiple adapters, ports, application services, runtime boundaries, feature plugins, or CLI/service flows.
- Use the layered helpers in `src/test-support/` when they fit:
  - `core-assistant.ts` for core assistant config, clocks, commands, interpreters, and feature fixtures.
  - `feature-contract.ts` for feature command/context builders, metadata, handling, execution, and rejection expectations.
  - `deterministic-scenarios.ts` for named deterministic command/config/response fixtures.
  - `cli.ts` for CLI runtime-boundary tests with captured IO, temporary config files, and deterministic `ask` invocations.
- Keep runtime-boundary tests human-facing: assert captured stdout/stderr, exit codes, and graceful failure responses rather than bypassing the CLI boundary.
- Do not collapse test support into one global harness; keep helpers layered by core, feature, deterministic scenario, and runtime/CLI responsibility.

## Development Scripts

- `npm test` - run Vitest.
- `npm run build` - compile the production JavaScript output.
- `npm run cli -- ask "..."` - run the deterministic text CLI in development.
- `npm run lint` - run ESLint.
- `npm run format:check` - check Prettier formatting.
- `npm run knip` - check for unused files, exports, and dependencies.
- `npm run architecture:check` - enforce dependency boundaries.
- `npm run typecheck` - run TypeScript without emitting files.
- `npm run check` - run the full validation suite.
