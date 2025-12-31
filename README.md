# commit-2026

commit-2026 is a tiny public commitment app: you "commit" who you want to be in 2026, and later view your entries in a git-style log.

This project was entirely vibecoded.

NPM package: https://www.npmjs.com/package/commit-2026?activeTab=readme

## Tech stack

- Cloudflare Workers + Hono for the API
- Cloudflare D1 for storage
- Node.js CLI published to npm (run with `npx commit-2026`)

## Repo layout

- `worker/`: Cloudflare Worker API
- `cli/`: Node.js CLI
