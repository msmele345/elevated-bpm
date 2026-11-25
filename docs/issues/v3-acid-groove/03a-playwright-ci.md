# EB3-03a — Playwright in CI

> Track: v3.0 · Slice 3a of 15
> Blocked by: none — can start immediately
> Blocks: EB3-03b
> Branch: `feat/acid-groove-03a-playwright-ci`
> Spec stories: 46; spec "Cross-cutting → CI" and Testing seam 6

## What to build

A browser layout harness that runs on every PR. Every phase so far was checked
by hand in a browser; this makes the layout guarantees in EB3-03b onward
enforceable. This slice only builds the harness and one smoke test — the fold
test itself is written first thing in EB3-03b.

## Scope

### In

- Playwright (Chromium only) as a dev dependency, with an `npm` script to run it
  locally against the **production build** served locally.
- A second CI job that builds the app, serves the build and runs the suite. It
  runs on the same triggers as `build-and-test` (PRs and pushes to `develop` and
  `main`).
- A small helper for seeding persisted state (IndexedDB) so later tests can reach
  a scenario directly. The suite may seed state; it never stubs app code.
- One smoke test: fresh load at 1280×720, the app renders and Play is visible.
- Vitest must not pick up the Playwright specs (and vice versa).

### Out (and where it lands)

- The fold assertion, sticky-strip and no-sideways-scroll checks — EB3-03b,
  EB3-05, EB3-06.
- Making the job a required check — a GitHub settings change (see README "Not a
  ticket").

## Acceptance criteria

- [x] `npm` script runs the Playwright suite locally against a production build —
      `npm run test:e2e` runs `tsc -b && vite build`, then Playwright, whose
      `webServer` serves `dist/` with `vite preview --strictPort` on :4173. Passed
      locally: 2 specs, 0 failures.
- [ ] A new CI job runs on every PR to `develop`/`main` and on pushes to them,
      green on this PR — job `e2e` in `.github/workflows/ci.yml` shares the
      `build-and-test` triggers. Pending a push and PR; not yet run on GitHub.
- [x] Smoke test: fresh project at 1280×720 renders with Play visible —
      `e2e/smoke.spec.ts` seeds a 137 BPM project, wipes it, loads `/`, and finds
      `getByRole('button', { name: 'Play', exact: true })` visible and the tempo
      back at its default, on the production build at the config's 1280×720
      viewport.
- [x] State-seeding helper exists and is used by at least the smoke test (wiped
      IndexedDB) — `e2e/helpers/project.ts`: `wipeProjectStorage` (smoke) and
      `seedProjectState` (`e2e/seed.spec.ts`). Writes run on a static asset before
      the app loads, so the app's own autosave cannot race them.
- [x] `npm test` (Vitest) is unaffected and still green — 50 files, 670 tests
      passing. Vitest collects no e2e file; Playwright lists only the two e2e specs.
- [ ] Failure output is useful in CI (trace or screenshot on failure uploaded as
      an artifact) — a deliberately failing probe (since deleted) wrote
      `test-failed-1.png`, `error-context.md` and `trace.zip` locally. The
      `if: failure()` upload step is in place; it is unverified until a CI run fails.

## Implementation notes

- **Second spec.** `e2e/seed.spec.ts` checks the seed helper itself, not a
  layout fact. Without it `seedProjectState` has no caller and no proof. The
  ticket asked for one smoke test; this is the only addition.
- **The wipe is observable.** A fresh browser context is already empty, so the
  smoke test seeds a 137 BPM project before it wipes, and checks the default
  tempo afterwards. Without the seed, a broken wipe would pass unnoticed.
- **Outside the suite.** `src/storage/db.ts` and `src/storage/projectStore.ts`
  export `DB_NAME`, `DB_VERSION` and `CURRENT_KEY`, so the helper cannot drift
  from the app. `src/model/sampler.ts` gets `with { type: 'json' }` on its JSON
  import, the only bare JSON import in the model graph: Node's ESM loader refuses
  the bare form, and the seed helper builds documents from the model.
  `tsconfig.e2e.json` puts the suite under `tsc -b`, so `npm run build`, which
  `build-and-test` also runs, fails on a suite type error too. `@types/node` stays
  out of the app's compile through `"types": []` in `tsconfig.app.json`.
- **Local setup.** Run `npx playwright install chromium` once per machine.
