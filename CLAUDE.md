# Frog

Read [docs/PRD.md](docs/PRD.md) and [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) before changing behaviour or structure.

## Keep the docs growing

With every change, in the same commit:

- **PRD** (`docs/PRD.md`): update the feature's status (Idea → Planned → Built → Live), add or change requirements, add a Changelog line. Move answered items out of "Open questions".
- **Architecture** (`docs/ARCHITECTURE.md`): update the data model, sync, API, storage, deployment or module map if they changed; add a Changelog line.
- **Decisions** (`DECISIONS.md`): one bullet for any non-obvious call and why.
- After deploying, flip **Built** to **Live** in the PRD.

## Checks before committing

`npm test && npm run typecheck && npm run lint && npx prettier --check .`
