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
- Break work into thin, committable slices using TDD: write or update the failing test first, implement the smallest change that passes it, then make that slice a singular commit before starting the next slice.
- Follow the failure-handling rule documented in `docs/03-boundaries-and-rules.md` and `docs/04-runtime-plan.md`: low-level code may throw, but human-facing runtime boundaries must catch final failures, log useful diagnostics, and produce a graceful CLI/voice/service response whenever possible. Feature failure responses must preserve diagnostics internally without echoing raw provider, adapter, credential, or stack details to the user.
- Runtime boundaries should use the assistant diagnostic-aware outcome path when they need internal diagnostics; keep `AssistantResponse` safe for humans.
- Keep shared human-boundary fallback and diagnostic policy in the runtimes-owned helper instead of duplicating it across CLI, voice, or service loops.
- Voice runtimes must compose voice input, wake word, speech-to-text, text-to-speech, and audio output through configured adapter IDs; do not construct voice adapters as implicit defaults.
- Desktop voice runtimes should use explicit local config for command-based STT/TTS and SoX input/output; keep machine-specific commands out of `config/default.json`.
- Keep simulated spoken output separate from fallback text output; CLI boundaries should use explicit voice result metadata rather than inferring stdout writes from voice status.
- Author feature capabilities with `defineCapability`/`defineFeature` so decoded handler arguments stay structurally tied to declared parameter metadata.
- Keep `README.md`, `AGENTS.md`, and every file in `docs/` updated and consistent with the codebase whenever behavior, architecture, tooling, or workflow changes.
- The repository is local-only right now, so the pre-commit hook intentionally runs more than a staged-file check. Keep it passing after implementation changes. Once there is a remote, pre-push is the full repository confidence gate through `npm run check`.

## Testing Expectations

- Development should follow TDD in thin slices: each slice starts with a focused failing test or test update, ends with passing validation for that slice, and is committed as one singular commit.
- Always add or update tests for implementation changes.
- Add integration tests when a change spans multiple parts of the system, such as multiple adapters, ports, application services, runtime boundaries, feature plugins, or CLI/service flows.
- Each production layer should have a matching test-support layer, and tests should exercise the narrowest public boundary that proves the behavior.
- Use the layered helpers in `src/test-support/` when they fit:
  - `core-assistant.ts` for core assistant config, clocks, commands, interpreters, and decoded-args feature fixtures.
  - `feature-contract.ts` for feature command/context builders, metadata, handling, decoded-args execution, and rejection expectations.
  - `deterministic-scenarios.ts` for named deterministic command/response fixtures.
  - `deterministic-runtime-fixtures.ts` for deterministic clocks, config shapes, voice config, and runtime-failure fixtures.
  - `runtime-composition.ts` for deterministic runtime composition, temporary config files, and focused invalid config overrides.
  - `cli.ts` for CLI runtime-boundary tests with captured IO, temporary config files, and deterministic `ask` invocations.
  - `voice-runtime.ts` for voice runtime dependency builders, captured fallback writers, throwing assistants, and deterministic utterances.
  - `desktop-voice-runtime.ts` for desktop voice command config builders and focused desktop runtime config variants.
- Add focused harness helpers before repeated setup spreads across tests, especially for cross-layer runtime, voice, service, adapter, or feature composition.
- When a runtime introduces config shape or adapter composition fixtures, add a matching focused `src/test-support/` helper before broad CLI or service tests accumulate reusable builders.
- Keep scenario data separate from runtime composition helpers whenever possible.
- Harness helpers should compose dependencies and remove setup noise without hiding the behavior under test.
- Keep runtime-boundary tests human-facing: assert captured stdout/stderr, exit codes, and graceful failure responses rather than bypassing the CLI boundary.
- Feature fixture handlers should use decoded `request.args` by default; use raw feature plugin fixtures only when a test explicitly covers lower-level contract behavior.
- Do not collapse test support into one global harness; keep helpers layered by core, feature contract, deterministic scenario, CLI, voice runtime, adapter contract, service runtime, and similar responsibilities.
- Production code must not import from `src/test-support/`.
- Prefer future slices whose diffs stay localized to one production module, one matching test file, one focused harness file if needed, and the relevant docs.

## Development Scripts

- `npm test` - run Vitest.
- `npm run test:run` - run Vitest once without watch mode.
- `npm run test:coverage` - run Vitest once with V8 coverage thresholds.
- `npm run build` - compile the production JavaScript output.
- `npm run cli -- ask "..."` - run the deterministic text CLI in development.
- `npm run cli -- voice-once --utterance "..."` - run one simulated mock voice turn.
- `npm run cli -- desktop-voice-once --config path/to/desktop-config.json` - run one configured desktop voice turn.
- `npm run lint` - run ESLint.
- `npm run format:check` - check Prettier formatting.
- `npm run package:sort:check` - check deterministic `package.json` ordering.
- `npm run docs:lint` - lint Markdown documentation.
- `npm run spellcheck` - run CSpell over the repository.
- `npm run secrets:check` - scan tracked content for likely secrets.
- `npm run knip` - check for unused files, exports, and dependencies.
- `npm run duplicates` - check for copy/paste duplication in `src` and `test`.
- `npm run architecture:check` - enforce dependency boundaries.
- `npm run bin:check` - compile and verify the published CLI bin points at runnable output.
- `npm run typecheck` - run TypeScript without emitting files.
- `npm run check` - run the full validation suite.
