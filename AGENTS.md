# Repository Guidelines

## Project Structure & Module Organization
This repository is a Tauri desktop app for packaging Maven multi-module projects on Windows. Frontend code lives in `src/` and is organized by feature: `components/` for UI panels, `services/` for Tauri bridge and client-side logic, `store/` for Zustand state, `types/` for shared TypeScript models, and `assets/` for static images. Public web assets are in `public/`. The Rust backend is in `src-tauri/src/`, split into `commands/`, `services/`, `repositories/`, and `models/`. Release and updater notes are documented in `docs/` and `CHANGELOG.md`.

## Build, Test, and Development Commands
- `npm install`: install frontend and Tauri JavaScript dependencies.
- `npm run dev`: start the Vite frontend only.
- `npm run tauri:dev`: run the desktop app with the Rust backend attached.
- `npm run build`: type-check TypeScript and build the web bundle into `dist/`.
- `npm run lint`: run ESLint across `src/`.
- `npm run tauri:build`: build the Windows desktop bundle.
- `cargo check --manifest-path src-tauri/Cargo.toml`: fast validation for Rust changes.

## Coding Style & Naming Conventions
TypeScript uses ESLint 9 with `typescript-eslint`, `react-hooks`, and React Refresh rules. Follow the existing style: component files use `PascalCase.tsx`, hooks/stores use `camelCase` with the `use...` prefix, and service utilities use descriptive `camelCase` names such as `buildDiagnosisService.ts`. Rust modules and files use `snake_case`; keep command handlers grouped under `src-tauri/src/commands/`. Match the surrounding file’s formatting when editing; the current codebase mixes compact imports with 2-space indentation in JSX logic.

## Testing Guidelines
There is no committed automated test suite yet. Before opening a PR, run `npm run lint`, `npm run build`, and `cargo check --manifest-path src-tauri/Cargo.toml`. If you add tests, place frontend tests beside the feature or under a dedicated `src/**/__tests__/` folder, and keep Rust unit tests next to the module they cover.

## Commit & Pull Request Guidelines
Recent commits use short, task-focused Chinese subjects such as `性能优化`, `新增git记录`, and `ui调整`. Keep commit titles concise, imperative, and scoped to one change. PRs should describe user-visible behavior, list verification steps, and mention config or schema changes. Include screenshots for UI changes. For release-related PRs, update `CHANGELOG.md`; tagged `v*` releases depend on it.

## Security & Release Notes
Do not commit Tauri signing keys or machine-local secrets. The updater flow expects `TAURI_SIGNING_PRIVATE_KEY` and, in CI, corresponding GitHub Secrets. When changing release behavior, verify `src-tauri/tauri.conf.json`, `package.json`, and `CHANGELOG.md` stay aligned.
