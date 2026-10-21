# EB3-03a — Playwright in CI

> Track: v3.0 · Slice 3a of 15
> Blocked by: none — can start immediately
> Blocks: EB3-03b
> Branch: `feat/playwright-ci`
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

- [ ] `npm` script runs the Playwright suite locally against a production build
- [ ] A new CI job runs on every PR to `develop`/`main` and on pushes to them,
      green on this PR
- [ ] Smoke test: fresh project at 1280×720 renders with Play visible
- [ ] State-seeding helper exists and is used by at least the smoke test (wiped
      IndexedDB)
- [ ] `npm test` (Vitest) is unaffected and still green
- [ ] Failure output is useful in CI (trace or screenshot on failure uploaded as
      an artifact)
