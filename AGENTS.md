## WHAT — Stack & Structure
- Project Name: elevated BPM
- React 19 SPA
- Vercel for Hosting
  **One-liner:** A learning-focused web app for making techno, built as a visually stunning,
  hardware-styled groovebox that is playable from the first click, with a
  goal-checked curriculum woven into the live instrument.
- CI/CD: Github Actions

# Project Concept:
See @CONCEPT.md

# Project Plan:
See @plans/elevated-bpm-v1.md

## Agent Orientation
- Source of truth order: `plans/elevated-bpm-v1.md` for current phase scope, `CONCEPT.md` for project context, `docs/PRD.md` for product intent.
- Keep phase work scoped to the named acceptance criteria. Do not implement later-phase matrix cells or UI behavior unless the AC explicitly requires it.

## Cadences to follow:
1. TDD on any new feature code or bug fixes. Use Test Driven Development whenever possible. See the /tdd skill.
2. Red green refactor. Reference the /tdd skill and follow it

# Git Strategy and Instructions
- Create feature branches off of develop for each new feature or task. Name branches using the format `feat/short-description` (e.g., `feature/spotify-integration`).
- Git Strategy is Git Flow with the following branches:
    - `main` - production ready code
    - `develop` - latest development code, merged from feature branches
    - `feat/*` - individual feature branches created from develop, merged back into develop when complete
    - `release/*` - created from develop when preparing for a release, merged into main
- PRs should be used to merge feature branches into develop, and release branches into main. PRs should be reviewed and approved by me before merging.
- Use Squash and Merge for all PRs to keep a clean commit history.
- Commit messages should follow best practices and use the format: (feat:, chore:, fix:, docs:, refactor:) Examples:
    - `feat: add new widget for genre breakdown`
    - `chore: minor tasks like updating dependencies or fixing typos`
    - `fix: resolve bug in Spotify API integration`
    - `docs: update README with setup instructions`
    - `refactor: service layer redesign`